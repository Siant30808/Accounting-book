import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  Modal, TextInput, KeyboardAvoidingView, Keyboard,
  Platform, SafeAreaView, StatusBar, ImageBackground,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { useBudgetStore }       from '../store/useBudgetStore';
import { SkiaPieChart, ChartSlice } from '../components/SkiaPieChart';
import { PieLegend }            from '../components/PieLegend';
import { FabRobot }             from '../components/FabRobot';
import { SavingsBanner }        from '../components/SavingsBanner';
import { fmt, dayLabel }        from '../utils/format';
import { localDateStr, getPeriod } from '../utils/period';
import { exportExcel, importExcel } from '../utils/excel';
import { Transaction, CATS, getCatIcon } from '../types';
import { colors, radius, spacing, fontSize, shadows, glows } from '../theme';
import { GlassCard } from '../components/GlassCard';

const kkleBwaGif = require('../../assets/KkleBWA.gif');

const CASH_COLORS = ['#FF5252','#FF7043','#E91E63','#FF9800','#F44336','#FF6D00'];
const CARD_COLORS = ['#2196F3','#00BCD4','#3F51B5','#00E5FF','#1976D2','#40C4FF'];

function buildSlices(txs: Transaction[], colors: string[]): ChartSlice[] {
  const map: Record<string, number> = {};
  txs.forEach(t => { map[t.cat] = (map[t.cat] ?? 0) + t.amount; });
  return Object.entries(map).map(([label, amount], i) => ({
    label, amount, color: colors[i % colors.length],
  }));
}

// ── 簡單卡片：GlassCard 直接帶 margin/padding，不用外層 elevation View ──
function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <GlassCard style={[styles.card, style]}>
      {children}
    </GlassCard>
  );
}

function InsetBox({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.insetBox, style]}>{children}</View>;
}

/** 粉彩玻璃長方形卡片（四宮格專用）*/
function NeuCard({ children, glowColor = 'rgba(255,255,255,0.02)' }: {
  children:   React.ReactNode;
  glow?:      object;
  glowColor?: string;
}) {
  return (
    // 直接用 GlassCard，不加外層 elevation View（避免 Android 強制白底）
    <GlassCard
      style={styles.neuCardOuter}
      colorTop="rgba(255,255,255,0.35)"
      colorBot={glowColor}
    >
      <View style={styles.neuCardBody}>
        <View style={styles.sumRow}>{children}</View>
      </View>
    </GlassCard>
  );
}

