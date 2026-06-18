/**
 * SettingsScreen — 設定中心
 *
 * 分區：個人化 → 週期與存款 → 預算設定 → 固定帳單管理
 *       → 背景主題（可收合）→ 資料管理 → 備份與還原 → 危險操作
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  Pressable, SafeAreaView, StatusBar, Image, Modal,
  KeyboardAvoidingView, Switch, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useBudgetStore }  from '../store/useBudgetStore';
import { colors, radius, spacing, fontSize, textShadows } from '../theme';
import { GlassCard }       from '../components/GlassCard';
import { exportBackup, importBackup } from '../utils/backup';
import {
  Bill, CATS, getCatIcon, getBillPaymentMode, periodKey, normalizeCategory, MarketHoliday,
} from '../types';
import { fetchTaiwanHolidayData } from '../utils/holidays';
import { fmt } from '../utils/format';
import { localDateStr, getBillDueDate } from '../utils/period';
import * as ImagePicker from 'expo-image-picker';

// ── 帳單分類 badge 顏色 ──────────────────────────
function catBadgeStyle(cat: string) {
  const n = normalizeCategory(cat);
  if (n === '貸款')      return { bg: 'rgba(244,114,182,0.15)', text: '#E44D7B' };
  if (n === '投資')      return { bg: 'rgba(52,211,153,0.15)',  text: '#0DA271' };
  if (n === '保險')      return { bg: 'rgba(56,189,248,0.15)',  text: '#0284C7' };
  if (n === '稅金')      return { bg: 'rgba(251,191,36,0.15)',  text: '#B45309' };
  if (n === '存款')      return { bg: 'rgba(167,139,250,0.15)', text: '#7C3AED' };
  return                        { bg: 'rgba(100,116,139,0.12)', text: '#475569' };
}

export function SettingsScreen() {
  const insets     = useSafeAreaInsets();
  const safeBottom = Platform.OS === 'android'
    ? Math.max(insets.bottom, 24)
    : Math.max(insets.bottom, 12);

  const {
    settings, transactions, bgSettings, bills,
    saveSettings, saveBgSettings, clearAll,
    addBill, updateBill, deleteBill, markBillPaid, unmarkBillPaid, getCurrentPeriod,
    updateRemoteMarketHolidays,
  } = useBudgetStore();

  // ── 個人化 + 週期 + 存款 ──
  const [name,          setName]          = useState(settings.username);
  const [payday,        setPayday]        = useState(String(settings.payday));
  const [savings,       setSavings]       = useState(String(settings.savings));
  // ── 預算 ──
  const [mealPeriodBgt, setMealPeriodBgt] = useState(String(settings.mealPeriodBudget));
  const [bgtGrocery,    setBgtGrocery]    = useState(String(settings.monthlyCategoryBudgets['食材採購']));
  const [bgtDaily,      setBgtDaily]      = useState(String(settings.monthlyCategoryBudgets['日用品']));
  const [bgtFun,        setBgtFun]        = useState(String(settings.monthlyCategoryBudgets['娛樂']));
  // ── UI 狀態 ──
  const [toast,         setToast]         = useState('');
  const [showBgDetails, setShowBgDetails] = useState(false);
  const [clearStep,     setClearStep]     = useState(0);   // 0=hidden 1=warn 2=type
  const [clearInput,    setClearInput]    = useState('');
  // ── 固定帳單 Modal ──
  const [showBillModal,        setShowBillModal]        = useState(false);
  const [editingBillId,        setEditingBillId]        = useState<number | null>(null);
  const [billName,             setBillName]             = useState('');
  const [billAmount,           setBillAmount]           = useState('');
  const [billDueDay,           setBillDueDay]           = useState('1');
  const [billCat,              setBillCat]              = useState<string>('其他必要支出');
  const [billPaymentMode,      setBillPaymentMode]      = useState<'manual' | 'auto'>('manual');
  const [billPaymentRule,      setBillPaymentRule]      = useState<'fixedDate' | 'tPlusBusinessDays'>('fixedDate');
  const [billSettlementDays,   setBillSettlementDays]   = useState('2');
  const [billRemindDays,       setBillRemindDays]       = useState('3');
  const [confirmUnmarkBillId,  setConfirmUnmarkBillId]  = useState<number | null>(null);
  // ── 休市日 ──
  const [fetchingHolidays, setFetchingHolidays] = useState(false);

  // 本期資訊
  const currentPeriod = getCurrentPeriod();
  const cycleDays = Math.max(1, Math.round(
    (new Date(currentPeriod.endStr).getTime() - new Date(currentPeriod.startStr).getTime()) / 86400000,
  ) + 1);
  const pKey     = periodKey(currentPeriod.startStr);
  const todayStr = localDateStr(new Date());

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

  // ── 備份 ──
  const handleBackup  = async () => { showToast('⏳ 產生備份中…'); showToast(await exportBackup()); };
  const handleRestore = async () => { showToast('⏳ 還原中…');   showToast(await importBackup()); };

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
    saveBgSettings({ ...bgSettings, fileUri: result.assets[0].uri });
    showToast('✅ 背景圖已更新');
  };
  const handleRemoveBg  = () => { saveBgSettings({ ...bgSettings, fileUri: null }); showToast('🗑️ 已移除背景圖'); };
  const handleSetOpacity = (val: number) => saveBgSettings({ ...bgSettings, opacity: val });

  // ── 清除全部 ──
  const handleClearAll = () => {
    clearAll();
    setClearStep(0);
    setClearInput('');
    showToast('🗑️ 已清除所有記錄');
  };

  // ── 固定帳單 ──
  const guessBillCat = (n: string): string => {
    if (/車貸|貸款|分期|信貸|房貸/.test(n)) return '貸款';
    if (/0050|ETF|定期定額|股票|投資|基金/.test(n)) return '投資';
    if (/保險/.test(n)) return '保險';
    if (/稅/.test(n))  return '稅金';
    return '其他必要支出';
  };

  const openAddBillModal = () => {
    setEditingBillId(null);
    setBillName(''); setBillAmount(''); setBillDueDay('1');
    setBillCat('其他必要支出'); setBillPaymentMode('manual');
    setBillPaymentRule('fixedDate'); setBillSettlementDays('2'); setBillRemindDays('3');
    setShowBillModal(true);
  };
  const openEditBillModal = (bill: Bill) => {
    setEditingBillId(bill.id);
    setBillName(bill.name);
    setBillAmount(String(bill.amount));
    setBillDueDay(String(bill.dueDay));
    setBillCat(bill.cat);
    setBillPaymentMode(getBillPaymentMode(bill));
    setBillPaymentRule(bill.paymentRule ?? 'fixedDate');
    setBillSettlementDays(String(bill.settlementBusinessDays ?? 2));
    setBillRemindDays(String(bill.remindDaysBefore ?? 3));
    setShowBillModal(true);
  };
  // ── 休市日 handlers ──
  const handleFetchHolidays = async () => {
    setFetchingHolidays(true);
    try {
      const year = new Date().getFullYear();
      const data = await fetchTaiwanHolidayData(year);
      if (data.length === 0) throw new Error('未取得任何休市日資料，請稍後再試。');
      updateRemoteMarketHolidays(year, data);
      showToast(`✅ 已更新 ${data.length} 筆 ${year} 年休市日資料`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '請確認網路連線後再試。';
      Alert.alert('更新失敗', `無法取得休市日資料，已保留原本資料。\n\n${msg}`);
    } finally {
      setFetchingHolidays(false);
    }
  };

const handleSaveBill = () => {
    const amount      = parseFloat(billAmount);
    const dueDay      = Math.min(28, Math.max(1, parseInt(billDueDay) || 1));
    const remindDays  = Math.min(14, Math.max(1, parseInt(billRemindDays) || 3));
    const settleDays  = Math.min(5, Math.max(1, parseInt(billSettlementDays) || 2));
    if (!billName.trim())         { showToast('❌ 請輸入帳單名稱'); return; }
    if (!amount || amount <= 0)   { showToast('❌ 請輸入有效金額'); return; }
    const isAuto   = billPaymentMode === 'auto';
    const extraFields = {
      paymentRule:           billPaymentRule,
      settlementBusinessDays: billPaymentRule === 'tPlusBusinessDays' ? settleDays : undefined,
      remindDaysBefore:      remindDays,
    };
    if (editingBillId !== null) {
      updateBill(editingBillId, {
        name: billName.trim(), amount, dueDay, cat: billCat,
        paymentMode: billPaymentMode, autoDeduct: isAuto, ...extraFields,
      });
      showToast('✅ 帳單已更新');
    } else {
      addBill({
        name: billName.trim(), amount, dueDay, cat: billCat,
        paymentMode: billPaymentMode, autoDeduct: isAuto, ...extraFields,
      });
      showToast('✅ 已新增帳單');
    }
    setShowBillModal(false);
  };

  // ── 生活預算合計 ──
  const lifeBudgetTotal = (parseInt(bgtGrocery) || 0) + (parseInt(bgtDaily) || 0) + (parseInt(bgtFun) || 0);

  return (
    <SafeAreaView style={sty.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={sty.scroll}
        contentContainerStyle={sty.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={sty.header}>
          <Text style={sty.headerSub}>管理</Text>
          <Text style={sty.headerTitle}>設定</Text>
        </View>

        {/* ════════════════════
            1. 個人化
        ════════════════════ */}
        <GlassCard style={sty.section}>
          <SectionTitle icon="user" title="個人化" />
          <View style={sty.fieldRow}>
            <View style={sty.fieldInfo}>
              <Text style={sty.fieldLabel}>你的名字</Text>
              <Text style={sty.fieldSub}>首頁問候語會使用這個名稱</Text>
            </View>
            <TextInput
              style={sty.input}
              value={name}
              onChangeText={setName}
              placeholder="輸入姓名"
              maxLength={10}
            />
          </View>
          <SaveBtn onPress={handleSave} label="儲存" />
        </GlassCard>

        {/* ════════════════════
            2. 週期與存款
        ════════════════════ */}
        <GlassCard style={sty.section}>
          <SectionTitle icon="calendar" title="週期與存款" />
          <View style={sty.fieldRow}>
            <View style={sty.fieldInfo}>
              <Text style={sty.fieldLabel}>發薪日</Text>
              <Text style={sty.fieldSub}>每月幾號開始記帳週期（1–28）</Text>
            </View>
            <TextInput
              style={sty.input}
              value={payday}
              onChangeText={setPayday}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
          <View style={[sty.fieldRow, sty.rowBorder]}>
            <View style={sty.fieldInfo}>
              <Text style={sty.fieldLabel}>當前存款基準</Text>
              <Text style={sty.fieldSub}>首頁存款 = 基準 + 本期結餘</Text>
            </View>
            <TextInput
              style={sty.input}
              value={savings}
              onChangeText={setSavings}
              keyboardType="decimal-pad"
            />
          </View>
          <SaveBtn onPress={handleSave} label="儲存週期與存款" />
        </GlassCard>

        {/* ════════════════════
            3. 預算設定
        ════════════════════ */}
        <GlassCard style={sty.section}>
          <SectionTitle icon="pie-chart" title="預算設定" />

          {/* 餐費 */}
          <View style={sty.fieldRow}>
            <View style={sty.fieldInfo}>
              <Text style={sty.fieldLabel}>🍽️ 本期餐費預算</Text>
              <Text style={sty.fieldSub}>
                每日約 NT${Math.round((parseInt(mealPeriodBgt)||9000) / cycleDays).toLocaleString('zh-TW')}（本期 {cycleDays} 天）
              </Text>
            </View>
            <TextInput
              style={sty.input}
              value={mealPeriodBgt}
              onChangeText={setMealPeriodBgt}
              keyboardType="number-pad"
            />
          </View>

          {/* 生活預算小標 */}
          <View style={[sty.fieldRow, sty.rowBorder]}>
            <View style={sty.fieldInfo}>
              <Text style={sty.fieldLabel}>生活預算</Text>
              <Text style={sty.fieldSub}>食材採購 ／ 日用品 ／ 娛樂（各自獨立設定）</Text>
            </View>
          </View>

          {([
            { label: '🥬 食材採購', val: bgtGrocery, set: setBgtGrocery },
            { label: '🧺 日用品',   val: bgtDaily,   set: setBgtDaily   },
            { label: '🎮 娛樂',     val: bgtFun,     set: setBgtFun     },
          ] as const).map(item => (
            <View key={item.label} style={sty.budgetSubRow}>
              <Text style={sty.budgetSubLabel}>{item.label}</Text>
              <TextInput
                style={sty.input}
                value={item.val}
                onChangeText={item.set}
                keyboardType="number-pad"
              />
            </View>
          ))}

          <View style={sty.budgetTotalRow}>
            <Text style={sty.budgetTotalLabel}>生活預算合計</Text>
            <Text style={sty.budgetTotalValue}>
              NT${lifeBudgetTotal.toLocaleString('zh-TW')}
            </Text>
          </View>
          <SaveBtn onPress={handleSave} label="儲存預算" />
        </GlassCard>

        {/* ════════════════════
            4. 固定帳單管理
        ════════════════════ */}
        <GlassCard style={sty.section}>
          <SectionTitle icon="repeat" title="固定帳單管理" />

          {bills.length === 0 ? (
            <View style={sty.emptyBox}>
              <Feather name="inbox" size={28} color="#CBD5E1" />
              <Text style={sty.emptyText}>尚未新增固定帳單</Text>
            </View>
          ) : (
            bills.map((bill, idx) => {
              const payMode  = getBillPaymentMode(bill);
              const isPaid   = bill.lastPaidPeriodKey === pKey || bill.paidPeriods.includes(currentPeriod.startStr);
              const dueStr   = localDateStr(getBillDueDate(bill, currentPeriod));
              const isOverdue = !isPaid && dueStr < todayStr;
              const isEnabled = bill.enabled !== false;
              const catStyle  = catBadgeStyle(bill.cat);

              return (
                <View key={bill.id} style={[sty.billCard, idx > 0 && { marginTop: spacing.md }]}>
                  {/* 帳單主行 */}
                  <View style={sty.billTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[sty.billName, !isEnabled && { opacity: 0.45 }]}>{bill.name}</Text>
                      <Text style={[sty.billMeta, !isEnabled && { opacity: 0.45 }]}>
                        {fmt(bill.amount)}｜{
                          (bill.paymentRule ?? 'fixedDate') === 'tPlusBusinessDays'
                            ? `每月 ${bill.dueDay} 日執行｜T+${bill.settlementBusinessDays ?? 2} 交割`
                            : `每月 ${bill.dueDay} 日`
                        }
                      </Text>
                    </View>
                    {/* 啟用 toggle */}
                    <View style={sty.billToggleWrap}>
                      <Text style={[sty.billToggleLabel, { color: isEnabled ? colors.income : colors.textMuted }]}>
                        {isEnabled ? '啟用' : '停用'}
                      </Text>
                      <Switch
                        value={isEnabled}
                        onValueChange={v => updateBill(bill.id, { enabled: v })}
                        trackColor={{ false: '#E2E8F0', true: 'rgba(52,211,153,0.45)' }}
                        thumbColor={isEnabled ? colors.income : '#F1F5F9'}
                      />
                    </View>
                  </View>

                  {/* Badge 行 */}
                  <View style={sty.badgeRow}>
                    {/* 分類 badge */}
                    <View style={[sty.badge, { backgroundColor: catStyle.bg }]}>
                      <Text style={[sty.badgeText, { color: catStyle.text }]}>
                        {getCatIcon(bill.cat)} {normalizeCategory(bill.cat)}
                      </Text>
                    </View>

                    {/* 付款方式 badge */}
                    <View style={[sty.badge, {
                      backgroundColor: payMode === 'auto' ? 'rgba(56,189,248,0.14)' : 'rgba(251,191,36,0.14)',
                    }]}>
                      <Text style={[sty.badgeText, {
                        color: payMode === 'auto' ? colors.credit : '#B45309',
                      }]}>
                        {payMode === 'auto' ? '🔄 自動扣繳' : '✋ 手動繳費'}
                      </Text>
                    </View>

                    {/* 繳費狀態 badge（手動繳費才顯示）*/}
                    {payMode === 'manual' && (
                      <View style={[sty.badge, {
                        backgroundColor: isPaid
                          ? 'rgba(52,211,153,0.14)'
                          : isOverdue
                            ? 'rgba(244,114,182,0.14)'
                            : 'rgba(100,116,139,0.10)',
                      }]}>
                        <Text style={[sty.badgeText, {
                          color: isPaid ? colors.income : isOverdue ? colors.expense : colors.textMuted,
                        }]}>
                          {isPaid ? '✅ 本期已繳' : isOverdue ? '⚠️ 已逾期' : '○ 未繳'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* 操作列 */}
                  <View style={sty.billActions}>
                    {/* 手動未繳 → 顯示「已繳費並記帳」*/}
                    {payMode === 'manual' && !isPaid && isEnabled && (
                      <Pressable
                        style={sty.billPayBtn}
                        onPress={() => { markBillPaid(bill.id); showToast('✅ 已記錄繳費'); }}
                      >
                        <Feather name="check-circle" size={13} color="#B45309" />
                        <Text style={sty.billPayBtnText}>已繳費並記帳</Text>
                      </Pressable>
                    )}
                    {/* 手動已繳 → 顯示取消 */}
                    {payMode === 'manual' && isPaid && (
                      <Pressable
                        style={[sty.billPayBtn, { borderColor: 'rgba(0,0,0,0.10)' }]}
                        onPress={() => setConfirmUnmarkBillId(bill.id)}
                      >
                        <Feather name="rotate-ccw" size={13} color={colors.textMuted} />
                        <Text style={[sty.billPayBtnText, { color: colors.textMuted }]}>取消已繳</Text>
                      </Pressable>
                    )}
                    <View style={{ flex: 1 }} />
                    <Pressable onPress={() => openEditBillModal(bill)} hitSlop={8} style={sty.billIconBtn}>
                      <Feather name="edit-2" size={16} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable onPress={() => { deleteBill(bill.id); showToast('🗑️ 已刪除帳單'); }} hitSlop={8} style={sty.billIconBtn}>
                      <Feather name="trash-2" size={16} color={colors.expense} />
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}

          <Pressable style={[sty.outlineBtn, sty.outlinePurple, { marginTop: spacing.lg }]} onPress={openAddBillModal}>
            <Feather name="plus-circle" size={16} color={colors.savings} />
            <Text style={[sty.outlineBtnText, { color: colors.savings }]}>新增固定帳單</Text>
          </Pressable>
        </GlassCard>

        {/* ════════════════════
            5. 背景主題（可收合）
        ════════════════════ */}
        <GlassCard style={sty.section}>
          {/* 摘要列（點擊展開）*/}
          <Pressable style={sty.collapsibleHeader} onPress={() => setShowBgDetails(v => !v)}>
            <View style={sty.collapsibleLeft}>
              <Feather name="image" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <View>
                <Text style={sty.collapsibleTitle}>背景主題</Text>
                <Text style={sty.collapsibleSub}>
                  {bgSettings.fileUri ? '已設定背景圖' : '尚未設定'}
                  ｜透明度 {bgSettings.opacity}%
                  ｜{bgSettings.textMode === 'dark' ? '深色文字' : '淺色文字'}
                </Text>
              </View>
            </View>
            <Feather
              name={showBgDetails ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textMuted}
            />
          </Pressable>

          {showBgDetails && (
            <View style={{ marginTop: spacing.lg }}>
              {/* 預覽 */}
              {bgSettings.fileUri ? (
                <View style={sty.bgPreviewWrap}>
                  <Image source={{ uri: bgSettings.fileUri }} style={sty.bgPreview} resizeMode="cover" />
                  <View style={sty.bgPreviewOverlay} pointerEvents="none">
                    <Text style={sty.bgPreviewLabel}>目前背景</Text>
                  </View>
                  <View style={sty.bgPreviewBorder} pointerEvents="none" />
                </View>
              ) : (
                <View style={sty.bgEmpty}>
                  <Feather name="image" size={28} color="#bbb" />
                  <Text style={[sty.emptyText, { marginTop: 6 }]}>尚未設定背景圖</Text>
                </View>
              )}

              {/* 選取 / 移除 */}
              <View style={sty.bgBtnRow}>
                <Pressable style={[sty.bgBtn, sty.bgBtnPick]} onPress={handlePickBg}>
                  <Feather name="image" size={15} color={colors.textSecondary} />
                  <Text style={[sty.bgBtnText, { color: colors.textSecondary }]}>選取相片</Text>
                </Pressable>
                {bgSettings.fileUri && (
                  <Pressable style={[sty.bgBtn, sty.bgBtnRemove]} onPress={handleRemoveBg}>
                    <Feather name="x" size={15} color={colors.expense} />
                    <Text style={[sty.bgBtnText, { color: colors.expense }]}>移除</Text>
                  </Pressable>
                )}
              </View>

              {/* 透明度 */}
              <Text style={sty.bgSubLabel}>背景透明度</Text>
              <View style={sty.opacityRow}>
                {[20, 35, 50, 65, 80, 100].map(v => (
                  <Pressable
                    key={v}
                    style={[sty.opacityBtn, bgSettings.opacity === v && sty.opacityBtnActive]}
                    onPress={() => handleSetOpacity(v)}
                  >
                    <Text style={[sty.opacityBtnText, bgSettings.opacity === v && sty.opacityBtnTextActive]}>
                      {v}%
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* 文字顏色 */}
              <Text style={sty.bgSubLabel}>歡迎詞文字顏色</Text>
              <Text style={[sty.emptyText, { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm, marginTop: -spacing.xs, fontStyle: 'italic' }]}>
                只影響首頁上方日期、問候語與本期標籤
              </Text>
              <View style={sty.textModeRow}>
                {(['dark', 'light'] as const).map(mode => {
                  const active = bgSettings.textMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      style={[sty.textModeBtn, active && sty.textModeBtnActive]}
                      onPress={() => saveBgSettings({ ...bgSettings, textMode: mode })}
                    >
                      <Text style={{ fontSize: 15, marginRight: 6 }}>{mode === 'dark' ? '⚫' : '⚪'}</Text>
                      <Text style={[sty.textModeBtnText, active && sty.textModeBtnTextActive]}>
                        {mode === 'dark' ? '深色文字' : '淺色文字'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </GlassCard>

        {/* ════════════════════
            6. 投資交割日設定
        ════════════════════ */}
        <GlassCard style={sty.section}>
          <SectionTitle icon="calendar" title="投資交割日設定" />
          <Text style={sty.holidayDisclaimer}>
            用於估算股票定期定額 T+N 扣款日。{'\n'}
            資料來源為 TWSE 台股開休市日，如遇特殊狀況仍以證券商通知為準。
          </Text>

          {/* 目前資料狀態 */}
          <View style={sty.holidayStatusBox}>
            {settings.marketHolidayYear ? (
              <>
                <Text style={sty.holidayStatusText}>
                  休市日來源：TWSE｜{settings.marketHolidayYear} 年
                  ·{' '}
                  {(settings.marketHolidays ?? []).length} 筆
                </Text>
                {settings.marketHolidayUpdatedAt && (
                  <Text style={[sty.holidayStatusText, { color: colors.textMuted, marginTop: 2 }]}>
                    更新時間：{new Date(settings.marketHolidayUpdatedAt).toLocaleString('zh-TW', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                )}
              </>
            ) : (
              <Text style={[sty.holidayStatusText, { color: colors.textMuted }]}>
                尚未更新休市日資料
              </Text>
            )}
          </View>

          {/* 操作按鈕 */}
          <Pressable
            style={[sty.holidayBtn, fetchingHolidays && { opacity: 0.6 }]}
            onPress={handleFetchHolidays}
            disabled={fetchingHolidays}
          >
            {fetchingHolidays
              ? <ActivityIndicator size="small" color={colors.savings} style={{ marginRight: 6 }} />
              : <Feather name="refresh-cw" size={14} color={colors.savings} style={{ marginRight: 6 }} />
            }
            <Text style={[sty.holidayBtnText, { color: colors.savings }]}>
              {fetchingHolidays ? '更新中…' : '更新今年休市日'}
            </Text>
          </Pressable>
        </GlassCard>

        {/* ════════════════════
            7. 資料管理
        ════════════════════ */}
        <GlassCard style={sty.section}>
          <SectionTitle icon="hard-drive" title="資料管理" />
          <View style={sty.infoRow}>
            <Feather name="file-text" size={16} color={colors.textMuted} />
            <Text style={sty.infoLabel}>記錄筆數</Text>
            <Text style={sty.infoValue}>{transactions.length} 筆</Text>
          </View>
          <View style={[sty.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.06)', marginTop: spacing.sm, paddingTop: spacing.sm }]}>
            <Feather name="lock" size={16} color={colors.textMuted} />
            <Text style={sty.infoLabel}>自動儲存</Text>
            <View style={[sty.badge, { backgroundColor: 'rgba(52,211,153,0.14)' }]}>
              <Text style={[sty.badgeText, { color: colors.income }]}>開啟</Text>
            </View>
          </View>
        </GlassCard>

        {/* ════════════════════
            7. 備份與還原
        ════════════════════ */}
        <GlassCard style={sty.section}>
          <SectionTitle icon="database" title="備份與還原" />
          <Text style={sty.backupHint}>
            備份包含所有記帳紀錄、固定帳單、預算與設定。
          </Text>
          <Pressable style={[sty.outlineBtn, sty.outlinePurple, { marginTop: spacing.md }]} onPress={handleBackup}>
            <Feather name="upload" size={16} color={colors.savings} />
            <Text style={[sty.outlineBtnText, { color: colors.savings }]}>匯出完整備份</Text>
          </Pressable>
          <Pressable style={[sty.outlineBtn, sty.outlinePurple, { marginTop: spacing.sm }]} onPress={handleRestore}>
            <Feather name="download" size={16} color={colors.savings} />
            <Text style={[sty.outlineBtnText, { color: colors.savings }]}>還原完整備份</Text>
          </Pressable>
        </GlassCard>

        {/* ════════════════════
            8. 危險操作
        ════════════════════ */}
        <View style={sty.dangerSection}>
          <GlassCard style={sty.section} colorTop="rgba(244,114,182,0.08)">
            <SectionTitle icon="alert-triangle" title="危險操作" color={colors.expense} />
            <Text style={sty.dangerHint}>
              清除全部紀錄會刪除所有記帳資料，此操作無法復原。
            </Text>

            {clearStep === 0 && (
              <Pressable
                style={[sty.outlineBtn, sty.outlineDanger, { marginTop: spacing.md }]}
                onPress={() => setClearStep(1)}
              >
                <Feather name="trash-2" size={16} color={colors.expense} />
                <Text style={[sty.outlineBtnText, { color: colors.expense }]}>清除全部紀錄</Text>
              </Pressable>
            )}

            {clearStep === 1 && (
              <View style={sty.clearConfirmBox}>
                <Text style={sty.clearConfirmText}>
                  ⚠️ 確定要清除全部記帳紀錄？此操作無法復原。
                </Text>
                <View style={sty.clearBtns}>
                  <Pressable style={sty.clearCancelBtn} onPress={() => setClearStep(0)}>
                    <Text style={sty.clearCancelText}>取消</Text>
                  </Pressable>
                  <Pressable
                    style={[sty.clearDangerBtn]}
                    onPress={() => setClearStep(2)}
                  >
                    <Text style={sty.clearDangerText}>繼續</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {clearStep === 2 && (
              <View style={sty.clearConfirmBox}>
                <Text style={sty.clearConfirmText}>
                  請輸入「清除」確認刪除所有資料
                </Text>
                <TextInput
                  style={sty.clearInput}
                  value={clearInput}
                  onChangeText={setClearInput}
                  placeholder="請輸入：清除"
                  placeholderTextColor="#CBD5E1"
                  autoFocus
                />
                <View style={sty.clearBtns}>
                  <Pressable style={sty.clearCancelBtn} onPress={() => { setClearStep(0); setClearInput(''); }}>
                    <Text style={sty.clearCancelText}>取消</Text>
                  </Pressable>
                  <Pressable
                    style={[sty.clearDangerBtn, clearInput !== '清除' && { opacity: 0.35 }]}
                    onPress={clearInput === '清除' ? handleClearAll : undefined}
                    disabled={clearInput !== '清除'}
                  >
                    <Text style={sty.clearDangerText}>確認清除</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </GlassCard>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Toast */}
      {!!toast && (
        <View style={sty.toast} pointerEvents="none">
          <Text style={sty.toastText}>{toast}</Text>
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowBillModal(false)} />
          <View style={[sty.billModal, { paddingBottom: safeBottom + 16 }]}>
            <View style={sty.dragHandle} />
            <View style={sty.modalTitleRow}>
              <Feather name="file-text" size={18} color={colors.savings} />
              <Text style={sty.modalTitle}>{editingBillId !== null ? '編輯帳單' : '新增帳單'}</Text>
            </View>

            {/* Modal 可滾動內容 */}
            <ScrollView
              style={{ maxHeight: 560 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <TextInput
                style={sty.billInput}
                placeholder="帳單名稱（例如：房租、車貸）"
                placeholderTextColor="#94A3B8"
                value={billName}
                onChangeText={n => {
                  setBillName(n);
                  if (editingBillId === null) setBillCat(guessBillCat(n));
                }}
              />

              <View style={sty.billRow2}>
                <TextInput
                  style={[sty.billInput, { flex: 1 }]}
                  placeholder="金額 NT$"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={billAmount}
                  onChangeText={setBillAmount}
                />
                <TextInput
                  style={[sty.billInput, { width: 100 }]}
                  placeholder="每月幾號"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  maxLength={2}
                  value={billDueDay}
                  onChangeText={setBillDueDay}
                />
              </View>

              {/* 分類 chips（自動換行）*/}
              <Text style={sty.modalSubLabel}>分類</Text>
              <View style={sty.catChipsWrap}>
                {CATS.expense.map(c => (
                  <Pressable
                    key={c.n}
                    style={[sty.catChip, billCat === c.n && sty.catChipActive]}
                    onPress={() => setBillCat(c.n)}
                  >
                    <Text style={[sty.catChipText, billCat === c.n && { color: colors.savings }]}>
                      {c.e} {c.n}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* 付款方式 */}
              <Text style={[sty.modalSubLabel, { marginTop: spacing.lg }]}>付款方式</Text>
              <View style={sty.payModeRow}>
                {(['manual', 'auto'] as const).map(mode => {
                  const active = billPaymentMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      style={[sty.payModeBtn, active && sty.payModeBtnActive]}
                      onPress={() => setBillPaymentMode(mode)}
                    >
                      <Text style={[sty.payModeBtnText, active && { color: colors.savings }]}>
                        {mode === 'auto' ? '🔄 自動扣繳' : '✋ 手動繳費'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* 付款規則 */}
              <Text style={[sty.modalSubLabel, { marginTop: spacing.lg }]}>付款規則</Text>
              <View style={sty.payModeRow}>
                {(['fixedDate', 'tPlusBusinessDays'] as const).map(rule => {
                  const active = billPaymentRule === rule;
                  return (
                    <Pressable
                      key={rule}
                      style={[sty.payModeBtn, active && sty.payModeBtnActive]}
                      onPress={() => setBillPaymentRule(rule)}
                    >
                      <Text style={[sty.payModeBtnText, active && { color: colors.savings }]}>
                        {rule === 'fixedDate' ? '📅 固定日期扣款' : '📈 T+N 營業日交割'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {billPaymentRule === 'tPlusBusinessDays' && (
                <>
                  <Text style={[sty.modalSubLabel, { marginTop: spacing.md }]}>交割天數</Text>
                  <View style={[sty.payModeRow, { flexWrap: 'nowrap' }]}>
                    {([1, 2, 3] as const).map(d => {
                      const active = parseInt(billSettlementDays) === d;
                      return (
                        <Pressable
                          key={d}
                          style={[sty.payModeBtn, active && sty.payModeBtnActive, { flex: 1 }]}
                          onPress={() => setBillSettlementDays(String(d))}
                        >
                          <Text style={[sty.payModeBtnText, active && { color: colors.savings }]}>
                            T+{d}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {/* 提前提醒天數 */}
              <Text style={[sty.modalSubLabel, { marginTop: spacing.md }]}>提前提醒（天）</Text>
              <TextInput
                style={[sty.billInput, { width: 120 }]}
                placeholder="預設 3 天"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
                maxLength={2}
                value={billRemindDays}
                onChangeText={setBillRemindDays}
              />
            </ScrollView>

            <Pressable
              style={[sty.submitBtn, { backgroundColor: colors.savings, marginTop: spacing.lg }]}
              onPress={handleSaveBill}
            >
              <Text style={sty.submitBtnText}>{editingBillId !== null ? '儲存變更' : '新增帳單'}</Text>
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
        <View style={sty.centerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmUnmarkBillId(null)} />
          <View style={sty.unmarkBox}>
            <Text style={sty.unmarkTitle}>確定取消已繳費？</Text>
            <Text style={sty.unmarkSub}>本期相關的交易記錄將會被刪除。</Text>
            <View style={sty.unmarkBtns}>
              <Pressable style={sty.clearCancelBtn} onPress={() => setConfirmUnmarkBillId(null)}>
                <Text style={sty.clearCancelText}>取消</Text>
              </Pressable>
              <Pressable
                style={[sty.clearDangerBtn]}
                onPress={() => {
                  if (confirmUnmarkBillId !== null) unmarkBillPaid(confirmUnmarkBillId);
                  setConfirmUnmarkBillId(null);
                  showToast('↩️ 已取消繳費記錄');
                }}
              >
                <Text style={sty.clearDangerText}>確認</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── 小元件 ──────────────────────────────────────
function SectionTitle({ icon, title, color }: { icon: string; title: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.lg }}>
      <Feather name={icon as any} size={16} color={color ?? colors.textSecondary} />
      <Text style={[sty.sectionTitle, color ? { color } : undefined]}>{title}</Text>
    </View>
  );
}
function SaveBtn({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable style={sty.saveBtn} onPress={onPress}>
      <Feather name="check" size={15} color={colors.income} />
      <Text style={sty.saveBtnText}>{label}</Text>
    </Pressable>
  );
}

// ── Styles ──────────────────────────────────────
const sty = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.appBg },
  scroll:  { flex: 1 },
  content: { paddingBottom: spacing.xxl },

  header:      { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl, paddingBottom: spacing.md },
  headerSub:   { fontSize: fontSize.md, color: colors.textMuted, marginBottom: 4 },
  headerTitle: { fontSize: fontSize.h1, fontWeight: '700', color: colors.textPrimary },

  // ── 共用 section 卡片 ──
  section: {
    marginHorizontal: spacing.lg,
    marginBottom:     spacing.lg,
    padding:          spacing.xl,
  },
  sectionTitle: {
    fontSize:   fontSize.md,
    fontWeight: '700',
    color:      colors.textSecondary,
    letterSpacing: 0.3,
  },

  // ── Field rows ──
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowBorder: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  fieldInfo: { flex: 1 },
  fieldLabel:{ fontSize: fontSize.lg, fontWeight: '600', color: colors.textPrimary },
  fieldSub:  { fontSize: fontSize.base, color: colors.textMuted, marginTop: 2 },

  input: {
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(0,0,0,0.09)',
    borderRadius:    radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    fontSize:        fontSize.lg,
    fontFamily:      'monospace',
    backgroundColor: 'rgba(0,0,0,0.03)',
    width:           110,
    textAlign:       'right',
    color:           colors.textPrimary,
  },

  // ── 預算 ──
  budgetSubRow: {
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingLeft:   48,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  budgetSubLabel: {
    fontSize:   fontSize.lg,
    fontWeight: '500',
    color:      colors.textPrimary,
    flex: 1,
  },
  budgetTotalRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingLeft:    48,
    paddingRight:   4,
    marginTop:      4,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(0,0,0,0.10)',
  },
  budgetTotalLabel: { fontSize: fontSize.lg, fontWeight: '600', color: colors.textSecondary },
  budgetTotalValue: { fontSize: fontSize.lg, fontWeight: '700', color: colors.savings, fontFamily: 'monospace' },

  // ── Buttons ──
  saveBtn: {
    marginTop:       spacing.lg,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    padding:         spacing.md,
    borderRadius:    radius.md,
    backgroundColor: 'rgba(52,211,153,0.14)',
    borderWidth:     1.5,
    borderColor:     'rgba(52,211,153,0.35)',
  },
  saveBtnText: { color: colors.income, fontSize: fontSize.md, fontWeight: '700' },

  outlineBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    padding:        spacing.md,
    borderRadius:   radius.md,
    borderWidth:    1.5,
  },
  outlinePurple: { backgroundColor: 'rgba(167,139,250,0.12)', borderColor: 'rgba(167,139,250,0.35)' },
  outlineDanger: { backgroundColor: 'rgba(244,114,182,0.10)', borderColor: 'rgba(244,114,182,0.35)' },
  outlineBtnText:{ fontSize: fontSize.md, fontWeight: '700' },

  // ── 固定帳單 ──
  emptyBox:  { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { color: colors.textHint, fontSize: fontSize.lg },

  billCard: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius:    radius.md,
    padding:         spacing.md,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.90)',
  },
  billTopRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    marginBottom:   6,
  },
  billName:   { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  billMeta:   { fontSize: fontSize.base, color: colors.textMuted, marginTop: 2 },
  billToggleWrap: { alignItems: 'center', gap: 3 },
  billToggleLabel: { fontSize: fontSize.xs, fontWeight: '600' },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      radius.pill,
  },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700' },

  billActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  billPayBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            4,
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderRadius:   radius.pill,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth:    1,
    borderColor:    'rgba(251,191,36,0.35)',
  },
  billPayBtnText: { fontSize: fontSize.xs, fontWeight: '700', color: '#B45309' },
  billIconBtn:    { padding: 6, borderRadius: radius.sm },

  // ── 背景主題 ──
  collapsibleHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  collapsibleLeft:  { flexDirection: 'row', alignItems: 'center', flex: 1 },
  collapsibleTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textSecondary },
  collapsibleSub:   { fontSize: fontSize.xs + 1, color: colors.textMuted, marginTop: 2 },

  bgPreviewWrap:   { borderRadius: radius.sm, overflow: 'hidden', height: 120, marginBottom: spacing.md },
  bgPreview:       { flex: 1, height: 120 },
  bgPreviewOverlay:{
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: spacing.sm,
  },
  bgPreviewLabel:  { color: '#fff', fontSize: fontSize.base, fontWeight: '600' },
  bgPreviewBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: radius.sm, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
  },
  bgEmpty: {
    height: 80, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderStyle: 'dashed',
  },
  bgBtnRow:   { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  bgBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1.5 },
  bgBtnPick:  { backgroundColor: 'rgba(71,85,105,0.10)', borderColor: 'rgba(71,85,105,0.25)' },
  bgBtnRemove:{ backgroundColor: 'rgba(244,114,182,0.10)', borderColor: 'rgba(244,114,182,0.35)' },
  bgBtnText:  { fontSize: fontSize.md, fontWeight: '600' },
  bgSubLabel: { fontSize: fontSize.xs + 1, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4, marginBottom: spacing.sm, marginTop: spacing.md },

  opacityRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  opacityBtn: {
    flex: 1, minWidth: 44, paddingVertical: spacing.sm, borderRadius: radius.sm,
    alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  },
  opacityBtnActive:     { backgroundColor: 'rgba(52,211,153,0.18)', borderColor: colors.income },
  opacityBtnText:       { fontSize: fontSize.base, fontWeight: '600', color: colors.textSecondary },
  opacityBtnTextActive: { color: colors.income, fontWeight: '700' },

  textModeRow: { flexDirection: 'row', gap: spacing.md },
  textModeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.08)',
  },
  textModeBtnActive:     { backgroundColor: 'rgba(30,41,59,0.85)', borderColor: 'rgba(30,41,59,0.5)' },
  textModeBtnText:       { fontSize: fontSize.base, fontWeight: '600', color: colors.textSecondary },
  textModeBtnTextActive: { color: '#fff' },

  // ── 資料管理 ──
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs,
  },
  infoLabel: { flex: 1, fontSize: fontSize.md, color: colors.textPrimary },
  infoValue: { fontSize: fontSize.md, fontWeight: '600', color: colors.textSecondary },

  // ── 備份 ──
  backupHint: { fontSize: fontSize.base, color: colors.textMuted, marginBottom: spacing.xs, lineHeight: 20 },

  // ── 危險操作 ──
  dangerSection:   { marginTop: spacing.xxl },
  dangerHint:      { fontSize: fontSize.base, color: colors.expense, lineHeight: 20, marginBottom: spacing.sm },
  clearConfirmBox: {
    marginTop:       spacing.md,
    backgroundColor: 'rgba(244,114,182,0.08)',
    borderRadius:    radius.md,
    padding:         spacing.lg,
    borderWidth:     1,
    borderColor:     'rgba(244,114,182,0.25)',
    gap:             spacing.md,
  },
  clearConfirmText: { fontSize: fontSize.md, color: colors.expense, lineHeight: 22 },
  clearInput: {
    backgroundColor:   '#fff',
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    fontSize:          fontSize.lg,
    color:             colors.textPrimary,
    borderWidth:       1,
    borderColor:       'rgba(244,114,182,0.35)',
  },
  clearBtns:      { flexDirection: 'row', gap: spacing.md },
  clearCancelBtn: {
    flex: 1, padding: spacing.md, borderRadius: radius.sm,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
  },
  clearCancelText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textSecondary },
  clearDangerBtn:  { flex: 1, padding: spacing.md, borderRadius: radius.sm, alignItems: 'center', backgroundColor: '#B71C1C' },
  clearDangerText: { fontSize: fontSize.md, fontWeight: '700', color: '#fff' },

  // ── Toast ──
  toast: {
    position: 'absolute', bottom: 90, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.pill,
  },
  toastText: { color: '#fff', fontSize: fontSize.lg },

  // ── 固定帳單 Modal ──
  billModal: {
    backgroundColor:      'rgba(255,255,255,0.97)',
    borderTopLeftRadius:  radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding:              22,
    paddingBottom:        40,
    borderWidth:          1,
    borderColor:          'rgba(255,255,255,0.80)',
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -8 },
    shadowOpacity:        0.12,
    shadowRadius:         24,
    elevation:            20,
  },
  dragHandle:    { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  modalTitle:    { fontSize: fontSize.h2, fontWeight: '700', color: colors.textPrimary },
  modalSubLabel: { fontSize: fontSize.xs + 1, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: spacing.sm },

  billInput: {
    borderRadius:      radius.lg,
    padding:           spacing.lg,
    fontSize:          fontSize.lg,
    marginBottom:      spacing.md,
    backgroundColor:   '#F8FAFC',
    borderWidth:       1,
    borderColor:       'rgba(0,0,0,0.06)',
    color:             colors.textPrimary,
  },
  billRow2: { flexDirection: 'row', gap: spacing.md },

  // 分類 chips（自動換行）
  catChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical:   7,
    borderRadius:      radius.pill,
    backgroundColor:   'rgba(0,0,0,0.04)',
    borderWidth:       1.5,
    borderColor:       'rgba(0,0,0,0.07)',
  },
  catChipActive: {
    backgroundColor: 'rgba(167,139,250,0.18)',
    borderColor:     colors.savings,
  },
  catChipText: { fontSize: fontSize.base, fontWeight: '600', color: colors.textPrimary },

  payModeRow: { flexDirection: 'row', gap: spacing.md },
  payModeBtn: {
    flex:            1,
    paddingVertical: 10,
    borderRadius:    radius.lg,
    alignItems:      'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth:     1.5,
    borderColor:     'rgba(0,0,0,0.07)',
  },
  payModeBtnActive: {
    backgroundColor: 'rgba(167,139,250,0.14)',
    borderColor:     colors.savings,
  },
  payModeBtnText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textSecondary },

  submitBtn:     { padding: 14, borderRadius: radius.lg, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: fontSize.xl, fontWeight: '700' },

  // ── 取消已繳 Modal ──
  centerOverlay: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: spacing.xxl,
  },
  unmarkBox: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius:    radius.lg,
    padding:         spacing.xl,
    width:           '100%',
    gap:             spacing.md,
  },

  // ── 休市日 ──
  holidayDisclaimer: {
    fontSize:    fontSize.xs + 1,
    color:       colors.textMuted,
    lineHeight:  18,
    marginBottom: spacing.md,
  },
  holidayStatusBox: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius:    radius.md,
    padding:         spacing.md,
    marginBottom:    spacing.md,
  },
  holidayStatusText: { fontSize: fontSize.sm, color: colors.textPrimary },
  holidayBtnRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  holidayBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 14,
    paddingVertical:    9,
    borderRadius:   radius.md,
    borderWidth:    1,
    borderColor:    colors.savings,
  },
  holidayBtnText:     { fontSize: fontSize.sm, fontWeight: '500' },
  unmarkTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary },
  unmarkSub:   { fontSize: fontSize.md, color: colors.textSecondary },
  unmarkBtns:  { flexDirection: 'row', gap: spacing.md },
});
