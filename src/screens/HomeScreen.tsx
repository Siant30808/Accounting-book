import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  Modal, TextInput, KeyboardAvoidingView, Keyboard,
  Platform, SafeAreaView, StatusBar, ImageBackground,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useBudgetStore }       from '../store/useBudgetStore';
import { RobotAssistant, BubbleAlert, RobotFinanceSummary } from '../components/RobotAssistant';
import { PigSavings }           from '../components/PigSavings';
import { fmt, dayLabel }        from '../utils/format';
import { localDateStr, getPeriod, getDueDateInPeriod, getBillDueDate, getBillExecutionDate } from '../utils/period';
import { BillReminderModal } from '../components/BillReminderModal';
import {
  Transaction, Bill, StockHolding,
  getCatIcon, normalizeCategory, getCatGroup, getBillPaymentMode, periodKey,
  getBillStatus, BILL_REMIND_DAYS,
} from '../types';
import { AddTransactionModal, AddTransactionInput } from '../components/AddTransactionModal';
import AppBottomSheet, { SheetButton } from '../components/AppBottomSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, fontSize, shadows, textShadows } from '../theme';
import { GlassCard } from '../components/GlassCard';
import { fetchStockPrice, StockPriceFetchError } from '../services/stockPriceService';

const kkleBwaGif = require('../../assets/KkleBWA.gif');

// ── 簡單卡片：GlassCard 直接帶 margin/padding，不用外層 elevation View ──
function Card({ children, style, colorTop }: { children: React.ReactNode; style?: object; colorTop?: string }) {
  return (
    <GlassCard style={[styles.card, style]} colorTop={colorTop}>
      {children}
    </GlassCard>
  );
}

function InsetBox({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.insetBox, style]}>{children}</View>;
}


