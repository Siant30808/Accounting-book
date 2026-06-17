// ── 付款方式 ──
export type PayMethod = '現金' | '信用卡' | '—';

// ── 交易類型 ──
export type TransactionType = 'income' | 'expense';

// ── 支出分類（三組）──
export type ExpenseCategoryDaily    = '餐費';
export type ExpenseCategoryMonthly  = '食材採購' | '日用品' | '娛樂';
export type ExpenseCategoryIndep    =
  '加油' | '車輛維護' | '換機油' | '維修' |
  '醫療' | '保險' | '稅金' | '貸款' | '投資' | '存款' | '其他必要支出';
export type ExpenseCategory = ExpenseCategoryDaily | ExpenseCategoryMonthly | ExpenseCategoryIndep;

export type IncomeCategory  = '薪資' | '獎金' | '其他';
export type Category = ExpenseCategory | IncomeCategory;

// ── 分類正規化（舊資料 → 新分類）──
export function normalizeCategory(cat: string): string {
  if (['外食', '飲料', '零食', '早餐', '午餐', '晚餐', '宵夜', '餐飲'].includes(cat)) return '餐費';
  if (['Costco'].includes(cat)) return '食材採購';
  if (['一般購物', '家用品', '購物'].includes(cat)) return '日用品';
  if (['訂閱'].includes(cat)) return '娛樂';
  if (['車貸', '房貸', '信貸', '分期'].includes(cat)) return '貸款';
  if (['通勤', '停車', '交通'].includes(cat)) return '其他必要支出';
  if (['教育', '住宿'].includes(cat)) return '其他必要支出';
  return cat;
}

// 分類所屬群組
export type CatGroup = 'daily' | 'monthly' | 'indep' | 'income';
export function getCatGroup(cat: string): CatGroup {
  const n = normalizeCategory(cat);
  if (n === '餐費') return 'daily';
  if (['食材採購', '日用品', '娛樂'].includes(n)) return 'monthly';
  if (['薪資', '獎金', '其他'].includes(n)) return 'income';
  return 'indep';
}

// Modal 提示文字
export function getCatHint(cat: string): string {
  const g = getCatGroup(cat);
  if (g === 'daily')   return '此分類會計入今日餐費與本期餐費預算';
  if (g === 'monthly') return '此分類會計入本期生活預算';
  return '此分類為獨立統計，不影響今日餐費與本期生活預算';
}

// ── 單筆明細 ──
export interface Transaction {
  id:               number;
  type:             TransactionType;
  cat:              string;   // string 允許舊分類資料
  amount:           number;
  date:             string;   // 'YYYY-MM-DD'
  time:             string;   // 'HH:MM'
  pay:              PayMethod;
  note:             string;
  source?:          string;   // 'recurring-manual' | 'recurring-auto' 等
  recurringBillId?: number;   // 對應固定帳單 id（用於防重複）
}

// ── 週期物件（計算結果，不持久化）──
export interface Period {
  start:    Date;
  end:      Date;
  startStr: string;
  endStr:   string;
  label:    string;  // 'M/D ~ M/D'
}

// ── 每月生活預算分項
export interface MonthlyCategoryBudgets {
  食材採購: number;
  日用品:   number;
  娛樂:     number;
}

// ── App 全域設定（持久化）──
export interface AppSettings {
  username:               string;
  payday:                 number;
  mealPeriodBudget:       number;              // 本期餐費預算（每日上限由系統計算）
  monthlyCategoryBudgets: MonthlyCategoryBudgets; // 各類生活預算
  savings:                number;
  lastPeriodStart:        string;
  lastPeriodEnd:          string;
  periodBalances:         Record<string, number>;
}

// ── FAB 位置（持久化）──
export interface FabPosition {
  x: number;
  y: number;
}

// ── 背景圖設定（持久化）──
export interface BgSettings {
  opacity:  number;
  fileUri:  string | null;
  textMode: 'dark' | 'light';
}

// ── 圓餅切片 ──
export interface PieSlice {
  label:  string;
  amount: number;
  color:  string;
}

