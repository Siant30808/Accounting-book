/**
 * ReportScreen — 月結報表（卡片式）
 *
 * 布局：
 *   1. 本期摘要卡（頂部，當期 income/expense/savings/balance）
 *   2. 週期紀錄列表（最新在上，可展開細節）
 *      展開：預算回顧、最大支出、最大餐費、支出圓餅圖
 *   3. 只有一個週期時顯示提示
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  SafeAreaView, StatusBar, Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useBudgetStore } from '../store/useBudgetStore';
import { SkiaPieChart, ChartSlice } from '../components/SkiaPieChart';
import { PieLegend } from '../components/PieLegend';
import { fmt } from '../utils/format';
import { localDateStr } from '../utils/period';
import { Period, normalizeCategory } from '../types';
import { colors, radius, spacing, fontSize } from '../theme';
import { GlassCard } from '../components/GlassCard';

// 圓餅圖顏色（低飽和 10 色）
const PIE_COLORS = [
  '#DB4F91','#F97316','#F59E0B','#10B981',
  '#0284C7','#8B5CF6','#64748B','#14B8A6',
  '#6366F1','#FB7185',
];

type ExpandedKey = string | null;

// ── 主元件 ───────────────────────────────────────
export function ReportScreen() {
  const { transactions, settings, getAllPeriods, getPeriodTxs } = useBudgetStore();
  const [expanded, setExpanded] = useState<ExpandedKey>(null);

  const toggleExpand = useCallback((key: string) => {
    setExpanded(prev => prev === key ? null : key);
  }, []);

  // 舊到新排列
  const allPeriods = useMemo(
    () => getAllPeriods().slice().reverse(),
    [transactions, settings.payday],
  );

  // 每期統計
  const stats = useMemo(() => allPeriods.map(p => {
    const txs      = getPeriodTxs(p);
    const income   = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const cashExp  = txs.filter(t => t.type === 'expense' && t.pay === '現金').reduce((s, t) => s + t.amount, 0);
    const totalExp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { p, income, cashExp, totalExp, cashNet: income - cashExp };
  }), [allPeriods, transactions]);

  // 當期 index
  const cpIdx = useMemo(() => {
    const today = localDateStr(new Date());
    const idx   = stats.findIndex(s => today >= s.p.startStr && today <= s.p.endStr);
    return idx >= 0 ? idx : stats.length - 1;
  }, [stats]);

  // 存款（期初餘額）陣列
  const startBals = useMemo(() => {
    if (stats.length === 0) return [] as number[];
    const stored = settings.periodBalances ?? {};
    const bals   = new Array<number>(stats.length);
    bals[cpIdx]  = settings.savings;
    for (let i = cpIdx - 1; i >= 0; i--) {
      const key = stats[i].p.startStr;
      bals[i] = stored[key] !== undefined ? stored[key] : bals[i + 1] - stats[i].cashNet;
    }
    for (let i = cpIdx + 1; i < stats.length; i++) {
      const key = stats[i].p.startStr;
      bals[i] = stored[key] !== undefined ? stored[key] : bals[i - 1] + stats[i - 1].cashNet;
    }
    return bals;
  }, [stats, cpIdx, settings.savings, settings.periodBalances]);

  // 新到舊的顯示列（帶 remaining = 期末存款）
  const rows = useMemo(
    () => stats
      .map((s, i) => ({
        ...s,
        openBal:   startBals[i] ?? 0,
        remaining: (startBals[i] ?? 0) + s.cashNet,
        isCurrent: i === cpIdx,
      }))
      .slice()
      .reverse(),
    [stats, startBals, cpIdx],
  );

  const currentRow = rows.find(r => r.isCurrent);

  // 本期天數進度
  const { elapsed, totalDays } = useMemo(() => {
    if (!currentRow) return { elapsed: 0, totalDays: 0 };
    const p     = currentRow.p;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(p.startStr + 'T00:00:00');
    const end   = new Date(p.endStr   + 'T00:00:00');
    const el    = Math.round((today.getTime() - start.getTime()) / 86400000) + 1;
    const tot   = Math.round((end.getTime()   - start.getTime()) / 86400000) + 1;
    return { elapsed: Math.max(1, el), totalDays: tot };
  }, [currentRow]);

  // 展開細節計算（惰性，只在展開時算）
  const getDetail = useCallback((p: Period) => {
    const txs    = getPeriodTxs(p);
    const expTxs = txs.filter(t => t.type === 'expense');

    // 分類加總
    const catMap: Record<string, number> = {};
    expTxs.forEach(t => {
      const n = normalizeCategory(t.cat);
      catMap[n] = (catMap[n] ?? 0) + t.amount;
    });

    // 預算回顧（餐費 + 食材採購 + 日用品 + 娛樂）
    const budgetRows = [
      {
        cat:    '餐費',
        spent:  catMap['餐費'] ?? 0,
        budget: settings.mealPeriodBudget ?? 9000,
      },
      ...(['食材採購', '日用品', '娛樂'] as const).map(cat => ({
        cat,
        spent:  catMap[cat] ?? 0,
        budget: settings.monthlyCategoryBudgets[cat] ?? 0,
      })),
    ];

    // 最大支出
    const largestExp = expTxs.reduce<(typeof expTxs)[0] | null>(
      (m, t) => (!m || t.amount > m.amount) ? t : m, null,
    );

    // 最大餐費
    const mealTxs   = expTxs.filter(t => normalizeCategory(t.cat) === '餐費');
    const largestMeal = mealTxs.reduce<(typeof mealTxs)[0] | null>(
      (m, t) => (!m || t.amount > m.amount) ? t : m, null,
    );

    // 圓餅切片
    const slices: ChartSlice[] = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([label, amount], i) => ({ label, amount, color: PIE_COLORS[i % PIE_COLORS.length] }));

    return { budgetRows, largestExp, largestMeal, slices };
  }, [getPeriodTxs, settings]);

  const nonCurrentRows = rows.filter(r => !r.isCurrent);

  return (
    <SafeAreaView style={sty.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={sty.scroll}
        contentContainerStyle={sty.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={sty.header}>
          <Text style={sty.headerSub}>歷史紀錄</Text>
          <Text style={sty.headerTitle}>月結報表</Text>
        </View>

        {/* ── 本期摘要卡 ── */}
        {currentRow && (
          <GlassCard
            style={sty.summaryCard}
            colorTop="rgba(255,255,255,0.76)"
            colorBot="rgba(248,250,252,0.35)"
            borderRadius={24}
          >
            <View style={sty.summaryHead}>
              <Text style={sty.summaryTitle}>本期摘要</Text>
              <Text style={sty.summaryPeriod}>
                {currentRow.p.label}｜第 {elapsed}/{totalDays} 天
              </Text>
            </View>
            <View style={sty.fourGrid}>
              <View style={sty.gridCell}>
                <Text style={sty.cellLabel}>收入</Text>
                <Text style={[sty.cellValue, { color: colors.income }]}>
                  {fmt(currentRow.income)}
                </Text>
              </View>
              <View style={sty.gridCell}>
                <Text style={sty.cellLabel}>花費</Text>
                <Text style={[sty.cellValue, { color: colors.expense }]}>
                  {fmt(currentRow.totalExp)}
                </Text>
              </View>
              <View style={sty.gridCell}>
                <Text style={sty.cellLabel}>剩餘存款</Text>
                <Text style={[sty.cellValue, { color: colors.savings }]}>
                  {fmt(currentRow.remaining)}
                </Text>
              </View>
              <View style={sty.gridCell}>
                <Text style={sty.cellLabel}>本期結餘</Text>
                <Text style={[sty.cellValue, {
                  color: currentRow.income - currentRow.totalExp >= 0
                    ? colors.income : colors.expense,
                }]}>
                  {currentRow.income - currentRow.totalExp >= 0 ? '+' : ''}
                  {fmt(currentRow.income - currentRow.totalExp)}
                </Text>
              </View>
            </View>
          </GlassCard>
        )}

        {/* ── 週期紀錄 ── */}
        <Text style={sty.sectionTitle}>週期紀錄</Text>

        {nonCurrentRows.length === 0 ? (
          <GlassCard
            style={sty.emptyCard}
            colorTop="rgba(255,255,255,0.45)"
            borderRadius={radius.lg}
          >
            <Text style={sty.emptyText}>
              目前只有一個週期，之後月結後會累積更多紀錄。
            </Text>
          </GlassCard>
        ) : (
          nonCurrentRows.map(row => {
            const isExp   = expanded === row.p.startStr;
            const detail  = isExp ? getDetail(row.p) : null;
            const netVal  = row.income - row.totalExp;

            return (
              <View key={row.p.startStr} style={sty.periodBlock}>
                {/* ── 週期主卡（可按展開）── */}
                <Pressable onPress={() => toggleExpand(row.p.startStr)}>
                  <GlassCard
                    style={sty.periodCard}
                    colorTop="rgba(255,255,255,0.74)"
                    borderRadius={24}
                  >
                    <View style={sty.periodHead}>
                      <Text style={sty.periodLabel}>{row.p.label}</Text>
                      <Feather
                        name={isExp ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textMuted}
                      />
                    </View>
                    <View style={sty.fourGrid}>
                      <View style={sty.gridCell}>
                        <Text style={sty.cellLabel}>收入</Text>
                        <Text style={[sty.cellValueSm, { color: colors.income }]}>
                          {fmt(row.income)}
                        </Text>
                      </View>
                      <View style={sty.gridCell}>
                        <Text style={sty.cellLabel}>花費</Text>
                        <Text style={[sty.cellValueSm, { color: colors.expense }]}>
                          {fmt(row.totalExp)}
                        </Text>
                      </View>
                      <View style={sty.gridCell}>
                        <Text style={sty.cellLabel}>剩餘存款</Text>
                        <Text style={[sty.cellValueSm, { color: colors.savings }]}>
                          {fmt(row.remaining)}
                        </Text>
                      </View>
                      <View style={sty.gridCell}>
                        <Text style={sty.cellLabel}>結餘</Text>
                        <Text style={[sty.cellValueSm, {
                          color: netVal >= 0 ? colors.income : colors.expense,
                        }]}>
                          {netVal >= 0 ? '+' : ''}{fmt(netVal)}
                        </Text>
                      </View>
                    </View>
                  </GlassCard>
                </Pressable>

                {/* ── 展開細節卡 ── */}
                {isExp && detail && (
                  <GlassCard
                    style={sty.detailCard}
                    colorTop="rgba(248,250,252,0.90)"
                    borderRadius={22}
                  >
                    {/* 預算回顧 */}
                    <Text style={sty.detailTitle}>本期預算回顧</Text>
                    {detail.budgetRows.map(b => {
                      const hasBudget = b.budget > 0;
                      const pct  = hasBudget ? Math.round((b.spent / b.budget) * 100) : 0;
                      const over = hasBudget && b.spent > b.budget;
                      return (
                        <View key={b.cat} style={sty.budgetRow}>
                          <Text style={sty.budgetCat}>{b.cat}</Text>
                          <View style={sty.budgetRight}>
                            <Text style={[sty.budgetAmt, over && { color: colors.expense }]}>
                              {fmt(b.spent)}
                              {hasBudget ? <Text style={sty.budgetSlash}> / {fmt(b.budget)}</Text> : null}
                            </Text>
                            {hasBudget && (
                              <Text style={[sty.budgetPct, over && { color: colors.expense }]}>
                                {pct}%
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })}

                    {/* 最大支出 */}
                    {detail.largestExp && (
                      <>
                        <Text style={[sty.detailTitle, { marginTop: 16 }]}>本期最大支出</Text>
                        <View style={sty.largestRow}>
                          <Text style={sty.largestNote} numberOfLines={1}>
                            {detail.largestExp.note?.trim() || normalizeCategory(detail.largestExp.cat)}
                          </Text>
                          <Text style={[sty.largestAmt, { color: colors.expense }]}>
                            {fmt(detail.largestExp.amount)}
                          </Text>
                        </View>
                      </>
                    )}

                    {/* 最大餐費 */}
                    {detail.largestMeal && (
                      <>
                        <Text style={[sty.detailTitle, { marginTop: 16 }]}>本期最大餐費</Text>
                        <View style={sty.largestRow}>
                          <Text style={sty.largestNote} numberOfLines={1}>
                            {detail.largestMeal.note?.trim() || '餐費'}
                          </Text>
                          <Text style={[sty.largestAmt, { color: colors.expense }]}>
                            {fmt(detail.largestMeal.amount)}
                          </Text>
                        </View>
                      </>
                    )}

                    {/* 圓餅圖 */}
                    {detail.slices.length > 0 && (
                      <>
                        <Text style={[sty.detailTitle, { marginTop: 16 }]}>支出分類</Text>
                        <View style={sty.pieWrap}>
                          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                            <SkiaPieChart slices={detail.slices} size={130} />
                          </View>
                          <PieLegend
                            items={detail.slices.map(s => ({
                              ...s,
                              total: row.totalExp,
                            }))}
                          />
                        </View>
                      </>
                    )}
                  </GlassCard>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────
const sty = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.appBg },
  scroll:  { flex: 1 },
  content: { paddingBottom: spacing.xxl },

  // Header
  header:      { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 },
  headerSub:   { fontSize: 14, fontWeight: '600', color: '#94A3B8', marginBottom: 4 },
  headerTitle: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: '#1E293B' },

  // 本期摘要卡
  summaryCard: {
    marginHorizontal: 24,
    marginBottom:     18,
    padding:          18,
    overflow:         'hidden',
  },
  summaryHead: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   14,
  },
  summaryTitle:  { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  summaryPeriod: { fontSize: 12, fontWeight: '500', color: '#94A3B8' },

  // 4 格 grid（本期摘要 & 週期卡共用）
  fourGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridCell: { width: '50%', paddingVertical: 8, paddingRight: 8 },
  cellLabel: {
    fontSize:     12,
    fontWeight:   '500',
    color:        '#94A3B8',
    marginBottom: 4,
  },
  cellValue: {
    fontSize:   17,
    fontWeight: '800',
  },
  cellValueSm: {
    fontSize:   15,
    fontWeight: '700',
  },

  // 分區標題
  sectionTitle: {
    fontSize:          18,
    fontWeight:        '700',
    color:             '#1E293B',
    paddingHorizontal: 24,
    marginBottom:      10,
    marginTop:         6,
  },

  // 週期卡
  periodBlock: { marginBottom: 8 },
  periodCard: {
    marginHorizontal: 24,
    padding:          16,
    overflow:         'hidden',
  },
  periodHead: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   12,
  },
  periodLabel: { fontSize: 16, fontWeight: '700', color: '#1E293B' },

  // 展開細節卡
  detailCard: {
    marginHorizontal: 24,
    marginTop:        4,
    padding:          16,
    overflow:         'hidden',
  },
  detailTitle: {
    fontSize:     15,
    fontWeight:   '700',
    color:        '#475569',
    marginBottom: 8,
  },

  // 預算行
  budgetRow: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingVertical:   6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  budgetCat:   { fontSize: 14, fontWeight: '500', color: '#1E293B', flex: 1 },
  budgetRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  budgetAmt:   { fontSize: 14, fontWeight: '600', color: '#475569' },
  budgetSlash: { fontSize: 12, color: '#94A3B8', fontWeight: '400' },
  budgetPct:   { fontSize: 12, fontWeight: '500', color: '#94A3B8', width: 34, textAlign: 'right' },

  // 最大支出行
  largestRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingVertical: 4,
  },
  largestNote: { flex: 1, fontSize: 14, color: '#475569' },
  largestAmt:  { fontSize: 14, fontWeight: '700', marginLeft: 8 },

  // 圓餅圖區
  pieWrap: {
    marginTop:         8,
    borderRadius:      16,
    overflow:          'hidden',
    backgroundColor:   'rgba(248,250,252,0.80)',
    paddingHorizontal: 12,
    paddingBottom:     12,
  },

  // 無資料
  emptyCard: {
    marginHorizontal: 24,
    padding:          32,
    overflow:         'hidden',
  },
  emptyText: {
    color:      '#94A3B8',
    fontSize:   14,
    lineHeight: 22,
    textAlign:  'center',
  },
});
