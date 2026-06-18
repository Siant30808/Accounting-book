/**
 * RobotAssistant.tsx ── 整合元件：機器人 + 浮動提示卡片
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Dimensions } from 'react-native';
import { FabRobot }    from './FabRobot';
import { RobotBubble, BubbleStat, BubbleTone } from './RobotBubble';

// ── 固定文字庫（fallback，financeSummary 不存在時使用）
const ROBOT_MESSAGES = {
  happy: [
    '今日餐費還很穩，晚餐還有空間喔！',
    '今天花費很漂亮，繼續保持！',
    '生活預算很健康，目前沒問題。',
    '狀況很安全，放心繼續記帳！',
  ],
  normal: [
    '今日餐費狀況正常。',
    '生活預算還算穩定喔。',
    '目前節奏不錯，繼續觀察。',
    '今天花費看起來還可以。',
  ],
  nervous: [
    '今日餐費有點接近上限了。',
    '晚餐可以簡單一點喔。',
    '生活預算開始有點緊，留意一下。',
    '今日餐費上限快到了，稍微注意。',
  ],
  angry: [
    '今日餐費快到上限了，晚餐簡單吃吧！',
    '生活預算壓力有點高，先檢查一下！',
    '建議先暫停非必要消費。',
  ],
  dizzy: [
    '今日餐費已超出上限！先停一下！',
    '生活預算快爆了，需要檢查囉。',
    '狀況有點危險，快看看分類！',
  ],
} as const;

type StageName = keyof typeof ROBOT_MESSAGES;

function getStageName(pct: number): StageName {
  if (pct <= 20) return 'happy';
  if (pct <= 50) return 'normal';
  if (pct <= 70) return 'nervous';
  if (pct <= 90) return 'angry';
  return 'dizzy';
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fmtAmt(n: number): string {
  return `NT$${Math.round(n).toLocaleString('zh-TW')}`;
}

// ── 財務摘要（由 HomeScreen 計算後傳入）
export interface RobotFinanceSummary {
  todayMealSpent:    number;
  todayMealAllowance: number;   // mealPeriodBudget / cycleDays

  mealPeriodSpent:     number;
  mealPeriodBudget:    number;
  mealPeriodRemaining: number;  // budget - spent
  mealRemainingDailyAvg: number; // remaining / daysLeft
  mealDailyAverage:    number;  // (kept for compat)
  daysLeft:            number;

  lifeBudgetSpent:  number;
  lifeBudgetTotal:  number;

  categoryBudgets: {
    name:   '食材採購' | '日用品' | '娛樂';
    spent:  number;
    budget: number;
    pct:    number;
  }[];

  upcomingRecurring?: {
    name:        string;
    amount:      number;
    category:    string;
    daysUntil:   number;
    paymentMode: 'manual' | 'auto';
  }[];

  largestExpense?: {
    note:     string;
    amount:   number;
    category: string;
  };

  largestMealExpense?: {
    note:   string;
    amount: number;
  };
}

// ── 根據財務摘要產生具體訊息
function buildRobotSimpleMessage(s: RobotFinanceSummary, budgetPct: number): string {
  const mealAllowance = s.todayMealAllowance || 1;
  const todayMealPct  = s.todayMealSpent / mealAllowance;
  const periodMealPct = s.mealPeriodSpent / (s.mealPeriodBudget || 1);

  // 1. 手動繳費帳單：逾期或即將到期（已繳的已被過濾掉）
  const manualDue = s.upcomingRecurring?.filter(b => b.paymentMode === 'manual');
  if (manualDue && manualDue.length > 0) {
    const b = manualDue[0];
    if (b.daysUntil < 0) {
      return `${b.name} ${fmtAmt(b.amount)} 已逾期 ${Math.abs(b.daysUntil)} 天，請確認是否已完成繳費。`;
    }
    if (b.daysUntil === 0) return `今天是 ${b.name} 繳費日（${fmtAmt(b.amount)}），記得完成繳費。`;
    if (b.daysUntil === 1) return `明天要繳 ${b.name} ${fmtAmt(b.amount)}，記得安排繳費。`;
    return `${b.daysUntil} 天後要繳 ${b.name} ${fmtAmt(b.amount)}，記得安排繳費。`;
  }

  // 2. 本期餐費偏緊（>= 75%）
  if (periodMealPct >= 0.75) {
    const remaining   = s.mealPeriodRemaining ?? Math.max(0, s.mealPeriodBudget - s.mealPeriodSpent);
    const dailyAvg    = s.mealRemainingDailyAvg ?? s.mealDailyAverage;
    const daysLeftStr = s.daysLeft > 0 ? `，剩 ${s.daysLeft} 天每天約 ${fmtAmt(dailyAvg)}` : '';
    return `本期餐費已用 ${Math.round(periodMealPct * 100)}%，剩 ${fmtAmt(remaining)}${daysLeftStr}。`;
  }

  // 3. 今日餐費超標
  if (todayMealPct > 1) {
    return `今天餐費已超過建議 ${fmtAmt(mealAllowance)}，後面簡單吃就好。`;
  }

  // 4. 今日餐費接近 80%
  if (todayMealPct >= 0.8) {
    return `今天餐費 ${fmtAmt(s.todayMealSpent)} / ${fmtAmt(mealAllowance)}，快到上限，晚餐可以抓簡單一點。`;
  }

  // 5. 生活預算某分類超過 80%（找最高的）
  const highCat = [...s.categoryBudgets]
    .filter(c => c.pct >= 80)
    .sort((a, b) => b.pct - a.pct)[0];
  if (highCat) {
    return `${highCat.name}已經用了 ${Math.round(highCat.pct)}%，這個月要稍微留意。`;
  }

  // 6. 本期最大支出提醒（偶爾出現，機率 35%）
  if (s.largestExpense && s.largestExpense.amount > 0 && Math.random() < 0.35) {
    const { note, amount, category } = s.largestExpense;
    if (category === '餐費' && s.largestMealExpense) {
      return `本期目前最大餐費是「${s.largestMealExpense.note}」${fmtAmt(s.largestMealExpense.amount)}。`;
    }
    return `本期目前最大支出是「${note}」${fmtAmt(amount)}，分類在${category}。`;
  }

  // 7. 今日有餐費記錄，顯示數字
  if (s.todayMealSpent > 0) {
    const remain = Math.max(0, mealAllowance - s.todayMealSpent);
    return `今天餐費 ${fmtAmt(s.todayMealSpent)} / ${fmtAmt(mealAllowance)}，今日還能吃 ${fmtAmt(remain)}。`;
  }

  // 8. 全部正常
  if (budgetPct <= 30) return '餐費和生活預算目前都很穩，繼續保持！';
  if (budgetPct <= 60) return `生活預算已用 ${budgetPct}%，目前步調正常。`;
  return `預算使用率 ${budgetPct}%，稍微留意後續支出。`;
}

export interface BubbleAlert {
  title?:   string;
  message:  string;
  stats?:   BubbleStat[];
  tone?:    BubbleTone;
}

interface RobotAssistantProps {
  budgetPct:           number;
  onRobotPress?:       () => void;
  mealAlert?:          BubbleAlert | null;
  onMealAlertShown?:   () => void;
  financeSummary?:     RobotFinanceSummary;
  afterRecord?:        string | null;
  onAfterRecordShown?: () => void;
}

export function RobotAssistant({
  budgetPct, onRobotPress, mealAlert, onMealAlertShown,
  financeSummary, afterRecord, onAfterRecordShown,
}: RobotAssistantProps) {
  const [visible,      setVisible]      = useState(false);
  const [bubbleMsg,    setBubbleMsg]    = useState('');
  const [bubbleTitle,  setBubbleTitle]  = useState<string | undefined>(undefined);
  const [bubbleStats,  setBubbleStats]  = useState<BubbleStat[] | undefined>(undefined);
  const [bubbleTone,   setBubbleTone]   = useState<BubbleTone  | undefined>(undefined);
  const [bubblePos,    setBubblePos]    = useState({ x: 0, y: 0 });

  const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const cancelTimer = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  };

  const hideBubble = useCallback(() => {
    cancelTimer();
    setVisible(false);
  }, []);

  // 外部觸發：大額餐費提醒（rich card，顯示 9 秒）
  useEffect(() => {
    if (!mealAlert) return;
    cancelTimer();
    setBubbleTitle(mealAlert.title);
    setBubbleMsg(mealAlert.message);
    setBubbleStats(mealAlert.stats);
    setBubbleTone(mealAlert.tone);
    setBubblePos(lastPosRef.current);
    setVisible(true);
    const ms = mealAlert.stats?.length ? 9000 : 6000;
    hideTimer.current = setTimeout(() => setVisible(false), ms);
    onMealAlertShown?.();
  }, [mealAlert]);

  // 記帳後回饋：simple message，顯示 3.5 秒
  useEffect(() => {
    if (!afterRecord) return;
    cancelTimer();
    const { width, height } = Dimensions.get('window');
    const pos = (lastPosRef.current.x || lastPosRef.current.y)
      ? lastPosRef.current
      : { x: width - 48, y: height - 150 };
    setBubbleTitle(undefined);
    setBubbleMsg(afterRecord);
    setBubbleStats(undefined);
    setBubbleTone(undefined);
    setBubblePos(pos);
    setVisible(true);
    hideTimer.current = setTimeout(() => setVisible(false), 3500);
    onAfterRecordShown?.();
  }, [afterRecord]);

  // 一般點擊：根據 financeSummary 產生具體訊息（simple mode）
  const showSimpleMessage = useCallback((px: number, py: number) => {
    const msg = financeSummary
      ? buildRobotSimpleMessage(financeSummary, budgetPct)
      : pickRandom(ROBOT_MESSAGES[getStageName(budgetPct)]);

    cancelTimer();
    setBubbleTitle(undefined);
    setBubbleMsg(msg);
    setBubbleStats(undefined);
    setBubbleTone(undefined);
    setBubblePos({ x: px, y: py });
    setVisible(true);
    hideTimer.current = setTimeout(() => setVisible(false), 4000);
  }, [budgetPct, financeSummary]);

  const handlePress = useCallback((px: number, py: number) => {
    lastPosRef.current = { x: px, y: py };
    showSimpleMessage(px, py);
  }, [showSimpleMessage]);

  const handleRecord = useCallback(() => {
    hideBubble();
    onRobotPress?.();
  }, [hideBubble, onRobotPress]);

  return (
    <>
      <FabRobot budgetPct={budgetPct} onPress={handlePress} />
      <RobotBubble
        visible={visible}
        message={bubbleMsg}
        robotX={bubblePos.x}
        robotY={bubblePos.y}
        title={bubbleTitle}
        stats={bubbleStats}
        tone={bubbleTone}
        onRecord={handleRecord}
        onClose={hideBubble}
      />
    </>
  );
}