export function HomeScreen() {
  const {
    transactions, settings, bgSettings,
    addTransaction, deleteTransaction, importTransactions,
    checkPeriodRollover, getCurrentPeriod, getPeriodTxs,
  } = useBudgetStore();

  const period = useMemo(() => getCurrentPeriod(), [transactions, settings.payday]);
  const txs    = useMemo(() => getPeriodTxs(period), [period, transactions]);

  const { income, cashExp, cardExp, balance, totalSav, budgetPct } = useMemo(() => {
    const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const cashExp = txs.filter(t => t.type === 'expense' && t.pay === '現金').reduce((s, t) => s + t.amount, 0);
    const cardExp = txs.filter(t => t.type === 'expense' && t.pay === '信用卡').reduce((s, t) => s + t.amount, 0);
    const balance = income - cashExp;
    return {
      income,
      cashExp,
      cardExp,
      balance,
      totalSav:  settings.savings + balance,
      budgetPct: Math.min(100, Math.round((cashExp / (settings.budget || 1)) * 100)),
    };
  }, [txs, settings.savings, settings.budget]);

  // 上期結餘
  const prevBal = useMemo(() => {
    const prevEndDate = new Date(period.startStr + 'T00:00:00');
    prevEndDate.setDate(prevEndDate.getDate() - 1);
    const prevP    = getPeriod(localDateStr(prevEndDate), settings.payday);
    const prevTxs  = transactions.filter(t => t.date >= prevP.startStr && t.date <= prevP.endStr);
    const prevInc  = prevTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const prevCash = prevTxs.filter(t => t.type === 'expense' && t.pay === '現金').reduce((s, t) => s + t.amount, 0);
    return prevInc - prevCash;
  }, [period, transactions, settings.payday]);

  // 天數
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const { daysLeft, totalDays, elapsed } = useMemo(() => {
    const endDate   = new Date(period.endStr + 'T00:00:00');
    const daysLeft  = Math.max(0, Math.round((endDate.getTime() - today.getTime()) / 86400000) + 1);
    const totalDays = Math.round((new Date(period.endStr).getTime() - new Date(period.startStr).getTime()) / 86400000) + 1;
    return { daysLeft, totalDays, elapsed: totalDays - daysLeft };
  }, [period, today]);

  const cashSlices = useMemo(
    () => buildSlices(txs.filter(t => t.type === 'expense' && t.pay === '現金'),  CASH_COLORS),
    [txs],
  );
  const cardSlices = useMemo(
    () => buildSlices(txs.filter(t => t.type === 'expense' && t.pay === '信用卡'), CARD_COLORS),
    [txs],
  );

  // ── Modal 狀態 ──
  const [showAddModal,     setShowAddModal]     = useState(false);
  const [showSavingsModal, setShowSavingsModal] = useState(false);
  const [deleteTargetId,   setDeleteTargetId]   = useState<number | null>(null);
  const [addType,      setAddType]      = useState<'expense' | 'income'>('expense');
  const [addPay,       setAddPay]       = useState<'現金' | '信用卡'>('現金');
  const [addCat,       setAddCat]       = useState('餐飲');
  const [addAmt,       setAddAmt]       = useState('');
  const [addNote,      setAddNote]      = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [savingsInput, setSavingsInput] = useState('');
  const [toast,    setToast]    = useState('');

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast  = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  }, []);

  useEffect(() => {
    const msg = checkPeriodRollover();
    if (msg) showToast(msg);
  }, []);

  const openAddModal = useCallback((type: 'expense' | 'income' = 'expense') => {
    setAddType(type); setAddPay('現金');
    setSelectedDate(new Date());
    setAddAmt(''); setAddNote('');
    setAddCat(type === 'expense' ? '餐飲' : '薪資');
    setShowAddModal(true);
  }, []);

  const handleAddTx = useCallback(() => {
    const amount = parseFloat(addAmt);
    if (!amount || amount <= 0) { showToast('❌ 請輸入有效金額'); return; }
    const now = new Date();
    const d = selectedDate;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    addTransaction({
      type:   addType,
      cat:    addCat as Transaction['cat'],
      amount,
      date:   dateStr,
      time:   `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
      pay:    addType === 'expense' ? addPay : '—',
      note:   addNote.trim(),
    });
    setShowAddModal(false);
    setAddAmt(''); setAddNote('');
    showToast(`✅ ${addType === 'expense' ? (addPay === '信用卡' ? '💳 刷卡' : '💵 現金') + '記帳' : '💵 收入'}成功`);
  }, [addAmt, addType, addCat, selectedDate, addPay, addNote]);

  const handleExport = useCallback(async () => {
    showToast('⏳ 產生報表中…');
    const msg = await exportExcel(transactions, settings.payday);
    showToast(msg);
  }, [transactions, settings.payday]);

  const handleImport = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    if (result.canceled) return;
    showToast('⏳ 匯入中…');
    const { imported, transactions: merged } = await importExcel(result.assets[0].uri, transactions);
    importTransactions(merged);
    showToast(`✅ 匯入完成，新增 ${imported} 筆`);
  }, [transactions]);

  // 明細群組
  const groupedEntries = useMemo(() => {
    const grouped = txs.reduce<Record<string, Transaction[]>>((m, t) => {
      (m[t.date] = m[t.date] ?? []).push(t); return m;
    }, {});
    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
  }, [txs]);

  // 問候語 & 日期標頭（只依賴 today，不需隨 txs 重算）
  const { greeting, headerDate } = useMemo(() => {
    const h = new Date().getHours();
    const greeting = h < 6 ? '夜深了，注意休息！🌙'
      : h < 12 ? '早安！今天也要加油☀️'
      : h < 18 ? '下午好，記得記帳'
      : '晚上好！今日帳記了嗎✨';
    const days = ['日','一','二','三','四','五','六'];
    return {
      greeting,
      headerDate: `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日 星期${days[today.getDay()]}`,
    };
  }, [today]);

  const bgOpacity = (bgSettings.opacity ?? 100) / 100;

  return (
    <SafeAreaView style={styles.root}>
      {/* 背景圖層 */}
      {!!bgSettings.fileUri && (
        <ImageBackground
          source={{ uri: bgSettings.fileUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          imageStyle={{ opacity: bgOpacity }}
        />
      )}
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ══════════════════════════════════
            HEADER
        ══════════════════════════════════ */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerDate}>{headerDate}</Text>
            <Text style={styles.headerGreeting} numberOfLines={2}>
              你好，{settings.username}！{greeting}
            </Text>
            <View style={styles.periodBadge}>
              <View style={styles.periodDot} />
              <Text style={styles.periodLabel}>本期 {period.label}</Text>
            </View>
          </View>
          <Image
            source={kkleBwaGif}
            style={styles.headerGif}
            contentFit="contain"
            autoplay
          />
        </View>

        {/* ══════════════════════════════════
            四宮格摘要卡片
        ══════════════════════════════════ */}
        <View style={styles.gridWrapper}>

          {/* ── 1. 現金支出 (粉紅光暈) ── */}
          <NeuCard glow={glows.pinkGlow} glowColor="rgba(244,114,182,0.22)">
            <View style={styles.sumIconBox}>
              <Feather name="shopping-bag" size={26} color={colors.expense} />
            </View>
            <View style={styles.sumTextCol}>
              <Text style={styles.sumLabel}>現金支出</Text>
              <Text style={[styles.sumVal, { color: colors.expense }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {fmt(cashExp)}
              </Text>
            </View>
          </NeuCard>

          {/* ── 2. 上期結餘 (薄荷綠光暈) ── */}
          <NeuCard glow={glows.mintGlow} glowColor="rgba(52,211,153,0.22)">
            <View style={styles.sumIconBox}>
              <Feather name="calendar" size={26} color={colors.income} />
            </View>
            <View style={styles.sumTextCol}>
              <Text style={styles.sumLabel}>上期結餘</Text>
              <Text style={[styles.sumVal, { color: prevBal >= 0 ? colors.income : colors.expense }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {fmt(prevBal)}
              </Text>
            </View>
          </NeuCard>

          {/* ── 3. 信用卡刷卡 (天空藍光暈) ── */}
          <NeuCard glow={glows.cyanGlow} glowColor="rgba(56,189,248,0.22)">
            <View style={styles.sumIconBox}>
              <Feather name="credit-card" size={26} color={colors.credit} />
            </View>
            <View style={styles.sumTextCol}>
              <Text style={styles.sumLabel}>信用卡刷卡</Text>
              <Text style={[styles.sumVal, { color: colors.credit }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {fmt(cardExp)}
              </Text>
            </View>
          </NeuCard>

          {/* ── 4. 本期結餘 (薰衣草紫光暈) ── */}
          <NeuCard glow={glows.purpleGlow} glowColor="rgba(167,139,250,0.22)">
            <View style={styles.sumIconBox}>
              <Feather name="trending-up" size={26} color={colors.savings} />
            </View>
            <View style={styles.sumTextCol}>
              <Text style={styles.sumLabel}>本期結餘</Text>
              <Text style={[styles.sumVal, { color: balance >= 0 ? colors.savings : colors.expense }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {fmt(balance)}
              </Text>
            </View>
          </NeuCard>

        </View>

        {/* ══════════════════════════════════
            存款橫幅（動態流體漸層）
        ══════════════════════════════════ */}
        <SavingsBanner
          totalSavings={totalSav}
          onPress={() => { setSavingsInput(String(settings.savings)); setShowSavingsModal(true); }}
        />

        {/* ══════════════════════════════════
            預算進度條
        ══════════════════════════════════ */}
        <Card style={styles.progressCard}>
          <View style={styles.progressTop}>
            <Text style={styles.progressTitle}>本期預算（第 {elapsed}/{totalDays} 天）</Text>
            <Text style={styles.progressMeta}>剩 {daysLeft} 天</Text>
          </View>
          <InsetBox style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width:           `${budgetPct}%` as any,
                  backgroundColor: budgetPct > 80 ? '#E53935' : budgetPct > 60 ? '#FB8C00' : '#4CAF50',
                },
              ]}
            />
          </InsetBox>
          <View style={styles.progressBottom}>
            <Text style={styles.progressMeta}>已用 {fmt(cashExp)}</Text>
            <Text style={styles.progressMeta}>預算 {fmt(settings.budget)}</Text>
          </View>
        </Card>

        {/* ══════════════════════════════════
            雙圓餅圖
        ══════════════════════════════════ */}
        <View style={styles.pieRow}>
          {[
            { title: '支出分類',   slices: cashSlices, total: cashExp },
            { title: '信用卡分類', slices: cardSlices, total: cardExp },
          ].map((p, i) => (
            <GlassCard key={i} style={styles.pieCard}
              colorTop="rgba(20,25,40,0.85)" colorBot="rgba(10,15,28,0.92)"
              borderRadius={radius.xl}>
              <Text style={styles.pieTitle}>{p.title}</Text>
              <View style={styles.pieCenter}>
                <SkiaPieChart
                  slices={p.slices}
                  size={120}
                  centerLabel={p.total > 0 ? (p.total >= 10000 ? (p.total / 10000).toFixed(1) + '萬' : Math.round(p.total).toLocaleString('zh-TW')) : ''}
                />
              </View>
              <PieLegend items={p.slices.map(s => ({ ...s, total: p.total }))} />
            </GlassCard>
          ))}
        </View>

        {/* ══════════════════════════════════
            本期明細
        ══════════════════════════════════ */}
        <Text style={styles.sectionTitle}>本期明細</Text>
        {groupedEntries.length === 0 ? (
          <Text style={styles.emptyText}>本期尚無記錄</Text>
        ) : (
          groupedEntries.map(([date, items]) => (
            <View key={date} style={styles.dayGroup}>
              <View style={styles.dayLabelRow}>
                <Text style={styles.dayLabelText}>{dayLabel(date)}</Text>
              </View>
              {items.map(t => (
                <Card key={t.id} style={styles.txCard}>
                  <View style={styles.txRow}>
                    <View style={[
                      styles.txIconBox,
                      { backgroundColor: t.type === 'income' ? '#E8F5E9' : '#FFF3E0' },
                    ]}>
                      <Text style={styles.txIconEmoji}>{getCatIcon(t.cat)}</Text>
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={styles.txName} numberOfLines={1}>
                        {t.cat}{t.note ? ` (${t.note})` : ''}
                      </Text>
                      <View style={styles.txTimeRow}>
                        <Feather name="clock" size={11} color="#aaa" />
                        <Text style={styles.txTime}>{t.time || '--:--'}</Text>
                      </View>
                    </View>
                    <View style={styles.txRight}>
                      <Text style={[
                        styles.txAmount,
                        { color: t.type === 'income' ? '#2E7D32' : '#C62828' },
                      ]}>
                        {t.type === 'income' ? '+' : '-'}{fmt(t.amount)}
                      </Text>
                      {t.type === 'expense' && (
                        <View style={[
                          styles.payBadge,
                          { backgroundColor: t.pay === '信用卡' ? 'rgba(56,189,248,0.15)' : 'rgba(52,211,153,0.15)' },
                        ]}>
                          <Text style={[
                            styles.payBadgeText,
                            { color: t.pay === '信用卡' ? colors.credit : colors.income },
                          ]}>
                            {t.pay}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Pressable
                      onPress={() => setDeleteTargetId(t.id)}
                      style={styles.delBtn}
                      hitSlop={8}
                    >
                      <Feather name="trash-2" size={16} color="#bbb" />
                    </Pressable>
                  </View>
                </Card>
              ))}
            </View>
          ))
        )}


        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ══════════════════════════════════
          FAB 機器人（固定右下角，絕對定位）
      ══════════════════════════════════ */}
      <FabRobot budgetPct={budgetPct} onPress={() => openAddModal('expense')} />

      {/* ── Toast ── */}
      {!!toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* ════════════════════════════════════
          記帳 Modal
      ════════════════════════════════════ */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          Keyboard.dismiss();
          setTimeout(() => setShowAddModal(false), 50);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => {
            Keyboard.dismiss();
            setTimeout(() => setShowAddModal(false), 50);
          }} />
          <View style={styles.modalBox}>
            {/* 類型切換 */}
            <View style={styles.typeRow}>
              {(['expense', 'income'] as const).map(type => (
                <Pressable
                  key={type}
                  style={[
                    styles.typeBtn,
                    addType === type && {
                      backgroundColor: type === 'expense' ? 'rgba(255,61,0,0.18)' : 'rgba(0,230,118,0.18)',
                      borderWidth: 1.5,
                      borderColor: type === 'expense' ? colors.expense : colors.income,
                    },
                  ]}
                  onPress={() => {
                    setAddType(type);
                    setAddCat(type === 'expense' ? '餐飲' : '薪資');
                    setAddPay('現金');
                  }}
                >
                  <Text style={[styles.typeBtnText, { color: type === 'expense' ? colors.expense : colors.income }]}>
                    {type === 'expense' ? '支出' : '收入'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* 金額 */}
            <TextInput
              style={styles.amtInput}
              placeholder="金額 NT$"
              keyboardType="numeric"
              value={addAmt}
              onChangeText={setAddAmt}
              autoFocus
            />

            {/* 類別 */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              {CATS[addType].map(c => (
                <Pressable
                  key={c.n}
                  style={[styles.catChip, addCat === c.n && styles.catChipActive]}
                  onPress={() => setAddCat(c.n)}
                >
                  <Text style={styles.catChipText}>{c.e} {c.n}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* 付款方式 */}
            {addType === 'expense' && (
              <View style={styles.payRow}>
                {(['現金', '信用卡'] as const).map(pay => (
                  <Pressable
                    key={pay}
                    style={[styles.payBtn, addPay === pay && styles.payBtnActive]}
                    onPress={() => setAddPay(pay)}
                  >
                    <Text style={styles.payBtnText}>{pay === '現金' ? '現金' : '信用卡'}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* 日期選擇器 */}
            <Pressable style={styles.dateTrigger} onPress={() => setShowDatePicker(true)}>
              <Feather name="calendar" size={16} color={colors.textSecondary} />
              <Text style={styles.dateTriggerText}>
                {`${selectedDate.getFullYear()} / ${String(selectedDate.getMonth()+1).padStart(2,'0')} / ${String(selectedDate.getDate()).padStart(2,'0')}`}
              </Text>
              <Feather name="chevron-down" size={14} color={colors.textMuted} />
            </Pressable>

            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="default"
                onChange={(_event, date) => {
                  setShowDatePicker(false);
                  if (date) setSelectedDate(date);
                }}
              />
            )}

            {/* 備註 */}
            <TextInput
              style={styles.noteInput}
              placeholder="備註（選填）"
              value={addNote}
              onChangeText={setAddNote}
            />

            {/* 送出 */}
            <Pressable
              style={[styles.submitBtn, { backgroundColor: addType === 'expense' ? colors.expense : colors.income }]}
              onPress={handleAddTx}
            >
              <Text style={styles.submitBtnText}>
                {addType === 'expense' ? '記帳支出' : '記帳收入'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════
          存款 Modal
      ════════════════════════════════════ */}
      <Modal
        visible={showSavingsModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSavingsModal(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowSavingsModal(false)} />
        <View style={styles.modalCenter}>
          <View style={styles.modalBox}>
            <View style={styles.modalTitleRow}>
              <Feather name="dollar-sign" size={18} color={colors.savings} />
              <Text style={styles.modalTitle}>編輯存款基準</Text>
            </View>
            <TextInput
              style={styles.amtInput}
              placeholder="NT$"
              keyboardType="numeric"
              value={savingsInput}
              onChangeText={setSavingsInput}
              autoFocus
            />
            <View style={styles.btnRow}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowSavingsModal(false)}>
                <Text style={styles.cancelText}>取消</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: colors.savings }]}
                onPress={() => {
                  const v = parseFloat(savingsInput);
                  if (isNaN(v) || v < 0) { showToast('❌ 無效金額'); return; }
                  useBudgetStore.getState().updateSavings(v);
                  setShowSavingsModal(false);
                  showToast('🏦 存款已更新');
                }}
              >
                <Text style={styles.confirmText}>儲存</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════
          刪除確認 Modal
      ════════════════════════════════════ */}
      <Modal
        visible={deleteTargetId !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setDeleteTargetId(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setDeleteTargetId(null)} />
        <View style={styles.modalCenter}>
          <View style={styles.modalBox}>
            <View style={styles.modalTitleRow}>
              <Feather name="trash-2" size={18} color="#C62828" />
              <Text style={styles.modalTitle}>確認刪除？</Text>
            </View>
            <Text style={styles.modalSub}>此操作無法復原</Text>
            <View style={styles.btnRow}>
              <Pressable style={styles.cancelBtn} onPress={() => setDeleteTargetId(null)}>
                <Text style={styles.cancelText}>取消</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: colors.expense }]}
                onPress={() => {
                  if (deleteTargetId !== null) deleteTransaction(deleteTargetId);
                  setDeleteTargetId(null);
                  showToast('🗑️ 已刪除');
                }}
              >
                <Text style={styles.confirmText}>刪除</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════
// StyleSheet
// ═══════════════════════════════════════════════
const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: colors.appBg },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  // ── 通用卡片：無外層 elevation，與 SettingsScreen 同樣直接用 GlassCard ──
  card: { padding: spacing.xl, overflow: 'hidden' },
  insetBox: {
    backgroundColor: colors.insetBg,
    borderRadius:    radius.sm,
    borderWidth:     1,
    borderColor:     colors.insetBorder,
    shadowColor:     '#000',
    shadowOffset:    { width: 2, height: 2 },
    shadowOpacity:   0.5,
    shadowRadius:    4,
  },

  // ── Header ──
  header: {
    flexDirection:    'row',
    alignItems:       'flex-start',
    paddingHorizontal: spacing.screenH2,
    paddingTop:        28,
    paddingBottom:     spacing.screenH2,
  },
  headerLeft:     { flex: 1, marginRight: spacing.sm },
  headerDate:     { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: 6 },
  headerGreeting: { fontSize: 20, fontWeight: '700', lineHeight: 28, color: colors.textPrimary, marginBottom: 10 },
  periodBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf:        'flex-start',
    backgroundColor:  'rgba(255,255,255,0.65)',
    borderRadius:     radius.pill, paddingVertical: 4, paddingHorizontal: 12,
    borderWidth: 1,   borderColor: 'rgba(255,255,255,0.9)',
  },
  periodDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.periodDot },
  periodLabel:{ fontSize: fontSize.base, color: colors.textPrimary, fontWeight: '500' },
  headerGif:  { width: 92, height: 92, flexShrink: 0 },

  // ── 四宮格 ──
  gridWrapper: {
    flexDirection:    'row',
    flexWrap:         'wrap',
    justifyContent:   'space-between',
    paddingHorizontal: spacing.xl,
    marginTop:         spacing.xs,
    marginBottom:      spacing.xs,
  },
  neuCardOuter: {
    width:        '47%',
    height:       80,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    overflow:     'hidden',
  },
  neuCardBody: {
    flex:              1,
    paddingHorizontal: spacing.lg,
    justifyContent:    'center',
  },
  sumRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sumIconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)', flexShrink: 0,
  },
  sumTextCol: { flex: 1, justifyContent: 'center' },
  sumLabel:   { fontSize: fontSize.md, color: colors.textMuted, marginBottom: 4 },
  sumVal:     { fontSize: 20, fontWeight: '700' },

  // ── 存款橫幅 ──
  savingsBanner: {
    marginHorizontal:  spacing.screenH,
    marginBottom:      spacing.screenH,
    borderRadius:      radius.xl,
    backgroundColor:   '#5E35B1',
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   16,
    paddingHorizontal: 18,
    ...shadows.savings,
  },
  savingsLeft:        { flex: 1, paddingRight: spacing.sm },
  savingsBannerLabel: { fontSize: fontSize.md, color: 'rgba(255,255,255,0.85)', fontWeight: '500', marginBottom: 8 },
  savingsBannerAmt:   { fontSize: fontSize.hero, fontWeight: '700', color: colors.textWhite, marginBottom: 6 },
  savingsBannerSub:   { fontSize: fontSize.xs + 2, color: 'rgba(255,255,255,0.65)' },

  // ── 進度條 ──
  progressCard: { marginHorizontal: spacing.screenH, marginBottom: spacing.screenH, borderRadius: radius.lg },
  progressTop:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressTitle:  { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  progressMeta:   { fontSize: fontSize.base, color: colors.textSecondary },
  progressTrack:  { height: 10, overflow: 'hidden', marginBottom: 8 },
  progressFill:   { height: 10, borderRadius: 6 },
  progressBottom: { flexDirection: 'row', justifyContent: 'space-between' },

  // ── 圓餅圖 ──
  pieRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, gap: 10, marginBottom: 18,
  },
  pieCard: {
    flex: 1,
    borderRadius: radius.xl, padding: spacing.lg,
  },
  pieTitle:  { fontSize: fontSize.md, fontWeight: '700', color: '#E0E0E0', marginBottom: 10 },
  pieCenter: { alignItems: 'center', marginBottom: 8 },

  // ── 明細 ──
  sectionTitle: { fontSize: fontSize.h3, fontWeight: '700', paddingHorizontal: spacing.xl, marginBottom: 10 },
  emptyText:    { textAlign: 'center', paddingVertical: 32, color: colors.textHint, fontSize: fontSize.lg },
  dayGroup:     { marginBottom: spacing.lg, paddingHorizontal: spacing.screenH },
  dayLabelRow:  { marginBottom: 8 },
  dayLabelText: {
    fontSize: fontSize.md, fontWeight: '700', color: colors.textSecondary,
    backgroundColor: colors.tagBg, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.xs,
  },
  txCard:      { marginBottom: 8 },
  txRow:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  txIconBox:   { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txIconEmoji: { fontSize: 20 },
  txInfo:      { flex: 1, minWidth: 0 },
  txName:      { fontSize: fontSize.lg, fontWeight: '600', color: colors.textPrimary },
  txTimeRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  txTime:      { fontSize: fontSize.base, color: colors.textMuted },
  txRight:     { alignItems: 'flex-end', flexShrink: 0 },
  txAmount:    { fontSize: fontSize.xl, fontWeight: '700' },
  payBadge:    { borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3 },
  payBadgeText:{ fontSize: fontSize.xs + 1, fontWeight: '600' },
  delBtn:      { paddingHorizontal: 4, paddingVertical: 2 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },


  // ── Toast ──
  toast: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.78)',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.pill,
  },
  toastText: { color: colors.textWhite, fontSize: fontSize.lg },

  // ── Modals ──
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(14,20,40,0.52)' },
  modalBox: {
    backgroundColor:    'rgba(235,240,250,0.88)',
    borderTopLeftRadius:  radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: 22,
    paddingBottom: 32,
    borderTopWidth:  1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 0,
    borderTopColor:   'rgba(255,255,255,0.95)',
    borderLeftColor:  'rgba(255,255,255,0.7)',
    borderRightColor: 'rgba(255,255,255,0.3)',
  },
  modalCenter: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  modalTitle:  { fontSize: fontSize.h2, fontWeight: '700', marginBottom: 0, color: colors.textPrimary },
  modalSub:    { fontSize: fontSize.lg, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 },

  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: {
    flex: 1, padding: 12, borderRadius: radius.lg, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)',
  },
  typeBtnText: { fontWeight: '700', fontSize: fontSize.xl, color: colors.textPrimary },

  amtInput: {
    borderWidth: 1.5, borderRadius: radius.lg,
    borderTopColor:   'rgba(255,255,255,0.9)',
    borderLeftColor:  'rgba(255,255,255,0.7)',
    borderBottomColor:'rgba(200,210,225,0.5)',
    borderRightColor: 'rgba(200,210,225,0.5)',
    padding: spacing.lg, fontSize: 22, fontWeight: '700',
    textAlign: 'right', marginBottom: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.65)',
    color: colors.textPrimary,
  },

  catScroll: { marginBottom: spacing.lg },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)',
  },
  catChipActive: {
    backgroundColor: 'rgba(52,211,153,0.18)',
    borderWidth: 1.5, borderColor: colors.income,
  },
  catChipText: { fontSize: fontSize.md, fontWeight: '600', color: colors.textSecondary },

  payRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg },
  payBtn: {
    flex: 1, padding: 11, borderRadius: radius.lg, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)',
  },
  payBtnActive: {
    backgroundColor: 'rgba(56,189,248,0.18)',
    borderWidth: 1.5, borderColor: colors.credit,
  },
  payBtnText: { fontWeight: '600', fontSize: fontSize.lg, color: colors.textSecondary },

  noteInput: {
    borderWidth: 1.5, borderRadius: radius.lg,
    borderTopColor:   'rgba(255,255,255,0.9)',
    borderLeftColor:  'rgba(255,255,255,0.7)',
    borderBottomColor:'rgba(200,210,225,0.5)',
    borderRightColor: 'rgba(200,210,225,0.5)',
    padding: 12, fontSize: fontSize.lg, marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.65)',
    color: colors.textPrimary,
  },

  submitBtn:     { padding: 16, borderRadius: radius.lg, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: colors.textWhite, fontSize: fontSize.h3, fontWeight: '700', letterSpacing: 0.5 },

  // ── 日期觸發按鈕 ──
  dateTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: radius.lg, padding: 14, marginBottom: 12,
    borderWidth: 1.5,
    borderTopColor:    'rgba(255,255,255,0.9)',
    borderLeftColor:   'rgba(255,255,255,0.7)',
    borderBottomColor: 'rgba(200,210,225,0.5)',
    borderRightColor:  'rgba(200,210,225,0.5)',
  },
  dateTriggerText: {
    flex: 1, fontSize: fontSize.lg, fontWeight: '600', color: colors.textPrimary,
  },

  btnRow:    { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, padding: spacing.lg, borderRadius: radius.lg, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)',
  },
  cancelText:  { fontSize: fontSize.xl, fontWeight: '600', color: colors.textSecondary },
  confirmBtn:  { flex: 1, padding: spacing.lg, borderRadius: radius.lg, alignItems: 'center' },
  confirmText: { color: colors.textWhite, fontSize: fontSize.xl, fontWeight: '700' },
});
