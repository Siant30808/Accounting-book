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

// ── 交易所休市日 ──
export interface MarketHoliday {
  date:    string;             // YYYY-MM-DD
  name?:   string;
  source:  'remote' | 'manual';
}

// ── App 全域設定（持久化）──
export interface AppSettings {
  username:               string;
  payday:                 number;
  mealPeriodBudget:       number;
  monthlyCategoryBudgets: MonthlyCategoryBudgets;
  savings:                number;
  lastPeriodStart:        string;
  lastPeriodEnd:          string;
  periodBalances:         Record<string, number>;
  /** 休市日資料（遠端或手動新增）*/
  marketHolidays?:         MarketHoliday[];
  /** 最後更新休市日的時間（ISO string）*/
  marketHolidayUpdatedAt?: string;
  /** 已下載的休市日所屬年度 */
  marketHolidayYear?:      number;
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
  /**
   * fixedDate 時：每月扣款日
   * tPlusBusinessDays 時：每月交易 / 執行日（實際扣款 = 執行日 + T+N 營業日）
   */
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
  /** 帳單是否啟用（預設 true，false 時不觸發提醒也不自動記帳）*/
  enabled?:           boolean;
  /** 扣款日期規則：固定日期 or T+N 營業日交割（投資類），預設 fixedDate */
  paymentRule?:       'fixedDate' | 'tPlusBusinessDays';
  /** T+N 交割天數（tPlusBusinessDays 用），預設 2 */
  settlementBusinessDays?: number;
  /** 到期日前幾天開始提醒，預設 3 */
  remindDaysBefore?:  number;
  /** 備註 */
  note?:              string;
}

/** 由 period.startStr（YYYY-MM-DD）產生月份 key（YYYY-MM）*/
export function periodKey(startStr: string): string {
  return startStr.substring(0, 7);
}

/** 取得固定帳單的有效付款方式（相容舊資料）*/
export function getBillPaymentMode(bill: Bill): 'manual' | 'auto' {
  return bill.paymentMode ?? (bill.autoDeduct ? 'auto' : 'manual');
}

export type BillStatus = 'disabled' | 'paid' | 'auto' | 'upcoming' | 'dueToday' | 'overdue' | 'normal';

/** 帳單提前提醒預設天數 */
export const BILL_REMIND_DAYS = 3;

// ── 日期計算 helpers ──────────────────────────────────────────

// 內部用，避免與 utils/period 循環引用
function _fmtDate(d: Date): string {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

export function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

/** 是否為營業日（排除週六、週日及 holidays 中的休市日）*/
export function isBusinessDay(date: Date, holidays: MarketHoliday[] = []): boolean {
  if (isWeekend(date)) return false;
  const ds = _fmtDate(date);
  return !holidays.some(h => h.date === ds);
}

/** 從 start 往後數 days 個營業日（排除週六、週日及 holidays）*/
export function addBusinessDays(start: Date, days: number, holidays: MarketHoliday[] = []): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (isBusinessDay(d, holidays)) added += 1;
  }
  return d;
}

/** 計算固定帳單在本期的繳費狀態（dueDate 由 getBillDueDate 計算後傳入）*/
export function getBillStatus(
  bill: Bill,
  todayStr: string,       // YYYY-MM-DD
  periodStartStr: string, // YYYY-MM-DD
  dueDate: Date,          // 實際扣款日（已含 T+N 計算）
): BillStatus {
  if (bill.enabled === false) return 'disabled';
  const pKey       = periodKey(periodStartStr);
  const isPaid     = bill.lastPaidPeriodKey === pKey || bill.paidPeriods.includes(periodStartStr);
  const mode       = getBillPaymentMode(bill);
  if (isPaid)          return 'paid';
  if (mode === 'auto') return 'auto';
  const diffDays   = Math.round((dueDate.getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000);
  const remindDays = bill.remindDaysBefore ?? BILL_REMIND_DAYS;
  if (diffDays < 0)          return 'overdue';
  if (diffDays === 0)        return 'dueToday';
  if (diffDays <= remindDays) return 'upcoming';
  return 'normal';
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
