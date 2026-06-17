import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  Pressable, SafeAreaView, StatusBar, Image, Modal, KeyboardAvoidingView, Switch,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useBudgetStore } from '../store/useBudgetStore';
import { colors, radius, spacing, fontSize, shadows, glows, textShadows } from '../theme';
import { GlassCard } from '../components/GlassCard';
import { exportBackup, importBackup } from '../utils/backup';
import { Bill, CATS, getCatIcon } from '../types';
import { fmt } from '../utils/format';
import * as ImagePicker from 'expo-image-picker';

export function SettingsScreen() {
  const {
    settings, transactions, bgSettings, bills,
    saveSettings, saveBgSettings, clearAll,
    addBill, updateBill, deleteBill, markBillPaid, unmarkBillPaid, getCurrentPeriod,
  } = useBudgetStore();

  const [name,           setName]           = useState(settings.username);
  const [payday,         setPayday]         = useState(String(settings.payday));
  const [savings,        setSavings]        = useState(String(settings.savings));
  const [mealPeriodBgt,  setMealPeriodBgt]  = useState(String(settings.mealPeriodBudget));
  const [bgtGrocery,     setBgtGrocery]     = useState(String(settings.monthlyCategoryBudgets['食材採購']));
  const [bgtDaily,       setBgtDaily]       = useState(String(settings.monthlyCategoryBudgets['日用品']));
  const [bgtFun,         setBgtFun]         = useState(String(settings.monthlyCategoryBudgets['娛樂']));

  // 本期天數（用於計算每日餐費建議）
  const currentPeriod = getCurrentPeriod();
  const cycleDays = Math.max(1, Math.round(
    (new Date(currentPeriod.endStr).getTime() - new Date(currentPeriod.startStr).getTime()) / 86400000,
  ) + 1);
  const [toast,   setToast]   = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // ── 固定帳單管理 ──
  const [showBillModal,  setShowBillModal]  = useState(false);
  const [editingBillId,  setEditingBillId]  = useState<number | null>(null);
  const [billName,       setBillName]       = useState('');
  const [billAmount,     setBillAmount]     = useState('');
  const [billDueDay,     setBillDueDay]     = useState('1');
  const [billCat,        setBillCat]        = useState<Bill['cat']>('其他');
  const [billPaymentMode, setBillPaymentMode] = useState<'manual' | 'auto'>('manual');
  const [confirmUnmarkBillId, setConfirmUnmarkBillId] = useState<number | null>(null);

  useEffect(() => {
    setName(settings.username);
    setPayday(String(settings.payday));
    setSavings(String(settings.savings));
    setMealPeriodBgt(String(settings.mealPeriodBudget));
    setBgtGrocery(String(settings.monthlyCategoryBudgets['食材採購']));
    setBgtDaily(String(settings.monthlyCategoryBudgets['日用品']));
    setBgtFun(String(settings.monthlyCategoryBudgets['娛樂']));
  }, [settings]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleSave = () => {
    const pd = Math.min(28, Math.max(1, parseInt(payday) || 5));
    const sv = parseFloat(savings) || 0;
    saveSettings({
      username:         name.trim() || '我',
      payday:           pd,
      savings:          sv,
      mealPeriodBudget: parseInt(mealPeriodBgt) || 9000,
      monthlyCategoryBudgets: {
        食材採購: parseInt(bgtGrocery) || 6000,
        日用品:   parseInt(bgtDaily)   || 2000,
        娛樂:     parseInt(bgtFun)     || 3000,
      },
    });
    showToast('✅ 設定已儲存');
  };

  // ── 完整資料備份 / 還原（含設定、存款、桌布等所有資料）──
  const handleBackup = async () => {
    showToast('⏳ 產生備份中…');
    const msg = await exportBackup();
    showToast(msg);
  };

  const handleRestore = async () => {
    showToast('⏳ 還原中…');
    const msg = await importBackup();
    showToast(msg);
  };

  // ── 背景圖 ──
  const handlePickBg = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showToast('⚠️ 需要相片權限才能選取背景圖'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
    });
    if (result.canceled) return;
    saveBgSettings({ ...bgSettings, fileUri: result.assets[0].uri, opacity: bgSettings.opacity });
    showToast('✅ 背景圖已更新');
  };

  const handleRemoveBg = () => {
    saveBgSettings({ ...bgSettings, fileUri: null, opacity: bgSettings.opacity });
    showToast('🗑️ 已移除背景圖');
  };

  const handleSetOpacity = (val: number) => {
    saveBgSettings({ ...bgSettings, fileUri: bgSettings.fileUri, opacity: val });
  };

  const handleClearAll = () => {
    clearAll();
    setShowClearConfirm(false);
    showToast('🗑️ 已清除所有記錄');
  };

  // ── 固定帳單管理 ──
  const guessBillCat = (name: string): Bill['cat'] => {
    if (/車貸|貸款|分期|信貸|房貸/.test(name)) return '貸款';
    if (/0050|ETF|定期定額|股票|投資|基金/.test(name)) return '投資';
    return '其他必要支出';
  };

  const openAddBillModal = () => {
    setEditingBillId(null);
    setBillName(''); setBillAmount(''); setBillDueDay('1');
    setBillCat('其他必要支出'); setBillPaymentMode('manual');
    setShowBillModal(true);
  };

  const openEditBillModal = (bill: Bill) => {
    setEditingBillId(bill.id);
    setBillName(bill.name);
    setBillAmount(String(bill.amount));
    setBillDueDay(String(bill.dueDay));
    setBillCat(bill.cat);
    setBillPaymentMode(bill.paymentMode ?? (bill.autoDeduct ? 'auto' : 'manual'));
    setShowBillModal(true);
  };

  const handleSaveBill = () => {
    const amount = parseFloat(billAmount);
    const dueDay = Math.min(28, Math.max(1, parseInt(billDueDay) || 1));
    if (!billName.trim()) { showToast('❌ 請輸入帳單名稱'); return; }
    if (!amount || amount <= 0) { showToast('❌ 請輸入有效金額'); return; }

    const isAuto = billPaymentMode === 'auto';
    if (editingBillId !== null) {
      updateBill(editingBillId, { name: billName.trim(), amount, dueDay, cat: billCat, paymentMode: billPaymentMode, autoDeduct: isAuto });
      showToast('✅ 帳單已更新');
    } else {
      addBill({ name: billName.trim(), amount, dueDay, cat: billCat, paymentMode: billPaymentMode, autoDeduct: isAuto });
      showToast('✅ 已新增帳單');
    }
    setShowBillModal(false);
  };

  const handleDeleteBill = (id: number) => {
    deleteBill(id);
    showToast('🗑️ 已刪除帳單');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>設定</Text>
        </View>

        {/* 個人資料 */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>個人資料</Text>
          <View style={styles.row}>
            <Feather name="user" size={20} color="#64748B" style={styles.rowIcon} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>姓名</Text>
              <Text style={styles.rowSub}>首頁問候語</Text>
            </View>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="輸入姓名"
              maxLength={10}
            />
          </View>
        </GlassCard>

        {/* 記帳週期與財務 */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>記帳週期與財務</Text>
          <View style={styles.row}>
            <Feather name="calendar" size={20} color="#64748B" style={styles.rowIcon} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>發薪日</Text>
              <Text style={styles.rowSub}>週期從此日開始（1~28）</Text>
            </View>
            <TextInput
              style={styles.input}
              value={payday}
              onChangeText={setPayday}
              keyboardType="numeric"
              maxLength={2}
            />
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <Feather name="database" size={20} color="#64748B" style={styles.rowIcon} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>當前存款</Text>
              <Text style={styles.rowSub}>NT$</Text>
            </View>
            <TextInput
              style={styles.input}
              value={savings}
              onChangeText={setSavings}
              keyboardType="numeric"
            />
          </View>
          {/* ── 本期餐費預算 */}
          <View style={[styles.row, styles.rowBorder]}>
            <Feather name="coffee" size={20} color="#64748B" style={styles.rowIcon} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>本期餐費預算</Text>
              <Text style={styles.rowSub}>
                每日約 NT${Math.round((parseInt(mealPeriodBgt) || 9000) / cycleDays).toLocaleString('zh-TW')}（本期 {cycleDays} 天）
              </Text>
            </View>
            <TextInput
              style={styles.input}
              value={mealPeriodBgt}
              onChangeText={setMealPeriodBgt}
              keyboardType="numeric"
            />
          </View>

          {/* ── 每月生活預算 */}
          <View style={[styles.row, styles.rowBorder]}>
            <Feather name="grid" size={20} color="#64748B" style={styles.rowIcon} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>每月生活預算</Text>
              <Text style={styles.rowSub}>食材採購 ／ 日用品 ／ 娛樂</Text>
            </View>
          </View>
          {([
            { label: '🥬 食材採購', val: bgtGrocery, set: setBgtGrocery },
            { label: '🧺 日用品',   val: bgtDaily,   set: setBgtDaily   },
            { label: '🎮 娛樂',     val: bgtFun,     set: setBgtFun     },
          ] as const).map(item => (
            <View key={item.label} style={styles.budgetSubRow}>
              <Text style={styles.budgetSubLabel}>{item.label}</Text>
              <TextInput
                style={styles.input}
                value={item.val}
                onChangeText={item.set}
                keyboardType="numeric"
              />
            </View>
          ))}
          <View style={styles.budgetTotalRow}>
            <Text style={styles.budgetTotalLabel}>生活預算合計</Text>
            <Text style={styles.budgetTotalValue}>
              NT${(
                (parseInt(bgtGrocery) || 0) +
                (parseInt(bgtDaily)   || 0) +
                (parseInt(bgtFun)     || 0)
              ).toLocaleString('zh-TW')}
            </Text>
          </View>
          <Pressable style={styles.saveBtn} onPress={handleSave}>
            <View style={styles.btnInner}>
              <Feather name="check" size={17} color={colors.income} />
              <Text style={styles.saveBtnText}>套用設定</Text>
            </View>
          </Pressable>
        </GlassCard>

        {/* 資料管理 */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>資料管理</Text>
          <View style={styles.row}>
            <Feather name="archive" size={20} color="#64748B" style={styles.rowIcon} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>記錄筆數</Text>
              <Text style={styles.rowSub}>{transactions.length} 筆</Text>
            </View>
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <Feather name="lock" size={20} color="#64748B" style={styles.rowIcon} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>自動儲存</Text>
              <Text style={styles.rowSub}>每次記帳自動存入裝置</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>開啟</Text>
            </View>
          </View>
        </GlassCard>

        {/* 固定帳單管理 */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>固定帳單管理</Text>

          {bills.length === 0 ? (
            <Text style={styles.bgEmptyText}>尚未新增固定帳單</Text>
          ) : (
            bills.map((bill, idx) => {
              const paid = bill.paidPeriods.includes(getCurrentPeriod().startStr);
              return (
                <View key={bill.id} style={[styles.row, idx > 0 && styles.rowBorder]}>
                  <Text style={[styles.rowIcon, { fontSize: 20 }, paid && styles.billPaidDim]}>{getCatIcon(bill.cat)}</Text>
                  <View style={styles.rowInfo}>
                    <Text style={[styles.rowLabel, paid && styles.billPaidDim]}>{bill.name}</Text>
                    <Text style={[styles.rowSub, paid && styles.billPaidDim]}>
                      每月 {bill.dueDay} 日 · {fmt(bill.amount)}{(bill.paymentMode ?? (bill.autoDeduct ? 'auto' : 'manual')) === 'auto' ? ' · 自動扣繳' : ' · 手動繳費'}
                    </Text>
                  </View>
                  <Switch
                    value={paid}
                    onValueChange={(v) => (v ? markBillPaid(bill.id) : setConfirmUnmarkBillId(bill.id))}
                    trackColor={{ false: '#E2E8F0', true: 'rgba(52,211,153,0.5)' }}
                    thumbColor={paid ? colors.income : '#F1F5F9'}
                    style={{ marginRight: spacing.md }}
                  />
                  <Pressable onPress={() => openEditBillModal(bill)} hitSlop={8} style={{ marginRight: spacing.md }}>
                    <Feather name="edit-2" size={18} color="#64748B" />
                  </Pressable>
                  <Pressable onPress={() => handleDeleteBill(bill.id)} hitSlop={8}>
                    <Feather name="trash-2" size={18} color={colors.expense} />
                  </Pressable>
                </View>
              );
            })
          )}

          <Pressable style={[styles.actionBtn, styles.actionBtnPurple, { marginTop: spacing.lg }]} onPress={openAddBillModal}>
            <View style={styles.btnInner}>
              <Feather name="plus-circle" size={18} color={colors.savings} />
              <Text style={[styles.actionBtnText, { color: colors.savings }]}>新增固定帳單</Text>
            </View>
          </Pressable>
        </GlassCard>

        {/* 背景主題 */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>背景主題</Text>

          {/* 預覽縮圖 */}
          {bgSettings.fileUri ? (
            <View style={styles.bgPreviewWrap}>
              <Image source={{ uri: bgSettings.fileUri }} style={styles.bgPreview} resizeMode="cover" />
              <View style={styles.bgPreviewOverlay} pointerEvents="none">
                <Text style={styles.bgPreviewLabel}>目前背景</Text>
              </View>
              {/* 白色內描邊：模擬嵌入式小螢幕 */}
              <View style={styles.bgPreviewInnerBorder} pointerEvents="none" />
            </View>
          ) : (
            <View style={styles.bgEmpty}>
              <Feather name="image" size={28} color="#bbb" />
              <Text style={[styles.bgEmptyText, { marginTop: 6 }]}>尚未設定背景圖</Text>
            </View>
          )}

          {/* 選取 / 移除按鈕 */}
          <View style={styles.bgBtnRow}>
            <Pressable style={[styles.bgBtn, styles.bgBtnPick]} onPress={handlePickBg}>
              <View style={styles.btnInner}>
                <Feather name="image" size={16} color={colors.textSecondary} />
                <Text style={[styles.bgBtnText, { color: colors.textSecondary }]}>選取相片</Text>
              </View>
            </Pressable>
            {bgSettings.fileUri && (
              <Pressable style={[styles.bgBtn, styles.bgBtnRemove]} onPress={handleRemoveBg}>
                <View style={styles.btnInner}>
                  <Feather name="x" size={16} color={colors.expense} />
                  <Text style={[styles.bgBtnText, { color: colors.expense }]}>移除</Text>
                </View>
              </Pressable>
            )}
          </View>

          {/* 透明度 */}
          <View style={[styles.row, styles.rowBorder]}>
            <Feather name="sliders" size={20} color="#64748B" style={styles.rowIcon} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>背景透明度</Text>
              <Text style={styles.rowSub}>數值越低越淡</Text>
            </View>
          </View>
          <View style={styles.opacityRow}>
            {[20, 35, 50, 65, 80, 100].map(v => (
              <Pressable
                key={v}
                style={[styles.opacityBtn, bgSettings.opacity === v && styles.opacityBtnActive]}
                onPress={() => handleSetOpacity(v)}
              >
                <Text style={[styles.opacityBtnText, bgSettings.opacity === v && styles.opacityBtnTextActive]}>
                  {v}%
                </Text>
              </Pressable>
            ))}
          </View>

          {/* 文字顏色模式 */}
          <View style={[styles.row, styles.rowBorder]}>
            <Feather name="type" size={20} color="#64748B" style={styles.rowIcon} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>首頁文字顏色</Text>
              <Text style={styles.rowSub}>依桌布亮度切換</Text>
            </View>
          </View>
          <View style={styles.textModeRow}>
            {(['dark', 'light'] as const).map(mode => {
              const active = bgSettings.textMode === mode;
              return (
                <Pressable
                  key={mode}
                  style={[styles.textModeBtn, active && styles.textModeBtnActive]}
                  onPress={() => saveBgSettings({ ...bgSettings, textMode: mode })}
                >
                  <Text style={{ fontSize: 16, marginRight: 6 }}>
                    {mode === 'dark' ? '⚫' : '⚪'}
                  </Text>
                  <Text style={[styles.textModeBtnText, active && styles.textModeBtnTextActive]}>
                    {mode === 'dark' ? '深色文字' : '淺色文字'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </GlassCard>

        {/* 匯出 / 匯入 */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>備份與還原</Text>
          <Pressable style={[styles.actionBtn, styles.actionBtnPurple]} onPress={handleBackup}>
            <View style={styles.btnInner}>
              <Feather name="database" size={18} color={colors.savings} />
              <Text style={[styles.actionBtnText, { color: colors.savings }]}>匯出完整備份</Text>
            </View>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.actionBtnPurple, { marginTop: 10 }]} onPress={handleRestore}>
            <View style={styles.btnInner}>
              <Feather name="rotate-ccw" size={18} color={colors.savings} />
              <Text style={[styles.actionBtnText, { color: colors.savings }]}>還原完整備份</Text>
            </View>
          </Pressable>
        </GlassCard>

        {/* 危險區域 */}
        <GlassCard style={styles.section}>
          <Text style={styles.sectionTitle}>危險操作</Text>
          {!showClearConfirm ? (
            <Pressable style={[styles.actionBtn, styles.actionBtnGhost]} onPress={() => setShowClearConfirm(true)}>
              <View style={styles.btnInner}>
                <Feather name="trash-2" size={18} color={colors.expense} />
                <Text style={[styles.actionBtnText, { color: colors.expense }]}>清除全部記錄</Text>
              </View>
            </Pressable>
          ) : (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmText}>確定要清除所有記帳記錄？此操作無法復原。</Text>
              <View style={styles.confirmBtns}>
                <Pressable style={styles.cancelBtn} onPress={() => setShowClearConfirm(false)}>
                  <Text style={styles.cancelBtnText}>取消</Text>
                </Pressable>
                <Pressable style={[styles.confirmBtn, { backgroundColor: '#B71C1C' }]} onPress={handleClearAll}>
                  <Text style={styles.confirmBtnText}>確認清除</Text>
                </Pressable>
              </View>
            </View>
          )}
        </GlassCard>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Toast */}
      {!!toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* ════════════════════════════════════
          新增 / 編輯固定帳單 Modal
      ════════════════════════════════════ */}
      <Modal
        visible={showBillModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBillModal(false)}
      >
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowBillModal(false)} />
          <View style={styles.billModalBox}>
            <View style={styles.dragHandle} />
            <View style={styles.modalTitleRow}>
              <Feather name="file-text" size={18} color={colors.savings} />
              <Text style={styles.modalTitle}>{editingBillId !== null ? '編輯帳單' : '新增帳單'}</Text>
            </View>

            <TextInput
              style={styles.billInput}
              placeholder="帳單名稱（例如：房租）"
              placeholderTextColor="#94A3B8"
              value={billName}
              onChangeText={name => {
                setBillName(name);
                // 新增時才自動推斷分類
                if (editingBillId === null) setBillCat(guessBillCat(name));
              }}
            />
            <View style={styles.billRow2}>
              <TextInput
                style={[styles.billInput, { flex: 1 }]}
                placeholder="金額 NT$"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={billAmount}
                onChangeText={setBillAmount}
              />
              <TextInput
                style={[styles.billInput, { width: 100 }]}
                placeholder="每月幾號"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                maxLength={2}
                value={billDueDay}
                onChangeText={setBillDueDay}
              />
            </View>

            {/* 類別選擇 */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
              {CATS.expense.map(c => (
                <Pressable
                  key={c.n}
                  style={[styles.catChip, billCat === c.n && styles.catChipActive]}
                  onPress={() => setBillCat(c.n)}
                >
                  <Text style={styles.catChipText}>{c.e} {c.n}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* 付款方式 */}
            <View style={styles.textModeRow}>
              {(['manual', 'auto'] as const).map(mode => {
                const active = billPaymentMode === mode;
                return (
                  <Pressable
                    key={mode}
                    style={[styles.textModeBtn, active && styles.textModeBtnActive]}
                    onPress={() => setBillPaymentMode(mode)}
                  >
                    <Text style={[styles.textModeBtnText, active && styles.textModeBtnTextActive]}>
                      {mode === 'auto' ? '🔄 自動扣繳' : '✋ 手動繳費'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable style={[styles.submitBtn, { backgroundColor: colors.savings }]} onPress={handleSaveBill}>
              <Text style={styles.submitBtnText}>{editingBillId !== null ? '儲存變更' : '新增帳單'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════
          取消已繳費確認 Modal
      ════════════════════════════════════ */}
      <Modal
        visible={confirmUnmarkBillId !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setConfirmUnmarkBillId(null)}
      >
        <View style={styles.centerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmUnmarkBillId(null)} />
          <View style={styles.unmarkConfirmBox}>
            <Text style={styles.unmarkConfirmText}>確定要將此帳單改回「未繳費」嗎？本期相關的交易記錄將會被刪除。</Text>
            <View style={styles.confirmBtns}>
              <Pressable style={styles.cancelBtn} onPress={() => setConfirmUnmarkBillId(null)}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: '#B71C1C' }]}
                onPress={() => {
                  if (confirmUnmarkBillId !== null) unmarkBillPaid(confirmUnmarkBillId);
                  setConfirmUnmarkBillId(null);
                }}
              >
                <Text style={styles.confirmBtnText}>確認</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.appBg },
  scroll:  { flex: 1 },
  content: { paddingBottom: spacing.xxl },

  header:       { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  headerTitle:  { fontSize: fontSize.h1, fontWeight: '700', color: colors.textPrimary },

  section: {
    marginHorizontal: spacing.lg,
    marginBottom:     spacing.lg,
    padding:          spacing.xl,
    // backgroundColor / border 由 GlassCard 的 Skia 底板負責
  },
  sectionTitle: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 0.5, marginBottom: spacing.lg, textTransform: 'uppercase',
  },

  row:        { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowBorder:  { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  rowIcon:    { width: 36, textAlign: 'center' },
  btnInner:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowInfo:    { flex: 1 },
  rowLabel:   { fontSize: fontSize.lg, fontWeight: '600', color: colors.textPrimary },
  rowSub:     { fontSize: fontSize.base, color: colors.textMuted, marginTop: 2 },
  billPaidDim: { opacity: 0.4 },

  input: {
    borderBottomWidth: 2, borderBottomColor: 'rgba(0,0,0,0.09)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: fontSize.lg, fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.03)', width: 110, textAlign: 'right',
    color: colors.textPrimary,
  },

  badge: {
    backgroundColor: 'rgba(0,230,118,0.15)', borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderWidth: 1, borderColor: 'rgba(0,230,118,0.3)',
  },
  badgeText: { fontSize: fontSize.base, fontWeight: '600', color: colors.income },

  saveBtn: {
    marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: 'rgba(52,211,153,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(52,211,153,0.40)',
  },
  saveBtnText: { color: colors.income, fontSize: fontSize.xl, fontWeight: '700', ...textShadows.light },

  actionBtn:      { padding: spacing.lg, borderRadius: radius.md, alignItems: 'center', borderWidth: 1.5 },
  actionBtnGhost: { backgroundColor: 'rgba(244,114,182,0.10)', borderColor: 'rgba(244,114,182,0.35)' },
  actionBtnPurple: { backgroundColor: 'rgba(167,139,250,0.12)', borderColor: 'rgba(167,139,250,0.35)' },
  actionBtnText:  { fontSize: fontSize.xl, fontWeight: '700', ...textShadows.light },

  centerOverlay: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: spacing.xxl,
  },
  confirmBox: {
    backgroundColor: 'rgba(251,113,133,0.1)', borderRadius: radius.sm,
    padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(251,113,133,0.3)',
  },
  unmarkConfirmBox: {
    backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    width: '100%',
  },
  unmarkConfirmText: { fontSize: fontSize.lg, color: colors.textPrimary, marginBottom: spacing.md, lineHeight: 20 },
  confirmText: { fontSize: fontSize.lg, color: colors.expense, marginBottom: spacing.md, lineHeight: 20 },
  confirmBtns: { flexDirection: 'row', gap: spacing.md },
  cancelBtn:   { flex: 1, padding: spacing.md, borderRadius: radius.sm, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', backgroundColor: 'rgba(255,255,255,0.6)' },
  cancelBtnText:  { fontSize: fontSize.lg, fontWeight: '600', color: colors.textSecondary },
  confirmBtn:  { flex: 1, padding: spacing.md, borderRadius: radius.sm, alignItems: 'center' },
  confirmBtnText: { color: colors.textWhite, fontSize: fontSize.lg, fontWeight: '700' },

  // ── 背景主題 ──
  bgPreviewWrap: {
    borderRadius: radius.sm, overflow: 'hidden', height: 130, marginBottom: spacing.md,
  },
  bgPreview: { flex: 1, height: 130 },
  bgPreviewOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: spacing.sm,
  },
  bgPreviewLabel: { color: colors.textWhite, fontSize: fontSize.base, fontWeight: '600' },
  bgEmpty: {
    height: 80, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderStyle: 'dashed',
  },
  bgEmptyText: { color: colors.textHint, fontSize: fontSize.lg },
  bgBtnRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xs },
  bgBtn:       { flex: 1, padding: spacing.md, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  bgBtnPick:   { backgroundColor: 'rgba(71,85,105,0.10)', borderColor: 'rgba(71,85,105,0.25)' },
  bgBtnRemove: { backgroundColor: 'rgba(244,114,182,0.10)', borderColor: 'rgba(244,114,182,0.35)' },
  bgBtnText:   { fontSize: fontSize.lg, fontWeight: '700' },

  bgPreviewInnerBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: radius.sm,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)',
  },

  opacityRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: spacing.md },
  opacityBtn: {
    flex: 1, minWidth: 48, paddingVertical: spacing.sm, borderRadius: radius.sm,
    alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  },
  opacityBtnActive: { backgroundColor: 'rgba(52,211,153,0.20)', borderColor: colors.income },
  opacityBtnText:       { fontSize: fontSize.md, fontWeight: '600', color: colors.textSecondary },
  opacityBtnTextActive: { color: colors.income, fontWeight: '700' },

  // 文字顏色切換
  textModeRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  textModeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.08)',
  },
  textModeBtnActive:     { backgroundColor: 'rgba(55,71,79,0.85)', borderColor: 'rgba(55,71,79,0.6)' },
  textModeBtnText:       { fontSize: fontSize.md, fontWeight: '600', color: colors.textSecondary },
  textModeBtnTextActive: { color: colors.textWhite },

  budgetSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingLeft: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  budgetSubLabel: {
    fontSize: fontSize.lg,
    fontWeight: '500',
    color: colors.textPrimary,
    flex: 1,
  },
  budgetTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingLeft: 52,
    paddingRight: 4,
    marginTop: 2,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(0,0,0,0.10)',
  },
  budgetTotalLabel: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  budgetTotalValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.savings,
    fontFamily: 'monospace',
  },

  toast: {
    position: 'absolute', bottom: 90, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.pill,
  },
  toastText: { color: colors.textWhite, fontSize: fontSize.lg },

  // ── 固定帳單 Modal ──
  billModalBox: {
    backgroundColor:      'rgba(255,255,255,0.96)',
    borderTopLeftRadius:  radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: 22,
    paddingBottom: 40,
    borderWidth:   1,
    borderColor:   'rgba(255,255,255,0.80)',
  },
  dragHandle:    { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  modalTitle:    { fontSize: fontSize.h2, fontWeight: '700', color: colors.textPrimary },
  billInput: {
    borderRadius: radius.lg, padding: spacing.lg, fontSize: fontSize.lg,
    marginBottom: spacing.lg, backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', color: colors.textPrimary,
  },
  billRow2: { flexDirection: 'row', gap: spacing.md },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, marginRight: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.07)',
  },
  catChipActive: {
    backgroundColor: 'rgba(167,139,250,0.18)',
    borderWidth: 1.5, borderColor: colors.savings,
  },
  catChipText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  submitBtn:     { padding: 16, borderRadius: radius.lg, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: colors.textWhite, fontSize: fontSize.h3, fontWeight: '700', letterSpacing: 0.5 },
});
