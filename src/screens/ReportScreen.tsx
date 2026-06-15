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
import { colors, radius, spacing, fontSize, textShadows } from '../theme';
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

        {/* ── 表頭 ── */}
        <View style={sty.thead}>
          <Text numberOfLines={1} style={[sty.th, sty.colPeriod]}>週期</Text>
          <Text numberOfLines={1} style={[sty.th, sty.colNum]}>月初餘額</Text>
          <Text numberOfLines={1} style={[sty.th, sty.colNum]}>現金支出</Text>
          <Text numberOfLines={1} style={[sty.th, sty.colNum, { fontWeight: '800' }]}>月底結餘</Text>
        </View>

        {/* ── 各列獨立懸浮卡片 ── */}
        {rows.length === 0 ? (
          <View style={sty.empty}>
            <Text style={sty.emptyText}>尚無記帳資料</Text>
          </View>
        ) : (
          rows.map((row) => {
            const closeBal = row.openBal + row.net;
            return (
              <GlassCard
                key={row.p.startStr}
                style={[sty.tr, row.isCurrent && sty.trCurrent]}
                colorTop={row.isCurrent ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.42)'}
                colorBot={row.isCurrent ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.10)'}
                borderRadius={radius.md}
              >
                {/* 週期 */}
                <View style={[sty.colPeriod, { flexDirection: 'row', alignItems: 'center' }]}>
                  <Text style={[sty.tdPeriod, textShadows.light]}>{row.p.label}</Text>
                  {row.isCurrent && <Text style={sty.dot}> ●</Text>}
                </View>

                {/* 月初餘額 */}
                <Text numberOfLines={1} adjustsFontSizeToFit
                  style={[sty.td, sty.colNum, sty.tdAmt, textShadows.light,
                  row.openBal >= 0 ? sty.amtPos : sty.amtNeg]}>
                  {fmtNT(row.openBal)}
                </Text>

                {/* 現金支出（粉彩紅）*/}
                <Text numberOfLines={1} adjustsFontSizeToFit
                  style={[sty.td, sty.colNum, sty.tdAmt, textShadows.light, sty.amtNeg]}>
                  {row.cashExp > 0 ? fmtNT(row.cashExp) : '—'}
                </Text>

                {/* 月底結餘（薰衣草紫，800 加粗）*/}
                <Text numberOfLines={1} adjustsFontSizeToFit
                  style={[sty.td, sty.colNum, sty.tdAmt, textShadows.light,
                  { fontWeight: '800', color: closeBal >= 0 ? colors.savings : colors.expense }]}>
                  {fmtNT(closeBal)}
                </Text>
              </GlassCard>
            );
          })
        )}

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
const sty = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.appBg },
  scroll:  { flex: 1 },
  content: { paddingBottom: spacing.xxl },

  // Header
  header:      { paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl, paddingBottom: spacing.xl },
  headerSub:   { fontSize: fontSize.md, color: colors.textMuted, marginBottom: spacing.xs },
  headerTitle: { fontSize: fontSize.h1, fontWeight: '700', color: colors.textPrimary },

  // 表頭（不需要卡片，直接懸空在列表上方）
  thead: {
    flexDirection:     'row',
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.xl,
    marginHorizontal:  spacing.xl,
    marginBottom:      spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200,210,220,0.5)',
  },
  th: {
    fontSize:   12,
    color:      colors.textMuted,
    fontWeight: '700',
    ...textShadows.light,
  },

  // 欄寬：週期 flex:2，數字欄各 flex:2.5，每欄左側有 paddingLeft 間距
  colPeriod: { flex: 2 },
  colNum:    { flex: 2.5, textAlign: 'right', paddingLeft: 8 },

  // 各列：獨立懸浮 GlassCard
  tr: {
    flexDirection:     'row',
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal:  spacing.xl,
    marginBottom:      spacing.xs,
    alignItems:        'center',
  },
  trCurrent: { /* colorTop/Bot 由 GlassCard prop 控制，這裡不再需要 backgroundColor */ },

  td:    { fontSize: 13 },
  tdAmt: { fontWeight: '700', fontSize: 13 },

  // 週期欄
  tdPeriod: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
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
