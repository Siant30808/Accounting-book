/**
 * ReportScreen — 月結報表
 * 忠實移植 index.html renderReport()
 *
 * 4 欄：週期 | 月初餘額 | 現金支出 | 月底結餘
 *
 * 月初餘額推算邏輯（完全對應原版）：
 *   startBals[cpIdx] = settings.savings（當期月初 = 現存款）
 *   往前推：startBals[i] = stored[key] ?? startBals[i+1] - stats[i].net
 *   往後推：startBals[i] = stored[key] ?? startBals[i-1] + stats[i-1].net
 */

import React, { useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  SafeAreaView, StatusBar,
} from 'react-native';
import { useBudgetStore } from '../store/useBudgetStore';
import { fmt } from '../utils/format';
import { localDateStr } from '../utils/period';
import { Period } from '../types';
import { colors, radius, spacing, fontSize } from '../theme';
import { GlassCard } from '../components/GlassCard';

// ── NT$ 格式（帶千位逗號）────────────────────
function fmtNT(n: number) {
  return 'NT$' + Math.round(Math.abs(n)).toLocaleString('zh-TW');
}

// ── 主元件 ────────────────────────────────────
export function ReportScreen() {
  const { transactions, settings, getAllPeriods, getPeriodTxs } = useBudgetStore();

  // 由舊到新（對應原版 .reverse()）
  const allPeriods = useMemo(
    () => getAllPeriods().slice().reverse(),
    [transactions, settings.payday],
  );

  // 計算各期 income / cashExp / net
  const stats = useMemo(() => allPeriods.map(p => {
    const txs     = getPeriodTxs(p);
    const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const cashExp = txs.filter(t => t.type === 'expense' && t.pay === '現金').reduce((s, t) => s + t.amount, 0);
    return { p, income, cashExp, net: income - cashExp };
  }), [allPeriods, transactions]);

  // 當期 index：用 YYYY-MM-DD 字串比較，避免 Date midnight 導致末日失準
  const cpIdx = useMemo(() => {
    const today = localDateStr(new Date());
    const idx   = stats.findIndex(s => today >= s.p.startStr && today <= s.p.endStr);
    return idx >= 0 ? idx : stats.length - 1;
  }, [stats]);

  // 月初餘額陣列（完全對應原版推算邏輯）
  const startBals = useMemo(() => {
    if (stats.length === 0) return [] as number[];
    const stored = settings.periodBalances ?? {};
    const bals   = new Array<number>(stats.length);
    bals[cpIdx]  = settings.savings;             // 當期月初 = 現存款

    // 往前推（較舊的期）
    for (let i = cpIdx - 1; i >= 0; i--) {
      const key = stats[i].p.startStr;
      bals[i] = stored[key] !== undefined
        ? stored[key]
        : bals[i + 1] - stats[i].net;
    }
    // 往後推（未來期，保留相容）
    for (let i = cpIdx + 1; i < stats.length; i++) {
      const key = stats[i].p.startStr;
      bals[i] = stored[key] !== undefined
        ? stored[key]
        : bals[i - 1] + stats[i - 1].net;
    }
    return bals;
  }, [stats, cpIdx, settings.savings, settings.periodBalances]);

  // 由新到舊顯示（slice().reverse()）
  const rows = useMemo(
    () => stats.map((s, i) => ({ ...s, openBal: startBals[i], isCurrent: i === cpIdx }))
              .slice()
              .reverse(),
    [stats, startBals, cpIdx],
  );

  return (
    <SafeAreaView style={sty.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={sty.scroll}
        contentContainerStyle={sty.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header（完全對應原版）── */}
        <View style={sty.header}>
          <Text style={sty.headerSub}>歷史紀錄</Text>
          <Text style={sty.headerTitle}>月結報表</Text>
        </View>

        {/* ── 表格卡片：與 SettingsScreen 同樣直接用 GlassCard，不加外層 elevation View ── */}
        <GlassCard style={sty.card}>

          {/* 表頭 */}
          <View style={sty.thead}>
            <Text style={[sty.th, sty.colPeriod]}>週期</Text>
            <Text style={[sty.th, sty.colNum]}>月初餘額</Text>
            <Text style={[sty.th, sty.colNum]}>現金支出</Text>
            <Text style={[sty.th, sty.colNum]}>月底結餘</Text>
          </View>

          {rows.length === 0 ? (
            <View style={sty.empty}>
              <Text style={sty.emptyText}>尚無記帳資料</Text>
            </View>
          ) : (
            rows.map((row, idx) => {
              const closeBal = row.openBal + row.net;
              const isLast   = idx === rows.length - 1;
              return (
                <View
                  key={row.p.startStr}
                  style={[
                    sty.tr,
                    row.isCurrent && sty.trCurrent,
                    isLast && sty.trLast,
                  ]}
                >
                  {/* 週期 */}
                  <View style={[sty.colPeriod, { flexDirection: 'row', alignItems: 'center' }]}>
                    <Text style={sty.tdPeriod}>{row.p.label}</Text>
                    {row.isCurrent && <Text style={sty.dot}> ●</Text>}
                  </View>

                  {/* 月初餘額 */}
                  <Text style={[sty.td, sty.colNum, sty.tdAmt,
                    row.openBal >= 0 ? sty.amtPos : sty.amtNeg]}>
                    {fmtNT(row.openBal)}
                  </Text>

                  {/* 現金支出（永遠紅色）*/}
                  <Text style={[sty.td, sty.colNum, sty.tdAmt, sty.amtNeg]}>
                    {row.cashExp > 0 ? fmtNT(row.cashExp) : '—'}
                  </Text>

                  {/* 月底結餘 */}
                  <Text style={[sty.td, sty.colNum, sty.tdAmt,
                    closeBal >= 0 ? sty.amtPos : sty.amtNeg]}>
                    {fmtNT(closeBal)}
                  </Text>
                </View>
              );
            })
          )}
        </GlassCard>

        {/* ── 備註說明 ── */}
        <View style={sty.noteWrap}>
          <Text style={sty.note}>
            * 月初餘額為換期時鎖定的存款基準值{'\n'}
            * 現金支出不含信用卡消費{'\n'}
            * 月底結餘 = 月初餘額 + 收入 − 現金支出
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────
const COL_PERIOD = 100;   // 週期欄固定寬

const sty = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.appBg },
  scroll:  { flex: 1 },
  content: { paddingBottom: spacing.xxl },

  // Header
  header:      { paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl, paddingBottom: spacing.xl },
  headerSub:   { fontSize: fontSize.md, color: colors.textMuted, marginBottom: spacing.xs },
  headerTitle: { fontSize: fontSize.h1, fontWeight: '700', color: colors.textPrimary },

  // 卡片（與 SettingsScreen 同樣：直接 GlassCard，無外層 elevation）
  card: {
    marginHorizontal:  spacing.xl,
    borderRadius:      radius.xl,
    paddingHorizontal: spacing.xs,
    overflow:          'hidden',
  },

  // 表頭
  thead: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(220,220,220,0.7)',
  },
  th: {
    fontSize: fontSize.base,
    color:    colors.textMuted,
    fontWeight: '700',
  },

  // 欄寬定義
  colPeriod: { flex: 0, width: COL_PERIOD },
  colNum:    { flex: 1, textAlign: 'right' },

  // 資料列
  tr: {
    flexDirection: 'row',
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(220,220,220,0.5)',
    alignItems: 'center',
  },
  trCurrent: { backgroundColor: 'rgba(46,125,50,0.06)' },
  trLast:    { borderBottomWidth: 0 },

  td:       { fontSize: fontSize.md },
  tdAmt:    { fontWeight: '700' },

  // 週期欄
  tdPeriod: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  dot:      { fontSize: fontSize.xs, color: colors.periodDot },

  // 金額顏色
  amtPos: { color: colors.income  },
  amtNeg: { color: colors.expense },

  // 空狀態
  empty:     { padding: 40, alignItems: 'center' },
  emptyText: { color: colors.textDisabled, fontSize: fontSize.lg },

  // 底部備註
  noteWrap: { marginHorizontal: spacing.xl, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
  note:     { fontSize: fontSize.sm, color: colors.textDisabled, lineHeight: 18 },
});
