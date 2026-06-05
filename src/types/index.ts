// ── 付款方式 ──
export type PayMethod = '現金' | '信用卡' | '—';

// ── 交易類型 ──
export type TransactionType = 'income' | 'expense';

// ── 支出類別 ──
export type ExpenseCategory = '餐飲' | '交通' | '購物' | '娛樂' | '住宿' | '醫療' | '教育' | '其他';
export type IncomeCategory  = '薪資' | '獎金' | '投資' | '其他';
export type Category = ExpenseCategory | IncomeCategory;

// ── 單筆明細 ──
export interface Transaction {
  id:     number;
  type:   TransactionType;
  cat:    Category;
  amount: number;
  date:   string;   // 'YYYY-MM-DD'
  time:   string;   // 'HH:MM'
  pay:    PayMethod;
  note:   string;
}

// ── 週期物件（計算結果，不持久化）──
export interface Period {
  start:    Date;
  end:      Date;
  startStr: string;
  endStr:   string;
  label:    string;  // 'M/D ~ M/D'
}

// ── App 全域設定（持久化）──
export interface AppSettings {
  username:        string;
  payday:          number;
  budget:          number;
  savings:         number;
  lastPeriodStart: string;
  lastPeriodEnd:   string;
  periodBalances:  Record<string, number>;
}

// ── FAB 位置（持久化）──
export interface FabPosition {
  x: number;
  y: number;
}

// ── 背景圖設定（持久化）──
export interface BgSettings {
  opacity: number;
  fileUri: string | null;
}

// ── 圓餅切片 ──
export interface PieSlice {
  label:  string;
  amount: number;
  color:  string;
}

// ── MMKV 儲存鍵名 ──
export const STORAGE_KEYS = {
  TRANSACTIONS: 'acct_txdata_v1',
  SETTINGS:     'acct_settings_v1',
  FAB_POS:      'fab_pos',
  BG_SETTINGS:  'acct_bg_settings_v1',
} as const;

// ── 預設設定值 ──
export const DEFAULT_SETTINGS: AppSettings = {
  username:        '智豪',
  payday:          5,
  budget:          15000,
  savings:         0,
  lastPeriodStart: '',
  lastPeriodEnd:   '',
  periodBalances:  {},
};

// ── 類別資料 ──
export const CATS = {
  expense: [
    { e: '🍜', n: '餐飲' }, { e: '🚌', n: '交通' }, { e: '🛍️', n: '購物' },
    { e: '🎮', n: '娛樂' }, { e: '🏠', n: '住宿' }, { e: '💊', n: '醫療' },
    { e: '📚', n: '教育' }, { e: '📋', n: '其他' },
  ],
  income: [
    { e: '💼', n: '薪資' }, { e: '🎁', n: '獎金' },
    { e: '📈', n: '投資' }, { e: '📋', n: '其他' },
  ],
} as const;

export function getCatIcon(cat: string): string {
  return (
    [...CATS.expense, ...CATS.income].find(c => c.n === cat)?.e ?? '📋'
  );
}