// ── 固定帳單（持久化）──
export interface Bill {
  id:                 number;
  name:               string;
  amount:             number;
  dueDay:             number;
  cat:                string;
  /** 明確標示付款方式 */
  paymentMode?:       'manual' | 'auto';
  /** 舊欄位保留向後相容 */
  autoDeduct:         boolean;
  paidPeriods:        string[];
  /** 手動繳費：本期已繳的 period key（YYYY-MM），已繳後本期不再提醒 */
  lastPaidPeriodKey?: string;
  /** 手動繳費：最後繳費時間（ISO string）*/
  paidAt?:            string;
}

/** 由 period.startStr（YYYY-MM-DD）產生月份 key（YYYY-MM）*/
export function periodKey(startStr: string): string {
  return startStr.substring(0, 7);
}

/** 取得固定帳單的有效付款方式（相容舊資料）*/
export function getBillPaymentMode(bill: Bill): 'manual' | 'auto' {
  return bill.paymentMode ?? (bill.autoDeduct ? 'auto' : 'manual');
}

// ── 投資持股（持久化）──
export interface StockHolding {
  id:              number;
  symbol:          string;
  name:            string;
  shares:          number;
  investedAmount:  number;
  currentPrice:    number;
  currency:        'TWD' | 'USD';
  market:          'TW' | 'US';
  priceSource?:    string;
  priceUpdatedAt?: string;
  updatedAt:       string;
}

// ── MMKV 儲存鍵名 ──
export const STORAGE_KEYS = {
  TRANSACTIONS: 'acct_txdata_v1',
  SETTINGS:     'acct_settings_v1',
  FAB_POS:      'fab_pos',
  BG_SETTINGS:  'acct_bg_settings_v1',
  BILLS:        'acct_bills_v1',
  BILL_DISMISS: 'acct_bill_dismiss_v1',
  STOCKS:       'acct_stocks_v1',
} as const;

// ── 預設設定值 ──
export const DEFAULT_MONTHLY_BUDGETS: MonthlyCategoryBudgets = {
  食材採購: 6000,
  日用品:   2000,
  娛樂:     3000,
};

export const DEFAULT_SETTINGS: AppSettings = {
  username:               '智豪',
  payday:                 5,
  mealPeriodBudget:       9000,
  monthlyCategoryBudgets: { ...DEFAULT_MONTHLY_BUDGETS },
  savings:                0,
  lastPeriodStart:        '',
  lastPeriodEnd:          '',
  periodBalances:         {},
};

// ── 分類資料（三組支出 + 收入）──
export const CAT_GROUPS = {
  daily: [
    { e: '🍽️', n: '餐費' },
  ],
  monthly: [
    { e: '🥬', n: '食材採購' },
    { e: '🧺', n: '日用品' },
    { e: '🎮', n: '娛樂' },
  ],
  indep: [
    { e: '⛽', n: '加油' },
    { e: '🚗', n: '車輛維護' },
    { e: '🔧', n: '換機油' },
    { e: '🔨', n: '維修' },
    { e: '💊', n: '醫療' },
    { e: '🛡️', n: '保險' },
    { e: '📋', n: '稅金' },
    { e: '💳', n: '貸款' },
    { e: '📈', n: '投資' },
    { e: '🏦', n: '存款' },
    { e: '📌', n: '其他必要支出' },
  ],
  income: [
    { e: '💼', n: '薪資' },
    { e: '🎁', n: '獎金' },
    { e: '📋', n: '其他' },
  ],
} as const;

// CATS 保持舊介面相容（SettingsScreen、BillReminderModal 等使用）
export const CATS = {
  expense: [...CAT_GROUPS.daily, ...CAT_GROUPS.monthly, ...CAT_GROUPS.indep],
  income:  CAT_GROUPS.income,
} as const;

export function getCatIcon(cat: string): string {
  const norm = normalizeCategory(cat);
  return (
    [...CATS.expense, ...CATS.income].find(c => c.n === norm)?.e ??
    [...CATS.expense, ...CATS.income].find(c => c.n === cat)?.e ??
    '📋'
  );
}
