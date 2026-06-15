import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  Pressable, SafeAreaView, StatusBar, Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useBudgetStore } from '../store/useBudgetStore';
import { colors, radius, spacing, fontSize, shadows, glows, textShadows } from '../theme';
import { GlassCard } from '../components/GlassCard';
import { exportExcel, importExcel } from '../utils/excel';
import { exportBackup, importBackup } from '../utils/backup';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

export function SettingsScreen() {
  const { settings, transactions, bgSettings, saveSettings, saveBgSettings, clearAll } = useBudgetStore();

  const [name,    setName]    = useState(settings.username);
  const [payday,  setPayday]  = useState(String(settings.payday));
  const [budget,  setBudget]  = useState(String(settings.budget));
  const [savings, setSavings] = useState(String(settings.savings));
  const [toast,   setToast]   = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    setName(settings.username);
    setPayday(String(settings.payday));
    setBudget(String(settings.budget));
    setSavings(String(settings.savings));
  }, [settings]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleSave = () => {
    const pd = Math.min(28, Math.max(1, parseInt(payday) || 5));
    const bg = parseInt(budget) || 15000;
    const sv = parseFloat(savings) || 0;
    saveSettings({
      username: name.trim() || '我',
      payday:   pd,
      budget:   bg,
      savings:  sv,
    });
    showToast('✅ 設定已儲存');
  };

  const handleExport = async () => {
    showToast('⏳ 產生報表中…');
    const msg = await exportExcel(transactions, settings.payday);
    showToast(msg);
  };

  const handleImport = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    if (result.canceled) return;
    showToast('⏳ 匯入中…');
    const { imported, transactions: merged } = await importExcel(result.assets[0].uri, transactions);
    useBudgetStore.getState().importTransactions(merged);
    showToast(`✅ 匯入完成，新增 ${imported} 筆`);
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
          <View style={[styles.row, styles.rowBorder]}>
            <Feather name="target" size={20} color="#64748B" style={styles.rowIcon} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>每期預算</Text>
              <Text style={styles.rowSub}>NT$</Text>
            </View>
            <TextInput
              style={styles.input}
              value={budget}
              onChangeText={setBudget}
              keyboardType="numeric"
            />
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

          <Pressable style={[styles.actionBtn, styles.actionBtnMint, { marginTop: 10 }]} onPress={handleExport}>
            <View style={styles.btnInner}>
              <Feather name="upload-cloud" size={18} color={colors.income} />
              <Text style={[styles.actionBtnText, { color: colors.income }]}>匯出 Excel 報表</Text>
            </View>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.actionBtnCyan, { marginTop: 10 }]} onPress={handleImport}>
            <View style={styles.btnInner}>
              <Feather name="download-cloud" size={18} color={colors.credit} />
              <Text style={[styles.actionBtnText, { color: colors.credit }]}>匯入 Excel 備份</Text>
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
  actionBtnMint:  { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.35)' },
  actionBtnCyan:  { backgroundColor: 'rgba(56,189,248,0.12)', borderColor: 'rgba(56,189,248,0.35)' },
  actionBtnGhost: { backgroundColor: 'rgba(244,114,182,0.10)', borderColor: 'rgba(244,114,182,0.35)' },
  actionBtnPurple: { backgroundColor: 'rgba(167,139,250,0.12)', borderColor: 'rgba(167,139,250,0.35)' },
  actionBtnText:  { fontSize: fontSize.xl, fontWeight: '700', ...textShadows.light },

  confirmBox: {
    backgroundColor: 'rgba(251,113,133,0.1)', borderRadius: radius.sm,
    padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(251,113,133,0.3)',
  },
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

  toast: {
    position: 'absolute', bottom: 90, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.pill,
  },
  toastText: { color: colors.textWhite, fontSize: fontSize.lg },
});
