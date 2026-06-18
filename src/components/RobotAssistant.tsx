/**
 * RobotAssistant.tsx ── 整合元件：機器人 + 浮動提示卡片
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Dimensions } from 'react-native';
import { FabRobot }    from './FabRobot';
import { RobotBubble, BubbleStat, BubbleTone } from './RobotBubble';

// ── Fallback 文字庫（financeSummary 不存在時使用）
const ROBOT_MESSAGES = {
  happy: [
    '今日餐費還很穩，晚餐還有空間喔！',
    '今天花費很漂亮，繼續保持！',
    '生活預算很健康，目前沒問題。',
    '狀況很安全，放心繼續記帳！',
    '這期節奏不錯，繼續加油！',
  ],
  normal: [
    '今日餐費狀況正常。',
    '生活預算還算穩定喔。',
    '目前節奏不錯，繼續觀察。',
    '今天花費看起來還可以。',
    '預算使用在正常範圍，繼續保持。',
  ],
  nervous: [
    '今日餐費有點接近上限了。',
    '晚餐可以簡單一點喔。',
    '生活預算開始有點緊，留意一下。',
    '今日餐費上限快到了，稍微注意。',
    '可以評估一下最近的消費習慣。',
  ],
  angry: [
    '今日餐費快到上限了，晚餐簡單吃吧！',
    '生活預算壓力有點高，先檢查一下！',
    '建議先暫停非必要消費。',
    '這幾天可以刻意輕鬆一點。',
  ],
  dizzy: [
    '今日餐費已超出上限！先停一下！',
    '生活預算快爆了，需要檢查囉。',
    '狀況有點危險，快看看分類！',
    '這期消費偏高，下半期要保守一些。',
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

function pickNonRepeating<T extends { message: string }>(
  candidates: T[],
  lastMsg: string | null,
): T {
  if (candidates.length <= 1) return candidates[0];
  const filtered = candidates.filter(c => c.message !== lastMsg);
  return pickRandom(filtered.length > 0 ? filtered : candidates);
}

function fmtAmt(n: number): string {
  return `NT$${Math.round(n).toLocaleString('zh-TW')}`;
}

// ── 財務摘要（由 HomeScreen 計算後傳入）
export interface RobotFinanceSummary {
  todayMealSpent:       number;
  todayMealAllowance:   number;

  mealPeriodSpent:      number;
  mealPeriodBudget:     number;
  mealPeriodRemaining:  number;
  mealRemainingDailyAvg: number;
  mealDailyAverage:     number;
  daysLeft:             number;

  lifeBudgetSpent:  number;
  lifeBudgetTotal:  number;

  categoryBudgets: {
    name:   string;
    spent:  number;
    budget: number;
    pct:    number;
  }[];

  upcomingRecurring?: {
    name:                   string;
    amount:                 number;
    category:               string;
    daysUntil:              number;
    paymentMode:            'manual' | 'auto';
    paymentRule?:           'fixedDate' | 'tPlusBusinessDays';
    executionDay?:          number;
    settlementBusinessDays?: number;
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

export interface BubbleAlert {
  title?:   string;
  message:  string;
  stats?:   BubbleStat[];
  tone?:    BubbleTone;
}

// ── 候選訊息池（點擊時隨機挑一則）
function buildRobotCandidates(
  budgetPct: number,
  financeSummary?: RobotFinanceSummary,
): BubbleAlert[] {
  const candidates: BubbleAlert[] = [];

  if (!financeSummary) {
    const stage = getStageName(budgetPct);
    ROBOT_MESSAGES[stage].forEach(msg => candidates.push({ message: msg }));
    return candidates;
  }

  const s = financeSummary;
  const mealPct = s.mealPeriodBudget > 0
    ? Math.round(s.mealPeriodSpent / s.mealPeriodBudget * 100)
    : 0;
  const mealAllowance = s.todayMealAllowance || 1;
  const todayMealPct  = s.todayMealSpent / mealAllowance;

  // 1. 帳單提醒（手動繳費，最多取前 2 筆）
  const manualDue = s.upcomingRecurring?.filter(b => b.paymentMode === 'manual') ?? [];
  for (const b of manualDue.slice(0, 2)) {
    const isInvest = b.paymentRule === 'tPlusBusinessDays';
    const n = b.settlementBusinessDays ?? 2;
    if (b.daysUntil < 0) {
      candidates.push({
        title: '帳單提醒',
        message: isInvest
          ? `${b.name} T+${n} 交割已逾期 ${Math.abs(b.daysUntil)} 天，請確認帳戶是否已扣款。`
          : `${b.name} 已逾期 ${Math.abs(b.daysUntil)} 天，請確認是否已完成繳費。`,
        tone: 'danger',
        stats: [
          { label: '金額', value: fmtAmt(b.amount) },
          { label: '狀態', value: '已逾期' },
        ],
      });
    } else if (b.daysUntil === 0) {
      candidates.push({
        title: '帳單提醒',
        message: isInvest
          ? `今天是 ${b.name} T+${n} 交割扣款日，請確認帳戶餘額。`
          : `今天是 ${b.name} 繳費日，記得完成繳費。`,
        tone: 'warning',
        stats: [
          { label: '金額', value: fmtAmt(b.amount) },
          { label: '付款方式', value: '手動繳費' },
        ],
      });
    } else if (b.daysUntil <= 3) {
      candidates.push({
        title: '帳單提醒',
        message: `${b.name} 還有 ${b.daysUntil} 天到期，記得安排繳費。`,
        tone: 'info',
        stats: [
          { label: '金額', value: fmtAmt(b.amount) },
          { label: '剩餘天數', value: `${b.daysUntil} 天` },
        ],
      });
    } else {
      candidates.push({
        title: '帳單提醒',
        message: `${b.name} 還有 ${b.daysUntil} 天到期，先安排好。`,
        tone: 'info',
      });
    }
  }

  // 2. 本期餐費超支（100%+）→ 多種文案
  if (mealPct >= 100) {
    const remaining = Math.max(0, s.mealPeriodRemaining);
    const mealStats: BubbleStat[] = [
      { label: '餐費使用率', value: `${mealPct}%` },
      { label: '本期剩餘',  value: fmtAmt(remaining) },
      { label: '剩餘天數',  value: `${s.daysLeft} 天` },
    ];
    [
      '本期餐費已超出預算，接下來幾天先以簡單餐為主會比較穩。',
      `餐費目前已用 ${mealPct}%，這期先把外食頻率壓低一點。`,
      `本期餐費已見底，後面 ${s.daysLeft} 天建議改用保守模式。`,
    ].forEach(message => candidates.push({ title: '餐費提醒', message, tone: 'danger', stats: mealStats }));
  } else if (mealPct >= 75) {
    // 餐費偏緊（75–99%）
    candidates.push({
      title: '餐費提醒',
      message: `本期餐費已用 ${mealPct}%，後面幾天可以稍微節制一下。`,
      tone: 'warning',
      stats: [
        { label: '餐費使用率', value: `${mealPct}%` },
        { label: '本期剩餘',  value: fmtAmt(Math.max(0, s.mealPeriodRemaining)) },
        { label: '每日可用',  value: fmtAmt(s.mealRemainingDailyAvg) },
      ],
    });
    candidates.push({
      title: '餐費提醒',
      message: `餐費已進入後半段，每天約還能用 ${fmtAmt(s.mealRemainingDailyAvg)}，留意一下。`,
      tone: 'warning',
    });
  }

  // 3. 今日餐費超標（mealPct < 100，避免重複）
  if (todayMealPct > 1 && mealPct < 100) {
    candidates.push({ message: '今天餐費已超過建議值，後面簡單吃就好。', tone: 'warning' });
    candidates.push({ message: '今天吃得比較豐盛，晚餐可以輕鬆一點。', tone: 'warning' });
  }

  // 4. 生活預算高風險分類
  const riskyCat = [...s.categoryBudgets]
    .filter(c => c.budget > 0 && c.pct >= 80)
    .sort((a, b) => b.pct - a.pct)[0];
  if (riskyCat) {
    if (riskyCat.pct >= 100) {
      candidates.push({
        title: '生活預算提醒',
        message: `${riskyCat.name}已經超出預算，這幾天可以先暫停非必要採買。`,
        tone: 'danger',
        stats: [
          { label: riskyCat.name, value: `${riskyCat.pct}%` },
          { label: '已花費',      value: fmtAmt(riskyCat.spent) },
          { label: '預算',        value: fmtAmt(riskyCat.budget) },
        ],
      });
    } else {
      candidates.push({
        title: '生活預算提醒',
        message: `${riskyCat.name}已用了 ${riskyCat.pct}%，接下來稍微留意。`,
        tone: 'warning',
      });
    }
  }

  // 5. 最大支出（加入候選池，隨機被選到即出現）
  if (s.largestExpense && s.largestExpense.amount > 0) {
    candidates.push({
      title: '本期支出觀察',
      message: `目前最大支出是${s.largestExpense.category}，可以看看是否有優化空間。`,
      tone: 'info',
      stats: [
        { label: '項目', value: s.largestExpense.note },
        { label: '金額', value: fmtAmt(s.largestExpense.amount) },
        { label: '分類', value: s.largestExpense.category },
      ],
    });
  }

  // 6. 今日餐費正常（有消費但不超標）
  if (s.todayMealSpent > 0 && todayMealPct <= 0.8) {
    const remain = Math.max(0, mealAllowance - s.todayMealSpent);
    candidates.push({
      message: `今天餐費 ${fmtAmt(s.todayMealSpent)} / ${fmtAmt(mealAllowance)}，今日還能吃 ${fmtAmt(remain)}。`,
      tone: 'info',
    });
  }

  // 7. 健康 fallback（沒有警示時加入正向候選）
  if (budgetPct <= 30) {
    candidates.push({ message: '餐費和生活預算目前都很穩，繼續保持！', tone: 'good' });
    candidates.push({ message: '這期花費控制得不錯，繼續加油！', tone: 'good' });
  } else if (budgetPct <= 60) {
    candidates.push({ message: `生活預算已用 ${budgetPct}%，目前步調正常。` });
  }

  // 8. 確保至少有一個候選
  if (candidates.length === 0) {
    const stage = getStageName(budgetPct);
    ROBOT_MESSAGES[stage].forEach(msg => candidates.push({ message: msg }));
  }

  return candidates;
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
  const [visible,     setVisible]     = useState(false);
  const [bubbleMsg,   setBubbleMsg]   = useState('');
  const [bubbleTitle, setBubbleTitle] = useState<string | undefined>(undefined);
  const [bubbleStats, setBubbleStats] = useState<BubbleStat[] | undefined>(undefined);
  const [bubbleTone,  setBubbleTone]  = useState<BubbleTone  | undefined>(undefined);
  const [bubblePos,   setBubblePos]   = useState({ x: 0, y: 0 });

  const hideTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPosRef     = useRef({ x: 0, y: 0 });
  const lastMessageRef = useRef<string | null>(null);

  const cancelTimer = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  };

  const hideBubble = useCallback(() => {
    cancelTimer();
    setVisible(false);
  }, []);

  // 共用顯示函式
  const showBubbleAlert = useCallback((
    alert: BubbleAlert,
    px: number,
    py: number,
    duration = 5000,
  ) => {
    cancelTimer();
    setBubbleTitle(alert.title);
    setBubbleMsg(alert.message);
    setBubbleStats(alert.stats);
    setBubbleTone(alert.tone);
    setBubblePos({ x: px, y: py });
    setVisible(true);
    hideTimer.current = setTimeout(() => setVisible(false), duration);
  }, []);

  // 外部觸發：大額餐費提醒（rich card，顯示 9 秒）
  useEffect(() => {
    if (!mealAlert) return;
    const pos = (lastPosRef.current.x || lastPosRef.current.y)
      ? lastPosRef.current
      : fallbackPos();
    showBubbleAlert(mealAlert, pos.x, pos.y, mealAlert.stats?.length ? 9000 : 6000);
    onMealAlertShown?.();
  }, [mealAlert]);

  // 記帳後回饋：simple message，顯示 3.5 秒
  useEffect(() => {
    if (!afterRecord) return;
    const pos = (lastPosRef.current.x || lastPosRef.current.y)
      ? lastPosRef.current
      : fallbackPos();
    showBubbleAlert({ message: afterRecord, tone: 'good' }, pos.x, pos.y, 3500);
    onAfterRecordShown?.();
  }, [afterRecord]);

  // 點擊機器人：afterRecord 優先 → 候選池隨機挑一則
  const handlePress = useCallback((px: number, py: number) => {
    lastPosRef.current = { x: px, y: py };

    // afterRecord 優先（若自動顯示已清除，此處通常為 null）
    if (afterRecord) {
      showBubbleAlert({ title: '已記帳', message: afterRecord, tone: 'good' }, px, py, 4000);
      onAfterRecordShown?.();
      return;
    }

    const candidates = buildRobotCandidates(budgetPct, financeSummary);
    const alert = pickNonRepeating(candidates, lastMessageRef.current);
    lastMessageRef.current = alert.message;
    const duration = alert.stats?.length ? 7000 : 4500;
    showBubbleAlert(alert, px, py, duration);
  }, [afterRecord, budgetPct, financeSummary, onAfterRecordShown, showBubbleAlert]);

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

function fallbackPos() {
  const { width, height } = Dimensions.get('window');
  return { x: width - 48, y: height - 150 };
}