export function HomeScreen() {
  const insets     = useSafeAreaInsets();
  const safeBottom = Platform.OS === 'android'
    ? Math.max(insets.bottom, 24)
    : Math.max(insets.bottom, 12);

  const {
    transactions, settings, bgSettings, stockHoldings, bills,
    addTransaction, deleteTransaction,
    addStockHolding, updateStockHolding, deleteStockHolding,
    checkPeriodRollover, getCurrentPeriod, getPeriodTxs,
  } = useBudgetStore();

  const period = useMemo(() => getCurrentPeriod(), [transactions, settings.payday]);
  const txs    = useMemo(() => getPeriodTxs(period), [period, transactions]);

  // 本期生活預算（食材採購 + 日用品 + 娛樂）
  const lifeBudgetTotal = useMemo(() =>
    settings.monthlyCategoryBudgets['食材採購'] +
    settings.monthlyCategoryBudgets['日用品'] +
    settings.monthlyCategoryBudgets['娛樂'],
  [settings.monthlyCategoryBudgets]);

  const { income, cashExp, cardExp, balance, totalSav, budgetPct } = useMemo(() => {
    const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const cashExp = txs.filter(t => t.type === 'expense' && t.pay === '現金').reduce((s, t) => s + t.amount, 0);
    const cardExp = txs.filter(t => t.type === 'expense' && t.pay === '信用卡').reduce((s, t) => s + t.amount, 0);
    const balance = income - cashExp;
    const totalBudget = (settings.mealPeriodBudget || 9000) + lifeBudgetTotal;
    return {
      income,
      cashExp,
      cardExp,
      balance,
      totalSav:  settings.savings + balance,
      budgetPct: Math.min(100, Math.round((cashExp / (totalBudget || 1)) * 100)),
    };
  }, [txs, settings.savings, settings.mealPeriodBudget, lifeBudgetTotal]);

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


  // ── 今日餐費 ──
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }, [today]);

  const todayMealExp = useMemo(() =>
    transactions
      .filter(t => t.date === todayStr && t.type === 'expense' && normalizeCategory(t.cat) === '餐費')
      .reduce((s, t) => s + t.amount, 0),
  [transactions, todayStr]);

  const LIFE_CATS = ['食材採購', '日用品', '娛樂'] as const;
  // ── 本期生活預算（食材採購 + 日用品 + 娛樂）──
  const lifeExp = useMemo(() => {
    const base = { '食材採購': 0, '日用品': 0, '娛樂': 0 };
    txs.filter(t => t.type === 'expense').forEach(t => {
      const n = normalizeCategory(t.cat) as keyof typeof base;
      if (n in base) base[n] += t.amount;
    });
    return base;
  }, [txs]);
  const totalLifeExp = lifeExp['食材採購'] + lifeExp['日用品'] + lifeExp['娛樂'];

  // ── 本期餐費花費 ──
  const periodMealExp = useMemo(() =>
    txs.filter(t => t.type === 'expense' && normalizeCategory(t.cat) === '餐費')
       .reduce((s, t) => s + t.amount, 0),
  [txs]);

  // ── 即將到期帳單（手動未繳才提醒；依各帳單 remindDaysBefore 提前提醒）──
  const upcomingRecurring = useMemo(() => {
    const todayMs  = today.getTime();
    const pKey     = periodKey(period.startStr);
    const holidays = settings.marketHolidays ?? [];
    return bills
      .filter(b => {
        if (getBillPaymentMode(b) !== 'manual') return false;
        return b.lastPaidPeriodKey !== pKey && !b.paidPeriods.includes(period.startStr);
      })
      .map(b => {
        const due        = getBillDueDate(b, period, holidays);
        const exec       = getBillExecutionDate(b, period);
        const daysUntil  = Math.round((due.getTime() - todayMs) / 86400000);
        const remindDays = b.remindDaysBefore ?? BILL_REMIND_DAYS;
        return {
          name:           b.name,
          amount:         b.amount,
          category:       b.cat,
          daysUntil,
          remindDays,
          paymentMode:    getBillPaymentMode(b) as 'manual' | 'auto',
          paymentRule:    (b.paymentRule ?? 'fixedDate') as 'fixedDate' | 'tPlusBusinessDays',
          executionDay:   b.dueDay,
          settlementBusinessDays: b.settlementBusinessDays ?? 2,
          executionDateStr: localDateStr(exec),
        };
      })
      .filter(b => b.daysUntil >= -7 && b.daysUntil <= b.remindDays)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [bills, period, today, settings.marketHolidays]);

  // ── 需要在首頁顯示的緊急帳單（upcoming / dueToday / overdue）──
  const urgentBills = useMemo(() => {
    const todayStr = localDateStr(today);
    const holidays = settings.marketHolidays ?? [];
    return bills
      .filter(b => b.enabled !== false)
      .map(b => {
        const due     = getBillDueDate(b, period, holidays);
        const exec    = getBillExecutionDate(b, period);
        const dueStr  = localDateStr(due);
        const execStr = localDateStr(exec);
        const status  = getBillStatus(b, todayStr, period.startStr, due);
        const daysUntil = Math.round((due.getTime() - today.getTime()) / 86400000);
        return { ...b, status, dueStr, execStr, daysUntil };
      })
      .filter(b => b.status === 'upcoming' || b.status === 'dueToday' || b.status === 'overdue')
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [bills, period, today, settings.marketHolidays]);

  // ── 傳給 RobotAssistant 的財務摘要 ──
  const financeSummary = useMemo((): RobotFinanceSummary => {
    const mealDailyAllowance  = Math.round((settings.mealPeriodBudget || 9000) / (totalDays || 1));
    const mealPeriodBudget    = settings.mealPeriodBudget || 9000;
    const mealPeriodRemaining = Math.max(0, mealPeriodBudget - periodMealExp);
    const mealRemainingDailyAvg = daysLeft > 0 ? mealPeriodRemaining / daysLeft : 0;
    return {
      todayMealSpent:      todayMealExp,
      todayMealAllowance:  mealDailyAllowance,
      mealPeriodSpent:     periodMealExp,
      mealPeriodBudget,
      mealPeriodRemaining,
      mealRemainingDailyAvg,
      mealDailyAverage:    mealRemainingDailyAvg,
      daysLeft,
      lifeBudgetSpent:     totalLifeExp,
      lifeBudgetTotal:     lifeBudgetTotal,
      categoryBudgets:     LIFE_CATS.map(name => {
        const budget = settings.monthlyCategoryBudgets[name] || 1;
        const spent  = lifeExp[name];
        return { name, spent, budget, pct: Math.min(999, Math.round((spent / budget) * 100)) };
      }),
      upcomingRecurring,
      largestExpense: (() => {
        const allExp = txs.filter(t => t.type === 'expense');
        const top    = allExp.reduce<Transaction | null>((m, t) => (!m || t.amount > m.amount) ? t : m, null);
        if (!top) return undefined;
        return { note: top.note?.trim() || normalizeCategory(top.cat), amount: top.amount, category: normalizeCategory(top.cat) };
      })(),
      largestMealExpense: (() => {
        const meals = txs.filter(t => t.type === 'expense' && normalizeCategory(t.cat) === '餐費');
        const top   = meals.reduce<Transaction | null>((m, t) => (!m || t.amount > m.amount) ? t : m, null);
        if (!top) return undefined;
        return { note: top.note?.trim() || '餐費', amount: top.amount };
      })(),
    };
  }, [todayMealExp, periodMealExp, settings.mealPeriodBudget, settings.monthlyCategoryBudgets,
      totalDays, daysLeft, lifeExp, totalLifeExp, lifeBudgetTotal, upcomingRecurring, txs]);

  // ── Modal 狀態 ──
  const [showAddModal,     setShowAddModal]     = useState(false);
  const [showSavingsModal, setShowSavingsModal] = useState(false);
  const [deleteTargetId,   setDeleteTargetId]   = useState<number | null>(null);
  const [addInitialType, setAddInitialType] = useState<'expense' | 'income'>('expense');
  const [savingsInput,     setSavingsInput]     = useState('');
  const [savingsKbHeight, setSavingsKbHeight] = useState(0);
  const [toast,    setToast]    = useState('');
  const [reminderBills, setReminderBills] = useState<Bill[] | null>(null);

  // ── 投資 Modal 狀態 ──
  const [showInvestmentModal,       setShowInvestmentModal]       = useState(false);
  const [investmentKeyboardHeight,  setInvestmentKeyboardHeight]  = useState(0);
  const [investmentView, setInvestmentView] = useState<'list' | 'form'>('list');
  const [editingStockId,     setEditingStockId]     = useState<number | null>(null);
  const [stockSymbol,        setStockSymbol]        = useState('');
  const [stockName,          setStockName]          = useState('');
  const [stockShares,        setStockShares]        = useState('');
  const [stockInvestedAmt,   setStockInvestedAmt]   = useState('');
  const [stockCurrentPrice,  setStockCurrentPrice]  = useState('');
  const [stockCurrency,      setStockCurrency]      = useState<'TWD' | 'USD'>('TWD');
  const [stockMarket,        setStockMarket]        = useState<'TW' | 'US'>('TW');
  const [isFetchingPrice,    setIsFetchingPrice]    = useState(false);
  const [deleteStockTargetId, setDeleteStockTargetId] = useState<number | null>(null);
  const [mealAlert,    setMealAlert]    = useState<BubbleAlert | null>(null);
  const [afterRecord,  setAfterRecord]  = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast  = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  }, []);

  // 存款 Modal 鍵盤高度監聽
  useEffect(() => {
    if (!showSavingsModal) { setSavingsKbHeight(0); return; }
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setSavingsKbHeight(e.endCoordinates.height),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setSavingsKbHeight(0),
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, [showSavingsModal]);

  // 投資 Modal 鍵盤高度監聽
  useEffect(() => {
    if (!showInvestmentModal) { setInvestmentKeyboardHeight(0); return; }
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setInvestmentKeyboardHeight(e.endCoordinates.height),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setInvestmentKeyboardHeight(0),
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, [showInvestmentModal]);

  useEffect(() => {
    const msg = checkPeriodRollover();
    if (msg) showToast(msg);
    const unpaid = useBudgetStore.getState().checkBillReminders();
    if (unpaid) setReminderBills(unpaid);
  }, []);

  const openAddModal = useCallback((type: 'expense' | 'income' = 'expense') => {
    setAddInitialType(type);
    setShowAddModal(true);
  }, []);

  const handleAddTx = useCallback((tx: AddTransactionInput) => {
    addTransaction({
      type:   tx.type,
      cat:    tx.cat as Transaction['cat'],
      amount: tx.amount,
      date:   tx.date,
      time:   tx.time,
      pay:    tx.pay,
      note:   tx.note,
    });
    setShowAddModal(false);
    showToast(`✅ ${tx.type === 'expense' ? (tx.pay === '信用卡' ? '💳 刷卡' : '💵 現金') + '記帳' : '💵 收入'}成功`);

    // ── 大額餐費提醒 + 記帳後回饋 ──
    if (tx.type === 'expense') {
      const normCat             = normalizeCategory(tx.cat);
      const catGroup            = getCatGroup(normCat);
      const monthlyMealBudget   = settings.mealPeriodBudget || 9000;
      const baseDailyMealBudget = monthlyMealBudget / (totalDays || 1);
      const amount              = tx.amount;
      const dateStr             = tx.date;

      let mealAlertFired = false;

      if (catGroup === 'daily' && amount > 0) {
        const currentMealSpent    = financeSummary.mealPeriodSpent;
        const mealSpentThisCycle  = currentMealSpent + amount;
        const remainingMealBudget = Math.max(0, monthlyMealBudget - mealSpentThisCycle);
        const mealImpactRate      = amount / (monthlyMealBudget || 1);
        const remainingDailyAvg   = daysLeft > 0 ? remainingMealBudget / daysLeft : 0;
        const isLargeMeal         = amount >= baseDailyMealBudget * 2 || mealImpactRate >= 0.1;

        if (isLargeMeal) {
          const pct    = (mealImpactRate * 100).toFixed(1);
          const remFmt = `NT$${Math.round(remainingMealBudget).toLocaleString('zh-TW')}`;
          const avgFmt = `NT$${Math.round(remainingDailyAvg).toLocaleString('zh-TW')}`;

          let message: string;
          let tone: BubbleAlert['tone'];
          if (remainingDailyAvg >= baseDailyMealBudget * 0.8) {
            message = `這餐比較豐盛，不過還很安全，後面幾天稍微穩一點就好。`;
            tone    = 'info';
          } else if (remainingDailyAvg >= baseDailyMealBudget * 0.5) {
            message = `這餐用了本期餐費的 ${pct}%，聚餐偶爾會發生，接下來幾天稍微收一收就好。`;
            tone    = 'warning';
          } else {
            message = `這餐花了不少，剩餘日均只剩 ${avgFmt}，接下來要收斂一點。`;
            tone    = 'danger';
          }

          setTimeout(() => setMealAlert({
            title: '🍜 餐費提醒',
            message, tone,
            stats: [
              { label: '這餐佔比', value: `${pct}%` },
              { label: '本期剩餘', value: remFmt },
              { label: '每日平均', value: avgFmt },
            ],
          }), 400);
          mealAlertFired = true;
        }
      }

      if (!mealAlertFired) {
        let feedback: string | null = null;
        const isTodayTx = dateStr === todayStr;

        if (catGroup === 'daily') {
          const mealAllowance    = financeSummary.todayMealAllowance;
          const newTodayMeal     = isTodayTx ? financeSummary.todayMealSpent + amount : financeSummary.todayMealSpent;
          const remain           = Math.max(0, mealAllowance - newTodayMeal);
          const pct              = newTodayMeal / (mealAllowance || 1);
          const isNewLargestMeal = amount > (financeSummary.largestMealExpense?.amount ?? 0);

          if (isNewLargestMeal) {
            feedback = `這筆是本期目前最大餐費，這個月不要太常這樣就可以了。`;
          } else if (!isTodayTx) {
            const newPeriodPct = Math.round((financeSummary.mealPeriodSpent + amount) / (monthlyMealBudget || 1) * 100);
            feedback = `已記餐費 ${fmt(amount)}，本期餐費累計 ${newPeriodPct}%。`;
          } else if (pct > 1) {
            feedback = `這餐比較豐盛，今天餐費會超過建議值，接下來幾天穩一點就好。`;
          } else if (pct >= 0.8) {
            feedback = `已記餐費 ${fmt(amount)}，今天快接近建議值了。`;
          } else {
            feedback = `已記餐費 ${fmt(amount)}，今天還能吃 ${fmt(remain)}。`;
          }

        } else if (catGroup === 'monthly') {
          const catInfo = financeSummary.categoryBudgets.find(c => c.name === normCat);
          if (catInfo) {
            const newSpent = catInfo.spent + amount;
            const newPct   = Math.min(999, Math.round((newSpent / (catInfo.budget || 1)) * 100));
            if (newPct >= 90) {
              feedback = `${normCat}已經用了 ${newPct}%，這個月可以先放慢一點。`;
            } else if (newPct >= 70) {
              feedback = `已記${normCat} ${fmt(amount)}，目前用了 ${newPct}%，這個月稍微留意一下。`;
            } else {
              feedback = `已記${normCat} ${fmt(amount)}，目前用了 ${newPct}%，還在可控範圍。`;
            }
          }

        } else if (catGroup === 'indep') {
          const isNewLargest = amount > (financeSummary.largestExpense?.amount ?? 0);
          if (isNewLargest && amount > 500) {
            feedback = `這筆是本期目前最大支出：${normCat} ${fmt(amount)}，我幫你標記起來。`;
          } else if (normCat === '貸款') {
            feedback = `已記貸款 ${fmt(amount)}，這筆放在獨立統計，不影響生活預算。`;
          } else if (normCat === '投資') {
            feedback = `已記投資 ${fmt(amount)}，這筆放在投資統計，不影響生活預算。`;
          } else {
            feedback = `已記${normCat} ${fmt(amount)}，這筆不影響今日餐費與生活預算。`;
          }
        }

        if (feedback) setTimeout(() => setAfterRecord(feedback), 400);
      }
    }
  }, [addTransaction, showToast, settings.mealPeriodBudget,
      totalDays, daysLeft, financeSummary, todayStr]);

  // ── 投資摘要 ──
  const investmentSummary = useMemo(() => {
    const totalInvested    = stockHoldings.reduce((s, h) => s + h.investedAmount, 0);
    const totalMarketValue = stockHoldings.reduce((s, h) => s + h.shares * h.currentPrice, 0);
    const unrealizedProfit = totalMarketValue - totalInvested;
    const returnRate       = totalInvested > 0 ? unrealizedProfit / totalInvested : 0;
    return { totalInvested, totalMarketValue, unrealizedProfit, returnRate };
  }, [stockHoldings]);

  // ── 投資表單操作 ──
  const resetStockForm = useCallback(() => {
    setEditingStockId(null);
    setStockSymbol('');
    setStockName('');
    setStockShares('');
    setStockInvestedAmt('');
    setStockCurrentPrice('');
    setStockCurrency('TWD');
    setStockMarket('TW');
  }, []);

  const startEditStock = useCallback((s: StockHolding) => {
    setEditingStockId(s.id);
    setStockSymbol(s.symbol);
    setStockName(s.name);
    setStockShares(String(s.shares));
    setStockInvestedAmt(String(s.investedAmount));
    setStockCurrentPrice(String(s.currentPrice));
    setStockCurrency(s.currency);
    setStockMarket(s.market);
    setInvestmentView('form');
  }, []);

  const handleFetchPrice = useCallback(async () => {
    if (!stockSymbol.trim()) { showToast('❌ 請先輸入股票代號'); return; }
    setIsFetchingPrice(true);
    try {
      const result = await fetchStockPrice({ symbol: stockSymbol.trim(), market: stockMarket });
      setStockCurrentPrice(String(result.price));
      showToast('✅ 現價已更新');
    } catch (e) {
      const msg = e instanceof StockPriceFetchError ? e.message : '抓取失敗';
      showToast(`⚠️ ${msg}，請手動輸入現價`);
    } finally {
      setIsFetchingPrice(false);
    }
  }, [stockSymbol, stockMarket]);

  const handleSaveStock = useCallback(() => {
    const shares         = parseFloat(stockShares);
    const investedAmount = parseFloat(stockInvestedAmt);
    const currentPrice   = parseFloat(stockCurrentPrice);
    if (!stockSymbol.trim())              { showToast('❌ 請輸入股票代號'); return; }
    if (!stockName.trim())                { showToast('❌ 請輸入股票名稱'); return; }
    if (!shares || shares <= 0)           { showToast('❌ 請輸入有效股數'); return; }
    if (!investedAmount || investedAmount <= 0) { showToast('❌ 請輸入有效投入金額'); return; }
    if (!currentPrice || currentPrice <= 0)     { showToast('❌ 請輸入有效目前價格'); return; }
    const payload = {
      symbol: stockSymbol.trim(), name: stockName.trim(),
      shares, investedAmount, currentPrice,
      currency: stockCurrency, market: stockMarket,
    };
    if (editingStockId !== null) {
      updateStockHolding(editingStockId, payload);
      showToast('✅ 持股已更新');
    } else {
      addStockHolding(payload);
      showToast('✅ 持股已新增');
    }
    resetStockForm();
    setInvestmentView('list');
  }, [stockSymbol, stockName, stockShares, stockInvestedAmt, stockCurrentPrice, stockCurrency, stockMarket, editingStockId]);

  // ── 本期花最多前三類 ──
  const topExpenses = useMemo(() => {
    const catMap: Record<string, number> = {};
    txs.filter(t => t.type === 'expense').forEach(t => {
      const n = normalizeCategory(t.cat);
      catMap[n] = (catMap[n] ?? 0) + t.amount;
    });
    return Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, amount]) => ({ cat, amount }));
  }, [txs]);

  // ── 明細篩選 ──
  const [txFilter, setTxFilter] = useState<'全部' | '餐費' | '生活' | '獨立' | '信用卡'>('全部');

  const filteredTxs = useMemo(() => {
    switch (txFilter) {
      case '餐費':   return txs.filter(t => t.type === 'expense' && normalizeCategory(t.cat) === '餐費');
      case '生活':   return txs.filter(t => t.type === 'expense' && ['食材採購','日用品','娛樂'].includes(normalizeCategory(t.cat)));
      case '獨立':   return txs.filter(t => t.type === 'expense' && getCatGroup(normalizeCategory(t.cat)) === 'indep');
      case '信用卡': return txs.filter(t => t.pay === '信用卡');
      default:       return txs;
    }
  }, [txs, txFilter]);

  // 明細群組
  const groupedEntries = useMemo(() => {
    const grouped = filteredTxs.reduce<Record<string, Transaction[]>>((m, t) => {
      (m[t.date] = m[t.date] ?? []).push(t); return m;
    }, {});
    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredTxs]);

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

  // ── 動態玻璃厚度：有背景圖時加厚白霧，強化文字可讀性 ──
  const hasBg           = !!bgSettings.fileUri;
  const dynamicGlassTop = hasBg ? 'rgba(255,255,255,0.76)' : 'rgba(255,255,255,0.42)';

  // ── 卡片內文字：固定深色系，不受 textMode 影響 ──
  // 卡片有白霧玻璃底，深色文字可讀性最佳
  const dynPrimary   = '#1E293B';
  const dynSecondary = '#475569';
  const dynMuted     = '#94A3B8';
  // dynShadow / dynShadowHeavy 在卡片內不需要，保留空物件相容舊引用
  const dynShadow      = {} as const;
  const dynShadowHeavy = {} as const;

  // ── Header 專用：跟隨 textMode（歡迎詞文字顏色）──
  const isLight = bgSettings.textMode === 'light';
  const hdrColor     = isLight ? '#FFFFFF'               : '#1E293B';
  const hdrDateColor = isLight ? 'rgba(255,255,255,0.86)' : 'rgba(30,41,59,0.72)';
  // 深色文字 → 白色輕陰影（不用黑色重陰影）；淺色文字 → 深色柔陰影
  const hdrShadow = isLight
    ? { textShadowColor: 'rgba(15,23,42,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 }
    : { textShadowColor: 'rgba(255,255,255,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 };
  const hdrChipBg     = isLight ? 'rgba(15,23,42,0.28)'    : 'rgba(255,255,255,0.72)';
  const hdrChipBorder = isLight ? 'rgba(255,255,255,0.28)'  : 'rgba(255,255,255,0.90)';

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
      {/* 可讀性遮罩：柔化背景細節，讓玻璃卡片上的文字更清晰 */}
      {hasBg && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(226,232,240,0.35)' }]}
        />
      )}
      <StatusBar
        barStyle={isLight ? 'light-content' : 'dark-content'}
        translucent
        backgroundColor="transparent"
      />

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
            <Text style={[styles.headerDate, { color: hdrDateColor }, hdrShadow]}>{headerDate}</Text>
            <Text style={[styles.headerGreeting, { color: hdrColor }, hdrShadow]} numberOfLines={2}>
              你好，{settings.username}！{greeting}
            </Text>
            <View style={[styles.periodBadge, { backgroundColor: hdrChipBg, borderColor: hdrChipBorder }]}>
              <View style={styles.periodDot} />
              <Text style={[styles.periodLabel, { color: hdrColor }]}>本期 {period.label}</Text>
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
            當前存款主卡
        ══════════════════════════════════ */}
        <Pressable
          onPress={() => { setSavingsInput(String(settings.savings)); setShowSavingsModal(true); }}
          style={styles.savingsBannerWrap}
        >
          <GlassCard
            style={styles.savingsBannerCard}
            colorTop={hasBg ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.65)'}
            colorBot="rgba(167,139,250,0.18)"
            borderRadius={radius.xl}
          >
            <View style={styles.savingsLeft}>
              <View style={styles.savingsLabelRow}>
                <Text style={styles.savingsLabelIcon}>🗂️</Text>
                <Text style={styles.savingsBannerLabel}>當前存款（自動計算）</Text>
              </View>
              <Text style={styles.savingsBannerAmt} numberOfLines={1} adjustsFontSizeToFit>
                {fmt(totalSav)}
              </Text>
              <Text style={styles.savingsBannerSub}>存款基準 + 本期結餘｜點擊更新基準</Text>
            </View>
            <View style={styles.savingsPigWrap} pointerEvents="none">
              <PigSavings onPress={() => { setSavingsInput(String(settings.savings)); setShowSavingsModal(true); }} />
            </View>
          </GlassCard>
        </Pressable>

        {/* ══════════════════════════════════
            本期現金流摘要
        ══════════════════════════════════ */}
        <Card style={styles.cashflowCard} colorTop={dynamicGlassTop}>
          <View style={styles.cashflowTitleRow}>
            <Text style={[styles.cashflowTitle, { color: dynPrimary }]}>本期現金流</Text>
            <Text style={[styles.cashflowPeriod, { color: dynMuted }]}>第 {elapsed}/{totalDays} 天</Text>
          </View>
          <View style={styles.cashflowRowItem}>
            <View style={styles.cashflowLabelGroup}>
              <Feather name="shopping-bag" size={14} color="#DB4F91" />
              <Text style={styles.cashflowLabel}>現金支出</Text>
            </View>
            <Text style={[styles.cashflowValue, { color: '#DB4F91' }]}>{fmt(cashExp)}</Text>
          </View>
          <View style={styles.cashflowRowItem}>
            <View style={styles.cashflowLabelGroup}>
              <Feather name="credit-card" size={14} color="#0284C7" />
              <Text style={styles.cashflowLabel}>信用卡刷卡</Text>
            </View>
            <Text style={[styles.cashflowValue, { color: '#0284C7' }]}>{fmt(cardExp)}</Text>
          </View>
          <View style={[styles.cashflowRowItem, styles.cashflowDivider]}>
            <View style={styles.cashflowLabelGroup}>
              <Feather name="trending-up" size={14} color={balance >= 0 ? '#10B981' : '#DB4F91'} />
              <Text style={styles.cashflowLabel}>本期結餘</Text>
            </View>
            <Text style={[styles.cashflowValue, { color: balance >= 0 ? '#10B981' : '#DB4F91' }]}>{fmt(balance)}</Text>
          </View>
          {prevBal !== 0 && (
            <Text style={[styles.cashflowSub, { color: dynMuted }]}>上期結餘 {fmt(prevBal)}</Text>
          )}
        </Card>

        {/* ══════════════════════════════════
            今日餐費
        ══════════════════════════════════ */}
        <Card style={styles.progressCard} colorTop={dynamicGlassTop}>
          {(() => {
            const mealDailyLimit  = Math.round((settings.mealPeriodBudget || 9000) / (totalDays || 1));
            const remain          = Math.max(0, mealDailyLimit - todayMealExp);
            const pct             = Math.min(100, Math.round((todayMealExp / (mealDailyLimit || 1)) * 100));
            const barColor        = pct > 85 ? colors.expense : pct > 60 ? colors.neutral : colors.income;
            const mealBudget      = settings.mealPeriodBudget || 9000;
            const periodMealPct   = Math.round((periodMealExp / mealBudget) * 100);
            const isOverBudget    = periodMealExp > mealBudget;
            const periodRemaining = Math.max(0, mealBudget - periodMealExp);
            const periodDailyAvg  = daysLeft > 0 ? Math.round(periodRemaining / daysLeft) : 0;
            return (
              <>
                <View style={styles.progressTop}>
                  <Text style={[styles.progressTitle, { color: dynPrimary }]}>🍽️ 今日餐費</Text>
                  <Text style={[styles.progressMeta, { color: dynSecondary }]}>{fmt(todayMealExp)} / {fmt(mealDailyLimit)}</Text>
                </View>
                <InsetBox style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                </InsetBox>
                <Text style={[styles.progressMeta, { color: pct >= 100 ? colors.expense : remain > 0 ? dynSecondary : colors.expense }]}>
                  {pct >= 100
                    ? '今天餐費會超過建議值，接下來幾天稍微穩一點'
                    : remain > 0
                      ? `今日還能吃 ${fmt(remain)}`
                      : '今日餐費已達建議上限'}
                </Text>
                <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.07)' }}>
                  <View style={styles.progressBottom}>
                    <Text style={[styles.progressMeta, { color: dynMuted, fontSize: 12 }]}>
                      本期餐費 {fmt(periodMealExp)} / {fmt(mealBudget)} · {Math.min(100, periodMealPct)}%
                    </Text>
                  </View>
                  {isOverBudget ? (
                    <Text style={[styles.progressMeta, { color: colors.expense, fontSize: 12, marginTop: 4 }]}>
                      本期餐費已超過 {fmt(periodMealExp - mealBudget)}，後面幾天抓穩一點就好
                    </Text>
                  ) : daysLeft > 0 ? (
                    <Text style={[styles.progressMeta, { color: colors.income, fontSize: 12, marginTop: 4 }]}>
                      本期餐費還有 {fmt(periodRemaining)}，剩餘日均約 {fmt(periodDailyAvg)}
                    </Text>
                  ) : null}
                </View>
              </>
            );
          })()}
        </Card>

        {/* ══════════════════════════════════
            本期生活預算
        ══════════════════════════════════ */}
        <Card style={[styles.progressCard, { marginTop: 0 }]} colorTop={dynamicGlassTop}>
          <View style={[styles.progressTop, { marginBottom: 12 }]}>
            <Text style={[styles.progressTitle, { color: dynPrimary }]}>本期生活預算</Text>
            <Text style={[styles.progressMeta, { color: dynSecondary }]}>剩 {daysLeft} 天</Text>
          </View>
          {LIFE_CATS.map(cat => {
            const used      = lifeExp[cat];
            const catBudget = settings.monthlyCategoryBudgets[cat] || 1;
            const rawPct    = Math.round((used / catBudget) * 100);
            const barPct    = Math.min(100, rawPct);
            const isOver    = used > catBudget;
            const barColor  = isOver ? colors.expense : rawPct > 60 ? colors.neutral : colors.income;
            return (
              <View key={cat} style={{ marginBottom: 10 }}>
                <View style={styles.progressBottom}>
                  <Text style={[styles.progressMeta, { color: dynSecondary }]}>{cat}</Text>
                  <Text style={[styles.progressMeta, { color: isOver ? colors.expense : dynSecondary }]}>
                    {fmt(used)} / {fmt(catBudget)}
                  </Text>
                </View>
                <InsetBox style={[styles.progressTrack, { marginBottom: 0, marginTop: 4 }]}>
                  <View style={[styles.progressFill, { width: `${barPct}%` as any, backgroundColor: barColor }]} />
                </InsetBox>
                {isOver && (
                  <Text style={[styles.progressMeta, { color: colors.expense, fontSize: 12, marginTop: 3 }]}>
                    已超出 {fmt(used - catBudget)}
                  </Text>
                )}
              </View>
            );
          })}
          <View style={[styles.progressBottom, { marginTop: 6 }]}>
            <Text style={[styles.progressMeta, { color: dynMuted }]}>合計已用 {fmt(totalLifeExp)}</Text>
            <Text style={[styles.progressMeta, { color: dynMuted }]}>預算 {fmt(lifeBudgetTotal)}</Text>
          </View>
        </Card>

        {/* ══════════════════════════════════
            近期帳單提醒卡
        ══════════════════════════════════ */}
        {urgentBills.length > 0 && (
          <View style={styles.billReminderWrap}>
            <View style={styles.billReminderHeader}>
              <Text style={[styles.billReminderTitle, { color: dynPrimary }]}>📋 近期帳單</Text>
            </View>
            {urgentBills.map((b, idx) => {
              const isOverdue   = b.status === 'overdue';
              const isDueToday  = b.status === 'dueToday';
              const accentClr   = isOverdue ? '#EF4444' : isDueToday ? '#F59E0B' : '#38BDF8';
              const badgeText   = isOverdue
                ? `逾期 ${Math.abs(b.daysUntil)} 天`
                : isDueToday ? '今天扣款'
                : `${b.daysUntil} 天後扣款`;
              const isInvest    = (b.paymentRule ?? 'fixedDate') === 'tPlusBusinessDays';
              const n           = b.settlementBusinessDays ?? 2;
              const metaText    = isInvest
                ? `${b.dueDay} 日執行｜T+${n} 交割｜${b.dueStr.slice(5).replace('-', '/')} 扣款`
                : `每月 ${b.dueDay} 日｜NT$${b.amount.toLocaleString('zh-TW')}`;
              return (
                <View
                  key={b.id}
                  style={[
                    styles.billReminderRow,
                    { borderLeftColor: accentClr },
                    idx === urgentBills.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.billReminderName, { color: dynPrimary }]}>{b.name}</Text>
                    <Text style={[styles.billReminderAmt, { color: dynMuted }]}>{metaText}</Text>
                    {isInvest && (
                      <Text style={[styles.billReminderAmt, { color: dynMuted }]}>
                        NT${b.amount.toLocaleString('zh-TW')}
                      </Text>
                    )}
                  </View>
                  <View style={styles.billReminderRight}>
                    <View style={[styles.billReminderBadge, {
                      backgroundColor: `${accentClr}22`,
                      borderColor: `${accentClr}55`,
                    }]}>
                      <Text style={[styles.billReminderBadgeText, { color: accentClr }]}>{badgeText}</Text>
                    </View>
                    <Pressable
                      style={[styles.billReminderBtn, { backgroundColor: accentClr }]}
                      onPress={() => { useBudgetStore.getState().markBillPaid(b.id); }}
                    >
                      <Text style={styles.billReminderBtnText}>已繳</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ══════════════════════════════════
            投資資產卡
        ══════════════════════════════════ */}
        <Pressable
          onPress={() => { setInvestmentView('list'); setShowInvestmentModal(true); }}
          style={styles.investmentCardWrap}
        >
          <GlassCard
            style={styles.investmentCard}
            colorTop={hasBg ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.62)'}
            colorBot={
              investmentSummary.unrealizedProfit >= 0
                ? 'rgba(52,211,153,0.16)'
                : 'rgba(244,114,182,0.16)'
            }
            borderRadius={radius.xl}
          >
            {stockHoldings.length === 0 ? (
              <View style={styles.investmentEmpty}>
                <Text style={{ fontSize: 28 }}>📈</Text>
                <View>
                  <Text style={[styles.investmentTitle, { color: dynPrimary }]}>投資資產</Text>
                  <Text style={[styles.investmentEmptyHint, { color: dynMuted }]}>尚未建立持股，點擊新增第一筆</Text>
                </View>
              </View>
            ) : (
              <View style={styles.investmentTopRow}>
                <View style={styles.investmentLeft}>
                  <View style={styles.investmentTitleRow}>
                    <Text style={styles.investmentIcon}>📈</Text>
                    <Text style={[styles.investmentTitle, { color: dynSecondary }]}>投資資產</Text>
                  </View>
                  <Text style={[styles.investmentAmount, { color: dynPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                    NT${Math.round(investmentSummary.totalMarketValue).toLocaleString('zh-TW')}
                  </Text>
                  <Text style={[styles.investmentSub, { color: dynMuted }]}>
                    投入 NT${Math.round(investmentSummary.totalInvested).toLocaleString('zh-TW')}
                  </Text>
                </View>
                <View style={styles.investmentRight}>
                  <Text style={[styles.investmentProfit, {
                    color: investmentSummary.unrealizedProfit >= 0 ? colors.income : colors.expense,
                  }]}>
                    {investmentSummary.unrealizedProfit >= 0 ? '+' : ''}
                    NT${Math.round(Math.abs(investmentSummary.unrealizedProfit)).toLocaleString('zh-TW')}
                  </Text>
                  <Text style={[styles.investmentRate, {
                    color: investmentSummary.returnRate >= 0 ? colors.income : colors.expense,
                  }]}>
                    {investmentSummary.returnRate >= 0 ? '+' : ''}
                    {(investmentSummary.returnRate * 100).toFixed(1)}%
                  </Text>
                </View>
              </View>
            )}
          </GlassCard>
        </Pressable>

        {/* ══════════════════════════════════
            本期花最多前三類
        ══════════════════════════════════ */}
        {topExpenses.length > 0 && (
          <Card style={styles.topExpCard} colorTop={dynamicGlassTop}>
            <Text style={[styles.topExpTitle, { color: dynPrimary }]}>本期花最多</Text>
            {topExpenses.map((e, i) => (
              <View key={e.cat} style={[styles.topExpRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.06)' }]}>
                <Text style={styles.topExpRank}>{i + 1}</Text>
                <Text style={styles.topExpCat}>{getCatIcon(e.cat)} {e.cat}</Text>
                <Text style={[styles.topExpAmt, { color: '#DB4F91' }]}>{fmt(e.amount)}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* ══════════════════════════════════
            本期明細 + 篩選
        ══════════════════════════════════ */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: dynPrimary, paddingHorizontal: 0, marginBottom: 0 }]}>本期明細</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsContainer}
          style={{ marginBottom: 12 }}
        >
          {(['全部', '餐費', '生活', '獨立', '信用卡'] as const).map(f => (
            <Pressable
              key={f}
              style={[styles.filterChip, txFilter === f && styles.filterChipActive]}
              onPress={() => setTxFilter(f)}
            >
              <Text style={[styles.filterChipText, { color: txFilter === f ? '#fff' : dynSecondary }]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {groupedEntries.length === 0 ? (
          <Text style={styles.emptyText}>
            {txFilter === '全部' ? '本期尚無記錄' : `本期沒有${txFilter}類明細`}
          </Text>
        ) : (
          groupedEntries.map(([date, items]) => (
            <View key={date} style={styles.dayGroup}>
              <View style={styles.dayLabelRow}>
                <Text style={styles.dayLabelText}>{dayLabel(date)}</Text>
              </View>
              <GlassCard style={styles.dayCard} colorTop={hasBg ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.44)'}>
                {items.map((t, idx) => (
                  <View key={t.id}>
                    {idx > 0 && <View style={styles.txDivider} />}
                    <View style={styles.txRow}>
                      <View style={[
                        styles.txIconBox,
                        { backgroundColor: t.type === 'income' ? 'rgba(52,211,153,0.28)' : 'rgba(244,114,182,0.22)' },
                      ]}>
                        <Text style={styles.txIconEmoji}>{getCatIcon(t.cat)}</Text>
                      </View>
                      <View style={styles.txInfo}>
                        <Text style={styles.txName} numberOfLines={1}>
                          {t.cat}{t.note ? ` (${t.note})` : ''}
                        </Text>
                        <View style={styles.txTimeRow}>
                          <Feather name="clock" size={11} color="#aaa" />
                          <Text style={[styles.txTime, { color: dynMuted }]}>{t.time || '--:--'}</Text>
                        </View>
                      </View>
                      <View style={styles.txRight}>
                        <Text style={[
                          styles.txAmount,
                          { color: t.type === 'income' ? '#10B981' : '#DB4F91' },
                        ]}>
                          {t.type === 'income' ? '+' : '-'}{fmt(t.amount)}
                        </Text>
                        {t.type === 'expense' && (
                          <View style={[
                            styles.payBadge,
                            t.pay === '信用卡'
                              ? { backgroundColor: 'rgba(2,132,199,0.14)', borderColor: 'rgba(2,132,199,0.24)' }
                              : { backgroundColor: 'rgba(16,185,129,0.14)', borderColor: 'rgba(16,185,129,0.24)' },
                          ]}>
                            <Text style={[
                              styles.payBadgeText,
                              { color: t.pay === '信用卡' ? '#0284C7' : '#059669' },
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
                        {({ pressed }: { pressed: boolean }) => (
                          <Feather name="trash-2" size={16} color={pressed ? '#EC4899' : 'rgba(100,116,139,0.35)'} />
                        )}
                      </Pressable>
                    </View>
                  </View>
                ))}
              </GlassCard>
            </View>
          ))
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ══════════════════════════════════
          FAB 機器人（固定右下角，絕對定位）
      ══════════════════════════════════ */}
      <RobotAssistant
        budgetPct={budgetPct}
        onRobotPress={() => openAddModal('expense')}
        mealAlert={mealAlert}
        onMealAlertShown={() => setMealAlert(null)}
        financeSummary={financeSummary}
        afterRecord={afterRecord}
        onAfterRecordShown={() => setAfterRecord(null)}
      />

      {/* ── Toast ── */}
      {!!toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {/* ════════════════════════════════════
          記帳 Modal（獨立元件）
      ════════════════════════════════════ */}
      <AddTransactionModal
        visible={showAddModal}
        initialType={addInitialType}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddTx}
      />

      {/* ════════════════════════════════════
          存款 Modal（Bottom Sheet）
      ════════════════════════════════════ */}
      <AppBottomSheet
        visible={showSavingsModal}
        onClose={() => setShowSavingsModal(false)}
        title="編輯存款基準"
        iconName="dollar-sign"
        avoidKeyboard
        buttons={[
          {
            label: '取消',
            variant: 'cancel',
            onPress: () => setShowSavingsModal(false),
          },
          {
            label: '儲存',
            variant: 'primary',
            onPress: () => {
              const v = parseFloat(savingsInput);
              if (isNaN(v) || v < 0) { showToast('❌ 無效金額'); return; }
              useBudgetStore.getState().updateSavings(v);
              Keyboard.dismiss();
              setShowSavingsModal(false);
              showToast('🏦 存款已更新');
            },
          },
        ]}
      >
        <View style={styles.savingsSheetBody}>
          <Text style={styles.savingsFieldLabel}>存款基準</Text>
          <TextInput
            style={styles.savingsInput}
            placeholder="NT$ 0"
            placeholderTextColor="#CBD5E1"
            keyboardType="decimal-pad"
            value={savingsInput}
            onChangeText={setSavingsInput}
          />
          <Text style={styles.savingsHint}>
            首頁存款會依照「存款基準 + 本期結餘」自動計算
          </Text>
        </View>
      </AppBottomSheet>

      {/* ════════════════════════════════════
          刪除確認 Modal（Bottom Sheet）
      ════════════════════════════════════ */}
      <AppBottomSheet
        visible={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        title="確認刪除？"
        iconName="trash-2"
        iconColor="#DB4F91"
        subtitle="此操作無法復原"
        avoidKeyboard={false}
        buttons={[
          {
            label: '取消',
            variant: 'cancel',
            onPress: () => setDeleteTargetId(null),
          },
          {
            label: '刪除',
            variant: 'danger',
            onPress: () => {
              if (deleteTargetId !== null) deleteTransaction(deleteTargetId);
              setDeleteTargetId(null);
              showToast('🗑️ 已刪除');
            },
          },
        ]}
      />

      {/* ════════════════════════════════════
          固定帳單提醒 Modal
      ════════════════════════════════════ */}
      <BillReminderModal
        visible={!!reminderBills && reminderBills.length > 0}
        bills={reminderBills ?? []}
        period={period}
        onMarkPaid={(id) => {
          useBudgetStore.getState().markBillPaid(id);
          setReminderBills(prev => (prev ? prev.filter(b => b.id !== id) : prev));
          showToast('✅ 已記錄繳費');
        }}
        onClose={(dismissToday) => {
          if (dismissToday) {
            useBudgetStore.getState().setBillDismissDate(localDateStr(new Date()));
          }
          setReminderBills(null);
        }}
      />

      {/* ════════════════════════════════════
          投資資產 Bottom Sheet
      ════════════════════════════════════ */}
      <Modal
        visible={showInvestmentModal}
        animationType="slide"
        transparent
        onRequestClose={() => { Keyboard.dismiss(); setShowInvestmentModal(false); resetStockForm(); setInvestmentView('list'); }}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => { Keyboard.dismiss(); setShowInvestmentModal(false); resetStockForm(); setInvestmentView('list'); }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
          pointerEvents="box-none"
        >
          <View style={[
            styles.investmentSheet,
            { paddingBottom: investmentKeyboardHeight > 0 ? 12 : safeBottom + 16 },
            investmentView === 'list' ? styles.investmentSheetList : styles.investmentSheetForm,
            Platform.OS === 'android' && investmentKeyboardHeight > 0 && {
              marginBottom: investmentKeyboardHeight,
              height: '58%',
              minHeight: 360,
            },
          ]}>
            <View style={styles.dragHandle} />

            {/* ── 標題列 ── */}
            <View style={styles.invHeaderRow}>
              <View style={styles.invTitleGroup}>
                <Feather
                  name={investmentView === 'list' ? 'trending-up' : 'bar-chart-2'}
                  size={20}
                  color="#8B5CF6"
                />
                <Text style={styles.invSheetTitle}>
                  {investmentView === 'list'
                    ? '投資資產'
                    : editingStockId !== null ? '編輯持股' : '新增持股'}
                </Text>
              </View>
              {investmentView === 'form' && (
                <Pressable
                  style={styles.invBackBtn}
                  onPress={() => { resetStockForm(); setInvestmentView('list'); }}
                >
                  <Feather name="chevron-left" size={16} color="#64748B" />
                  <Text style={styles.invBackText}>返回</Text>
                </Pressable>
              )}
            </View>

            {/* ── 可滾動內容 ── */}
            <ScrollView
              style={styles.invBody}
              contentContainerStyle={[
                styles.invBodyContent,
                investmentKeyboardHeight > 0 && { paddingBottom: 160 },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {investmentView === 'list' ? (
                <>
                  {/* 投資摘要卡 */}
                  {stockHoldings.length > 0 && (
                    <View style={styles.invSummaryCard}>
                      <View style={[styles.summaryAccentBar, {
                        backgroundColor: investmentSummary.unrealizedProfit >= 0 ? '#34D399' : '#F472B6',
                      }]} />
                      <View style={styles.invSummaryTop}>
                        <View>
                          <Text style={styles.invSummaryLabel}>總市值</Text>
                          <Text style={styles.invSummaryMain}>
                            NT${Math.round(investmentSummary.totalMarketValue).toLocaleString('zh-TW')}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.invSummaryProfit, {
                            color: investmentSummary.unrealizedProfit >= 0 ? '#10B981' : '#DB4F91',
                          }]}>
                            {investmentSummary.unrealizedProfit >= 0 ? '+' : ''}
                            NT${Math.round(Math.abs(investmentSummary.unrealizedProfit)).toLocaleString('zh-TW')}
                          </Text>
                          <Text style={[styles.invSummaryRate, {
                            color: investmentSummary.returnRate >= 0 ? '#10B981' : '#DB4F91',
                          }]}>
                            {investmentSummary.returnRate >= 0 ? '+' : ''}
                            {(investmentSummary.returnRate * 100).toFixed(1)}%
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.invSummaryInvested}>
                        投入 NT${Math.round(investmentSummary.totalInvested).toLocaleString('zh-TW')}
                      </Text>
                    </View>
                  )}

                  {/* 持股卡片 */}
                  {stockHoldings.length === 0 ? (
                    <View style={styles.invEmptyBox}>
                      <Text style={{ fontSize: 32 }}>📈</Text>
                      <Text style={styles.invEmptyTitle}>尚未新增持股</Text>
                      <Text style={styles.invEmptyHint}>新增股票後，這裡會顯示投資市值與損益。</Text>
                    </View>
                  ) : (
                    stockHoldings.map((s) => {
                      const avgCost     = s.shares > 0 ? s.investedAmount / s.shares : 0;
                      const marketValue = s.shares * s.currentPrice;
                      const profit      = marketValue - s.investedAmount;
                      const rate        = s.investedAmount > 0 ? profit / s.investedAmount : 0;
                      const profitColor = profit >= 0 ? '#10B981' : '#DB4F91';
                      return (
                        <View key={s.id} style={styles.holdingCard}>
                          <View style={styles.holdingTopRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.holdingTitle}>{s.symbol} {s.name}</Text>
                              <Text style={styles.holdingMeta}>
                                持有 {s.shares} 股｜投入 NT${Math.round(s.investedAmount).toLocaleString('zh-TW')}
                              </Text>
                              <Text style={styles.holdingMeta}>
                                現價 {s.currentPrice}｜均價 {avgCost.toFixed(1)}
                              </Text>
                              <Text style={styles.holdingValue}>
                                市值 NT${Math.round(marketValue).toLocaleString('zh-TW')}
                              </Text>
                            </View>
                            <View style={styles.holdingActions}>
                              <Pressable
                                onPress={() => startEditStock(s)}
                                hitSlop={8}
                                style={styles.holdingActionBtn}
                              >
                                <Feather name="edit-2" size={16} color="#64748B" />
                              </Pressable>
                              <Pressable
                                onPress={() => setDeleteStockTargetId(s.id)}
                                hitSlop={8}
                                style={styles.holdingActionBtn}
                              >
                                <Feather name="trash-2" size={16} color="#DB4F91" />
                              </Pressable>
                            </View>
                          </View>
                          <Text style={[styles.holdingProfit, { color: profitColor }]}>
                            {profit >= 0 ? '+' : ''}NT${Math.round(Math.abs(profit)).toLocaleString('zh-TW')}
                            {'  '}
                            {rate >= 0 ? '+' : ''}{(rate * 100).toFixed(1)}%
                          </Text>
                        </View>
                      );
                    })
                  )}
                </>
              ) : (
                /* ── 新增 / 編輯表單 ── */
                <>
                  <View style={styles.invFormRow}>
                    <TextInput
                      style={[styles.invInput, { flex: 1 }]}
                      placeholder="股票代號（如 2330）"
                      placeholderTextColor="#CBD5E1"
                      value={stockSymbol}
                      onChangeText={setStockSymbol}
                    />
                    <TextInput
                      style={[styles.invInput, { flex: 1.6 }]}
                      placeholder="股票名稱（如 台積電）"
                      placeholderTextColor="#CBD5E1"
                      value={stockName}
                      onChangeText={setStockName}
                    />
                  </View>

                  <View style={styles.invFormRow}>
                    <TextInput
                      style={[styles.invInput, { flex: 1 }]}
                      placeholder="持有股數"
                      placeholderTextColor="#CBD5E1"
                      keyboardType="numeric"
                      value={stockShares}
                      onChangeText={setStockShares}
                    />
                    <TextInput
                      style={[styles.invInput, { flex: 1.4 }]}
                      placeholder="投入金額（總計）"
                      placeholderTextColor="#CBD5E1"
                      keyboardType="numeric"
                      value={stockInvestedAmt}
                      onChangeText={setStockInvestedAmt}
                    />
                  </View>

                  {/* 市場選擇 */}
                  <View style={styles.invToggleRow}>
                    {([['TW', '台股'], ['US', '美股']] as const).map(([val, label]) => (
                      <Pressable
                        key={val}
                        style={[styles.invToggleBtn, stockMarket === val && styles.invToggleBtnActive]}
                        onPress={() => setStockMarket(val)}
                      >
                        <Text style={[styles.invToggleBtnText, stockMarket === val && { color: '#8B5CF6' }]}>
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* 現價 + 抓取 */}
                  <View style={styles.invFormRow}>
                    <TextInput
                      style={[styles.invInput, { flex: 1 }]}
                      placeholder="目前價格"
                      placeholderTextColor="#CBD5E1"
                      keyboardType="numeric"
                      value={stockCurrentPrice}
                      onChangeText={setStockCurrentPrice}
                    />
                    <Pressable
                      style={[styles.invFetchBtn, isFetchingPrice && { opacity: 0.5 }]}
                      onPress={handleFetchPrice}
                      disabled={isFetchingPrice}
                    >
                      <Text style={styles.invFetchBtnText}>{isFetchingPrice ? '抓取中…' : '抓取現價'}</Text>
                    </Pressable>
                  </View>

                  {/* 幣別 */}
                  <View style={styles.invToggleRow}>
                    {(['TWD', 'USD'] as const).map(c => (
                      <Pressable
                        key={c}
                        style={[styles.invToggleBtn, stockCurrency === c && styles.invToggleBtnActive]}
                        onPress={() => setStockCurrency(c)}
                      >
                        <Text style={[styles.invToggleBtnText, stockCurrency === c && { color: '#8B5CF6' }]}>
                          {c}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>

            {/* ── 固定底部按鈕（底距由 investmentSheet paddingBottom 統一控制）── */}
            <View style={[styles.invFooter, { paddingBottom: 0 }]}>
              {investmentView === 'list' ? (
                <Pressable
                  style={styles.invAddBtn}
                  onPress={() => { resetStockForm(); setInvestmentView('form'); }}
                >
                  <Feather name="plus-circle" size={18} color="#fff" />
                  <Text style={styles.invAddBtnText}>新增股票</Text>
                </Pressable>
              ) : (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Pressable
                    style={styles.invCancelBtn}
                    onPress={() => { resetStockForm(); setInvestmentView('list'); }}
                  >
                    <Text style={styles.invCancelText}>取消</Text>
                  </Pressable>
                  <Pressable style={styles.invSaveBtn} onPress={handleSaveStock}>
                    <Text style={styles.invSaveText}>
                      {editingStockId !== null ? '儲存變更' : '新增股票'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 刪除持股確認 ── */}
      <AppBottomSheet
        visible={deleteStockTargetId !== null}
        onClose={() => setDeleteStockTargetId(null)}
        title="確認刪除持股？"
        iconName="trash-2"
        iconColor="#DB4F91"
        subtitle="此操作無法復原"
        avoidKeyboard={false}
        buttons={[
          {
            label: '取消',
            variant: 'cancel',
            onPress: () => setDeleteStockTargetId(null),
          },
          {
            label: '刪除',
            variant: 'danger',
            onPress: () => {
              if (deleteStockTargetId !== null) deleteStockHolding(deleteStockTargetId);
              setDeleteStockTargetId(null);
              showToast('🗑️ 已刪除持股');
            },
          },
        ]}
      />
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
    paddingTop:        44,
    paddingBottom:     spacing.lg,
  },
  headerLeft:     { flex: 1, marginRight: spacing.sm },
  headerDate:     { fontSize: 14, lineHeight: 20, fontWeight: '600', marginBottom: 6 },
  headerGreeting: { fontSize: 26, lineHeight: 34, fontWeight: '800', marginBottom: 8 },
  periodBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf:    'flex-start',
    borderRadius: 18, paddingVertical: 5, paddingHorizontal: 12,
    borderWidth:  1,
  },
  periodDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.periodDot },
  periodLabel:{ fontSize: 14, fontWeight: '700' },
  headerGif:  { width: 92, height: 92, flexShrink: 0 },

  // ── 本期現金流摘要 ──
  cashflowCard:       { marginHorizontal: spacing.screenH, marginBottom: spacing.screenH, borderRadius: radius.lg },
  cashflowTitleRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cashflowTitle:      { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  cashflowPeriod:     { fontSize: 12, color: '#94A3B8' },
  cashflowRowItem:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  cashflowLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cashflowLabel:      { fontSize: 14, fontWeight: '500', color: '#475569' },
  cashflowValue:      { fontSize: 15, fontWeight: '700' },
  cashflowDivider:    { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.09)', marginTop: 4 },
  cashflowSub:        { fontSize: 12, marginTop: 6 },

  // ── 本期花最多 ──
  topExpCard:  { marginHorizontal: spacing.screenH, marginBottom: spacing.screenH, borderRadius: radius.lg },
  topExpTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', marginBottom: 8 },
  topExpRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  topExpRank:  { width: 22, fontSize: 14, fontWeight: '700', color: '#94A3B8' },
  topExpCat:   { flex: 1, fontSize: 14, fontWeight: '500', color: '#475569' },
  topExpAmt:   { fontSize: 15, fontWeight: '700' },

  // ── 明細篩選 chips ──
  sectionHeaderRow:      { paddingHorizontal: spacing.xl, marginBottom: 8 },
  filterChipsContainer:  { paddingHorizontal: spacing.xl, gap: 8, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius:      20,
    backgroundColor:   'rgba(255,255,255,0.72)',
    borderWidth: 1,    borderColor: 'rgba(148,163,184,0.25)',
  },
  filterChipActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  filterChipText:   { fontSize: 14, fontWeight: '700' },

  // ── 存款橫幅（GlassCard 版）──
  savingsBannerWrap: {
    marginHorizontal: spacing.screenH,
    marginBottom:     spacing.screenH,
  },
  savingsBannerCard: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingVertical:  16,
    paddingLeft:      18,
    paddingRight:     0,
    overflow:         'hidden',
    height:           120,
  },
  savingsLeft:       { flex: 1, paddingRight: spacing.sm },
  savingsLabelRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  savingsLabelIcon:  { fontSize: 16 },
  savingsBannerLabel:{ fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '500' },
  savingsBannerAmt:  { fontSize: fontSize.hero, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  savingsBannerSub:  { fontSize: fontSize.xs + 2, color: colors.textMuted },
  savingsPigWrap:    { width: 130, height: 120, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },

  // ── 近期帳單提醒卡 ──
  billReminderWrap: {
    marginHorizontal: spacing.screenH,
    marginBottom:     spacing.screenH,
    borderRadius:     16,
    overflow:         'hidden',
    backgroundColor:  'rgba(255,255,255,0.72)',
    borderWidth:      1,
    borderColor:      'rgba(0,0,0,0.07)',
  },
  billReminderHeader:    { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  billReminderTitle:     { fontSize: 13, fontWeight: '600' },
  billReminderRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderLeftWidth: 3, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  billReminderName:      { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  billReminderAmt:       { fontSize: 12 },
  billReminderRight:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  billReminderBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  billReminderBadgeText: { fontSize: 12, fontWeight: '600' },
  billReminderBtn:       { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  billReminderBtnText:   { fontSize: 12, fontWeight: '700', color: '#fff' },

  // ── 投資資產卡 ──
  investmentCardWrap: {
    marginHorizontal: spacing.screenH,
    marginBottom:     spacing.screenH,
  },
  investmentCard: {
    paddingHorizontal: 18,
    paddingVertical:   16,
    overflow:          'hidden',
  },
  investmentTopRow:  { flexDirection: 'row', alignItems: 'center' },
  investmentLeft:    { flex: 1 },
  investmentTitleRow:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  investmentIcon:    { fontSize: 18 },
  investmentTitle:   { fontSize: fontSize.md, fontWeight: '600' },
  investmentAmount:  { fontSize: fontSize.hero, fontWeight: '700', marginBottom: 4 },
  investmentSub:     { fontSize: fontSize.md },
  investmentRight:   { alignItems: 'flex-end', paddingLeft: 12 },
  investmentProfit:  { fontSize: fontSize.xl, fontWeight: '700', marginBottom: 4 },
  investmentRate:    { fontSize: fontSize.lg, fontWeight: '600' },
  investmentEmpty:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  investmentEmptyHint:{ fontSize: fontSize.md, marginTop: 2 },

  // ── 持股列表 ──
  stockEmptyBox:  { paddingVertical: 20, alignItems: 'center', gap: 8 },
  stockEmptyText: { fontSize: fontSize.xl, fontWeight: '600', color: colors.textPrimary },
  stockEmptyHint: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center' },
  stockRow: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingVertical:  12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  stockInfo:        { flex: 1 },
  stockSymbolName:  { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  stockMeta:        { fontSize: fontSize.base, color: colors.textMuted, marginBottom: 3 },
  stockValue:       { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: 2 },
  stockProfit:      { fontSize: fontSize.md, fontWeight: '600' },
  stockActions:     { flexDirection: 'row', gap: 10, paddingLeft: 12 },
  stockActionBtn:   { padding: 6 },
  stockFormRow:     { flexDirection: 'row', gap: 8, marginBottom: 10 },
  stockInput: {
    backgroundColor: '#F8FAFC',
    borderRadius:    radius.lg,
    padding:         10,
    fontSize:        fontSize.md,
    borderWidth:     1,
    borderColor:     'rgba(0,0,0,0.06)',
    color:           colors.textPrimary,
  },

  // ── 進度條 ──
  progressCard: { marginHorizontal: spacing.screenH, marginBottom: spacing.screenH, borderRadius: radius.lg },
  progressTop:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressTitle:  { fontSize: 18, lineHeight: 24, fontWeight: '700', color: '#1E293B' },
  progressMeta:   { fontSize: 14, lineHeight: 21, color: '#475569' },
  progressTrack:  { height: 10, overflow: 'hidden', marginBottom: 8 },
  progressFill:   { height: 10, borderRadius: 6 },
  progressBottom: { flexDirection: 'row', justifyContent: 'space-between' },


  // ── 明細 ──
  sectionTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', paddingHorizontal: spacing.xl, marginBottom: 10, color: '#1E293B' },
  emptyText:    { textAlign: 'center', paddingVertical: 32, color: colors.textHint, fontSize: fontSize.lg },
  dayGroup:     { marginBottom: spacing.lg, paddingHorizontal: spacing.screenH, gap: spacing.sm },
  dayLabelRow:  { marginBottom: 8 },
  dayLabelText: {
    fontSize: 13, fontWeight: '700', color: '#334155',
    backgroundColor: 'rgba(255,255,255,0.70)', alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.xs,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)',
  },
  dayCard:     { overflow: 'hidden' },
  txDivider:   { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(148,163,184,0.16)', marginHorizontal: spacing.lg },
  txRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: spacing.lg },
  txIconBox:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txIconEmoji: { fontSize: 18 },
  txInfo:      { flex: 1, minWidth: 0 },
  txName:      { fontSize: 16, lineHeight: 22, fontWeight: '700', color: '#1E293B' },
  txTimeRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  txTime:      { fontSize: 12, lineHeight: 17, fontWeight: '500', color: '#94A3B8' },
  txRight:     { alignItems: 'flex-end', flexShrink: 0 },
  txAmount:    {
    fontSize: 17, lineHeight: 23, fontWeight: '700',
    textShadowColor: 'transparent', textShadowRadius: 0, textShadowOffset: { width: 0, height: 0 },
  },
  payBadge: {
    borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, marginTop: 3,
    borderWidth: 1,
  },
  payBadgeText:{ fontSize: 11, fontWeight: '700' },
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
    backgroundColor:      'rgba(255,255,255,0.96)',
    borderTopLeftRadius:  radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: 22,
    paddingBottom: 40,
    borderWidth:   1,
    borderColor:   'rgba(255,255,255,0.80)',
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: -10 },
    shadowOpacity: 0.15,
    shadowRadius:  30,
  },
  modalCenter: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  modalTitle:  { fontSize: fontSize.h2, fontWeight: '700', marginBottom: 0, color: colors.textPrimary },
  modalSub:    { fontSize: fontSize.lg, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 },

  // ── Modal 內部高對比白玉主題 ──────────────────────────────
  // 白玉底 (0.96) → 所有「玻璃白」元件都改用「深色凹槽」風格

  amtInput: {
    borderRadius:    radius.lg,
    padding:         spacing.lg,
    fontSize:        32,            // 旗艦大字
    fontWeight:      '800',
    textAlign:       'center',
    marginBottom:    spacing.lg,
    // 冷白凹槽 + 微邊框，和 Modal 純白底做出層次
    backgroundColor: '#F8FAFC',
    borderWidth:     1,
    borderColor:     'rgba(0,0,0,0.06)',
    color:           colors.textPrimary,
  },

  payRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg },
  payBtn: {
    flex: 1, padding: 11, borderRadius: radius.lg, alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.07)',
  },
  payBtnActive: {
    backgroundColor: 'rgba(56,189,248,0.18)',
    borderWidth: 1.5, borderColor: colors.credit,
  },
  payBtnText: { fontWeight: '600', fontSize: fontSize.lg, color: colors.textPrimary },

  noteInput: {
    borderRadius:    radius.lg,
    padding:         12,
    fontSize:        fontSize.lg,
    marginBottom:    12,
    backgroundColor: '#F8FAFC',
    borderWidth:     1,
    borderColor:     'rgba(0,0,0,0.06)',
    color:           colors.textPrimary,
  },

  dragHandle:    { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 14 },
  // submitBtn 移除外擴光暈（glow shadowColor 在白底會形成浮腫感），保留鮮豔實色
  submitBtn:     { padding: 16, borderRadius: radius.lg, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: colors.textWhite, fontSize: fontSize.h3, fontWeight: '700', letterSpacing: 0.5 },

  // ── 存款 Bottom Sheet ──
  savingsSheet: {
    backgroundColor:      'rgba(255,255,255,0.96)',
    borderTopLeftRadius:  32,
    borderTopRightRadius: 32,
    borderWidth:          1,
    borderColor:          'rgba(255,255,255,0.86)',
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -8 },
    shadowOpacity:        0.10,
    shadowRadius:         22,
    elevation:            18,
  },
  savingsSheetTitle: {
    fontSize:   20,
    fontWeight: '800',
    color:      '#1E293B',
  },
  savingsSheetBody: {
    paddingHorizontal: spacing.xl + 2,
    paddingTop:        spacing.md,
    paddingBottom:     spacing.lg,
  },
  savingsFieldLabel: {
    fontSize:      fontSize.sm,
    fontWeight:    '700',
    color:         '#94A3B8',
    letterSpacing: 0.5,
    marginBottom:  spacing.sm,
    textTransform: 'uppercase',
  },
  savingsInput: {
    backgroundColor:   '#F8FAFC',
    borderRadius:      18,
    paddingHorizontal: 18,
    paddingVertical:   12,
    fontSize:          26,
    fontWeight:        '800',
    color:             '#1E293B',
    borderWidth:       1,
    borderColor:       'rgba(0,0,0,0.06)',
    textAlign:         'center',
  },
  savingsHint: {
    marginTop:  spacing.sm,
    fontSize:   13,
    lineHeight: 19,
    color:      '#94A3B8',
    textAlign:  'center',
  },
  savingsFooter: {
    flexDirection:     'row',
    gap:               12,
    paddingHorizontal: spacing.xl + 2,
    paddingTop:        spacing.md,
    paddingBottom:     Platform.OS === 'android' ? 28 : 20,
    borderTopWidth:    StyleSheet.hairlineWidth,
    borderTopColor:    'rgba(0,0,0,0.06)',
  },
  savingsCancelBtn: {
    flex:            1,
    paddingVertical: 14,
    borderRadius:    22,
    alignItems:      'center',
    backgroundColor: '#F8FAFC',
    borderWidth:     1,
    borderColor:     'rgba(0,0,0,0.06)',
  },
  savingsCancelText: {
    fontSize:   16,
    fontWeight: '700',
    color:      '#475569',
  },
  savingsSaveBtn: {
    flex:            1,
    paddingVertical: 14,
    borderRadius:    22,
    alignItems:      'center',
    backgroundColor: 'rgba(139,92,246,0.92)',
  },
  savingsSaveText: {
    fontSize:   16,
    fontWeight: '700',
    color:      '#FFFFFF',
  },

  // ── 日期觸發按鈕 ──
  dateTrigger: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    backgroundColor: '#F8FAFC',
    borderRadius:    radius.lg,
    padding:         14,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     'rgba(0,0,0,0.06)',
  },
  dateTriggerText: {
    flex: 1, fontSize: fontSize.lg, fontWeight: '600', color: colors.textPrimary,
  },

  btnRow:    { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, padding: spacing.lg, borderRadius: radius.lg, alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  cancelText:  { fontSize: fontSize.xl, fontWeight: '600', color: colors.textSecondary },
  confirmBtn:  { flex: 1, padding: spacing.lg, borderRadius: radius.lg, alignItems: 'center' },
  confirmText: { color: colors.textWhite, fontSize: fontSize.xl, fontWeight: '700' },

  // ── 投資資產 Bottom Sheet ──
  investmentSheet: {
    backgroundColor:      'rgba(255,255,255,0.96)',
    borderTopLeftRadius:  32,
    borderTopRightRadius: 32,
    borderWidth:          1,
    borderColor:          'rgba(255,255,255,0.86)',
    paddingHorizontal:    20,
    paddingBottom:        28,
    maxHeight:            '88%',
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -8 },
    shadowOpacity:        0.10,
    shadowRadius:         22,
    elevation:            18,
  },
  investmentSheetList: {
    height:    '62%',
    minHeight: 500,
  },
  investmentSheetForm: {
    height:    '82%',
    minHeight: 580,
  },
  invHeaderRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      8,
    marginBottom:   16,
  },
  invTitleGroup: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  invSheetTitle: {
    fontSize:   20,
    fontWeight: '800',
    color:      '#1E293B',
  },
  invBackBtn: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    padding:       6,
  },
  invBackText: {
    fontSize:   14,
    fontWeight: '600',
    color:      '#64748B',
  },
  invBody: {
    flex:      1,
    minHeight: 240,
  },
  invBodyContent: {
    paddingBottom: 96,
    gap:           12,
  },
  // 投資摘要卡
  invSummaryCard: {
    backgroundColor: 'rgba(248,250,252,0.94)',
    borderRadius:    16,
    padding:         14,
    borderWidth:     1,
    borderColor:     'rgba(139,92,246,0.18)',
    marginBottom:    8,
  },
  summaryAccentBar: {
    height:        3,
    borderRadius:  999,
    marginBottom:  10,
  },
  invSummaryTop: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   6,
  },
  invSummaryLabel:   { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginBottom: 4 },
  invSummaryMain:    { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  invSummaryProfit:  { fontSize: 16, fontWeight: '700' },
  invSummaryRate:    { fontSize: 13, fontWeight: '600', marginTop: 2 },
  invSummaryInvested:{ fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  // 空狀態
  invEmptyBox: {
    paddingVertical: 32,
    alignItems:      'center',
    gap:             8,
  },
  invEmptyTitle: { fontSize: 16, fontWeight: '700', color: '#475569' },
  invEmptyHint:  { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
  // 持股卡片
  holdingCard: {
    backgroundColor: 'rgba(248,250,252,0.94)',
    borderRadius:    16,
    padding:         14,
    borderWidth:     1,
    borderColor:     'rgba(0,0,0,0.06)',
  },
  holdingTopRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
  },
  holdingTitle:   { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  holdingMeta:    { fontSize: 12, color: '#64748B', lineHeight: 18 },
  holdingValue:   { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 4 },
  holdingProfit:  { fontSize: 14, fontWeight: '700', marginTop: 8 },
  holdingActions: { flexDirection: 'row', gap: 8, paddingLeft: 10 },
  holdingActionBtn: { padding: 6 },
  // 表單
  invFormRow:     { flexDirection: 'row', gap: 8, marginBottom: 10 },
  invInput: {
    backgroundColor:   '#F8FAFC',
    borderRadius:      16,
    paddingHorizontal: 14,
    paddingVertical:   11,
    fontSize:          15,
    fontWeight:        '500',
    color:             '#1E293B',
    borderWidth:       1,
    borderColor:       'rgba(0,0,0,0.06)',
  },
  invToggleRow:     { flexDirection: 'row', gap: 8, marginBottom: 10 },
  invToggleBtn: {
    flex:            1,
    padding:         12,
    borderRadius:    radius.lg,
    alignItems:      'center',
    backgroundColor: '#F8FAFC',
    borderWidth:     1,
    borderColor:     'rgba(0,0,0,0.06)',
  },
  invToggleBtnActive: {
    backgroundColor: 'rgba(139,92,246,0.10)',
    borderColor:     '#8B5CF6',
  },
  invToggleBtnText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  invFetchBtn: {
    paddingHorizontal: 14,
    paddingVertical:   13,
    borderRadius:      radius.lg,
    backgroundColor:   '#F1F5F9',
    borderWidth:       1,
    borderColor:       'rgba(0,0,0,0.06)',
    justifyContent:    'center',
  },
  invFetchBtnText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  // 固定底部
  invFooter: {
    paddingTop:      14,
    paddingBottom:   24,
    borderTopWidth:  1,
    borderTopColor:  'rgba(0,0,0,0.06)',
  },
  invAddBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    backgroundColor: 'rgba(139,92,246,0.92)',
    borderRadius:    22,
    paddingVertical: 14,
  },
  invAddBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  invCancelBtn: {
    flex:            1,
    paddingVertical: 14,
    borderRadius:    22,
    alignItems:      'center',
    backgroundColor: '#F8FAFC',
    borderWidth:     1,
    borderColor:     'rgba(0,0,0,0.06)',
  },
  invCancelText: { fontSize: 16, fontWeight: '600', color: '#475569' },
  invSaveBtn: {
    flex:            1.6,
    paddingVertical: 14,
    borderRadius:    22,
    alignItems:      'center',
    backgroundColor: 'rgba(139,92,246,0.92)',
  },
  invSaveText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
