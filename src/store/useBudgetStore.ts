import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Transaction, AppSettings, BgSettings, FabPosition, Bill, StockHolding,
  MonthlyCategoryBudgets, DEFAULT_SETTINGS, DEFAULT_MONTHLY_BUDGETS, STORAGE_KEYS, Period,
  getBillPaymentMode, periodKey,
} from '../types';
import { currentPeriod, getPeriod, getAllPeriods, inPeriod, getDueDateInPeriod, localDateStr } from '../utils/period';

// ── AsyncStorage 讀寫工具 ──
async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T): void {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}

// ── Store 型別 ──
interface BudgetState {
  transactions: Transaction[];
  settings:     AppSettings;
  bgSettings:   BgSettings;
  fabPosition:  FabPosition | null;
  bills:        Bill[];
  billDismissDate: string;
  stockHoldings: StockHolding[];
  hydrated:     boolean;

  addTransaction:     (tx: Omit<Transaction, 'id'>) => void;
  deleteTransaction:  (id: number) => void;
  importTransactions: (txs: Transaction[]) => void;
  clearAll:           () => void;

  saveSettings:    (partial: Partial<AppSettings>) => void;
  updateSavings:   (amount: number) => void;
  saveBgSettings:  (bg: BgSettings) => void;
  saveFabPosition: (pos: FabPosition) => void;

  getCurrentPeriod: () => Period;
  getAllPeriods:     () => Period[];
  getPeriodTxs:     (p: Period) => Transaction[];

  checkPeriodRollover: () => string | null;

  // ── 投資持股 ──
  addStockHolding:    (h: Omit<StockHolding, 'id' | 'updatedAt'>) => void;
  updateStockHolding: (id: number, patch: Partial<Omit<StockHolding, 'id' | 'updatedAt'>>) => void;
  deleteStockHolding: (id: number) => void;

  // ── 固定帳單 ──
  addBill:    (b: Omit<Bill, 'id' | 'paidPeriods'>) => void;
  updateBill: (id: number, partial: Partial<Omit<Bill, 'id' | 'paidPeriods'>>) => void;
  deleteBill: (id: number) => void;
  markBillPaid:       (id: number) => void;
  unmarkBillPaid:     (id: number) => void;
  setBillDismissDate: (date: string) => void;
  checkBillReminders: () => Bill[] | null;
}

const DEFAULT_BG: BgSettings = { opacity: 100, fileUri: null, textMode: 'dark' };

export const useBudgetStore = create<BudgetState>((set, get) => ({
  transactions:  [],
  settings:      { ...DEFAULT_SETTINGS },
  bgSettings:    DEFAULT_BG,
  fabPosition:   null,
  bills:         [],
  billDismissDate: '',
  stockHoldings: [],
  hydrated:      false,

  // ── 明細操作 ──
  addTransaction: (tx) => {
    const updated = [{ ...tx, id: Date.now() }, ...get().transactions];
    set({ transactions: updated });
    writeJSON(STORAGE_KEYS.TRANSACTIONS, updated);
  },

  deleteTransaction: (id) => {
    const updated = get().transactions.filter(t => t.id !== id);
    set({ transactions: updated });
    writeJSON(STORAGE_KEYS.TRANSACTIONS, updated);
  },

  importTransactions: (incoming) => {
    const existing = get().transactions;
    let added = 0;
    const merged = [...existing];
    incoming.forEach(tx => {
      const isDup = existing.some(
        e => e.date === tx.date && e.cat === tx.cat && e.amount === tx.amount,
      );
      if (!isDup) { merged.push({ ...tx, id: Date.now() + added }); added++; }
    });
    merged.sort((a, b) => b.date.localeCompare(a.date));
    set({ transactions: merged });
    writeJSON(STORAGE_KEYS.TRANSACTIONS, merged);
  },

  clearAll: () => {
    set({ transactions: [] });
    writeJSON(STORAGE_KEYS.TRANSACTIONS, []);
  },

  // ── 設定操作 ──
  saveSettings: (partial) => {
    const updated = { ...get().settings, ...partial };
    set({ settings: updated });
    writeJSON(STORAGE_KEYS.SETTINGS, updated);
  },

  updateSavings: (amount) => {
    const updated = { ...get().settings, savings: amount };
    set({ settings: updated });
    writeJSON(STORAGE_KEYS.SETTINGS, updated);
  },

  saveBgSettings: (bg) => {
    set({ bgSettings: bg });
    writeJSON(STORAGE_KEYS.BG_SETTINGS, bg);
  },

  saveFabPosition: (pos) => {
    set({ fabPosition: pos });
    writeJSON(STORAGE_KEYS.FAB_POS, pos);
  },

  // ── 週期工具 ──
  getCurrentPeriod: () => currentPeriod(get().settings.payday),

  getAllPeriods: () =>
    getAllPeriods(get().transactions.map(t => t.date), get().settings.payday),

  getPeriodTxs: (p) => get().transactions.filter(t => inPeriod(t.date, p)),

  // ── 自動跨期結算 ──
  checkPeriodRollover: () => {
    try {
      const { settings, transactions } = get();
      const p         = currentPeriod(settings.payday);
      const lastStart = settings.lastPeriodStart;

      if (!lastStart) {
        get().saveSettings({ lastPeriodStart: p.startStr, lastPeriodEnd: p.endStr });
        return null;
      }

      if (lastStart === p.startStr) return null;

      const allP   = getAllPeriods(transactions.map(t => t.date), settings.payday)
                       .slice().reverse();
      const missed = allP.filter(q => q.startStr >= lastStart && q.startStr < p.startStr);

      let runSavings    = settings.savings;
      const newBalances = { ...settings.periodBalances };

      for (const mp of missed) {
        newBalances[mp.startStr] = runSavings;
        const mpTxs  = transactions.filter(t => t.date >= mp.startStr && t.date <= mp.endStr);
        const mpInc  = mpTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const mpCash = mpTxs.filter(t => t.type === 'expense' && t.pay === '現金').reduce((s, t) => s + t.amount, 0);
        runSavings   = runSavings + (mpInc - mpCash);
      }

      get().saveSettings({
        savings:         runSavings,
        lastPeriodStart: p.startStr,
        lastPeriodEnd:   p.endStr,
        periodBalances:  newBalances,
      });

      const n = missed.length;
      return `🔄 已自動結算 ${n} 期，存款基準更新為 NT$${Math.round(runSavings).toLocaleString('zh-TW')}`;
    } catch {
      return null;
    }
  },

  // ── 投資持股操作 ──
  addStockHolding: (h) => {
    const updated = [...get().stockHoldings, { ...h, id: Date.now(), updatedAt: new Date().toISOString() }];
    set({ stockHoldings: updated });
    writeJSON(STORAGE_KEYS.STOCKS, updated);
  },

  updateStockHolding: (id, patch) => {
    const updated = get().stockHoldings.map(s =>
      s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s,
    );
    set({ stockHoldings: updated });
    writeJSON(STORAGE_KEYS.STOCKS, updated);
  },

  deleteStockHolding: (id) => {
    const updated = get().stockHoldings.filter(s => s.id !== id);
    set({ stockHoldings: updated });
    writeJSON(STORAGE_KEYS.STOCKS, updated);
  },

  // ── 固定帳單操作 ──
  addBill: (b) => {
    // 若新增時本期到期日已過，視為跳過本期，從下一期開始提醒
    const period   = currentPeriod(get().settings.payday);
    const due      = getDueDateInPeriod(b.dueDay, period);
    const todayStr = localDateStr(new Date());
    const paidPeriods = todayStr > localDateStr(due) ? [period.startStr] : [];

    const updated = [...get().bills, { ...b, id: Date.now(), paidPeriods }];
    set({ bills: updated });
    writeJSON(STORAGE_KEYS.BILLS, updated);
  },

  updateBill: (id, partial) => {
    const updated = get().bills.map(b => (b.id === id ? { ...b, ...partial } : b));
    set({ bills: updated });
    writeJSON(STORAGE_KEYS.BILLS, updated);
  },

  deleteBill: (id) => {
    const updated = get().bills.filter(b => b.id !== id);
    set({ bills: updated });
    writeJSON(STORAGE_KEYS.BILLS, updated);
  },

  markBillPaid: (id) => {
    const { bills, settings, transactions } = get();
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    const period = currentPeriod(settings.payday);
    const pKey   = periodKey(period.startStr);

    // 防重複：lastPaidPeriodKey 或 paidPeriods 任一已標記本期，直接跳過
    if (bill.lastPaidPeriodKey === pKey || bill.paidPeriods.includes(period.startStr)) return;

    // 防重複：檢查明細是否已有本期手動帳單記錄
    const alreadyTx = transactions.some(
      t => t.source === 'recurring-manual' &&
           t.recurringBillId === id &&
           t.date >= period.startStr && t.date <= period.endStr,
    );
    if (alreadyTx) {
      // 只更新標記，不重複新增明細
      const updated = get().bills.map(b =>
        b.id === id
          ? { ...b, paidPeriods: [...b.paidPeriods, period.startStr], lastPaidPeriodKey: pKey, paidAt: new Date().toISOString() }
          : b,
      );
      set({ bills: updated });
      writeJSON(STORAGE_KEYS.BILLS, updated);
      return;
    }

    const now = new Date();
    get().addTransaction({
      type:            'expense',
      cat:             bill.cat,
      amount:          bill.amount,
      date:            localDateStr(now),
      time:            `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      pay:             '現金',
      note:            `固定帳單：${bill.name}`,
      source:          'recurring-manual',
      recurringBillId: id,
    });

    const updated = get().bills.map(b =>
      b.id === id
        ? { ...b, paidPeriods: [...b.paidPeriods, period.startStr], lastPaidPeriodKey: pKey, paidAt: now.toISOString() }
        : b,
    );
    set({ bills: updated });
    writeJSON(STORAGE_KEYS.BILLS, updated);
  },

  unmarkBillPaid: (id) => {
    const { bills, settings, transactions } = get();
    const bill = bills.find(b => b.id === id);
    if (!bill) return;
    const period = currentPeriod(settings.payday);
    const pKey   = periodKey(period.startStr);
    if (!bill.paidPeriods.includes(period.startStr) && bill.lastPaidPeriodKey !== pKey) return;

    // 刪除本期手動帳單明細（source 或 note 兩種格式都處理）
    const manualTx = transactions.find(
      t => t.source === 'recurring-manual' && t.recurringBillId === id && inPeriod(t.date, period),
    );
    const fallbackTx = !manualTx
      ? transactions.find(t => t.note === `固定帳單：${bill.name}` && inPeriod(t.date, period))
      : null;
    const txToDel = manualTx ?? fallbackTx;
    if (txToDel) get().deleteTransaction(txToDel.id);

    const updated = bills.map(b =>
      b.id === id
        ? { ...b, paidPeriods: b.paidPeriods.filter(p => p !== period.startStr), lastPaidPeriodKey: undefined, paidAt: undefined }
        : b,
    );
    set({ bills: updated });
    writeJSON(STORAGE_KEYS.BILLS, updated);
  },

  setBillDismissDate: (date) => {
    set({ billDismissDate: date });
    writeJSON(STORAGE_KEYS.BILL_DISMISS, date);
  },

  // ── 帳單提醒檢查（App 開啟時呼叫）──
  checkBillReminders: () => {
    const { bills, settings, billDismissDate } = get();
    const period  = currentPeriod(settings.payday);
    const todayStr = localDateStr(new Date());

    // 自動扣繳：到期日當天自動帶入消費明細（paymentMode='auto' 或舊版 autoDeduct=true）
    let nextBills = bills;
    let changed = false;
    bills.forEach(b => {
      const isAuto = getBillPaymentMode(b) === 'auto';
      if (b.enabled === false) return;
      if (isAuto && !b.paidPeriods.includes(period.startStr)) {
        const due = getDueDateInPeriod(b.dueDay, period);
        if (todayStr >= localDateStr(due)) {
          const now = new Date();
          get().addTransaction({
            type:            'expense',
            cat:             b.cat,
            amount:          b.amount,
            date:            localDateStr(due),
            time:            `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
            pay:             '現金',
            note:            `固定帳單（自動扣繳）：${b.name}`,
            source:          'recurring-auto',
            recurringBillId: b.id,
          });
          nextBills = nextBills.map(x =>
            x.id === b.id ? { ...x, paidPeriods: [...x.paidPeriods, period.startStr] } : x,
          );
          changed = true;
        }
      }
    });
    if (changed) {
      set({ bills: nextBills });
      writeJSON(STORAGE_KEYS.BILLS, nextBills);
    }

    if (billDismissDate === todayStr) return null;

    const pKey = periodKey(period.startStr);

    // 手動繳費帳單：本期尚未繳費（lastPaidPeriodKey 或 paidPeriods 任一標記即視為已繳）
    const unpaid = nextBills.filter(b => {
      if (b.enabled === false) return false;
      if (getBillPaymentMode(b) !== 'manual') return false;
      const alreadyPaid = b.lastPaidPeriodKey === pKey || b.paidPeriods.includes(period.startStr);
      return !alreadyPaid;
    });
    return unpaid.length ? unpaid : null;
  },
}));

// ── 從 AsyncStorage 載入所有資料（App 啟動時呼叫一次）──
export async function hydrateStore(): Promise<void> {
  try {
    const [txRaw, setRaw, bgRaw, fabRaw, billRaw, dismissRaw, stockRaw] = await AsyncStorage.multiGet([
      STORAGE_KEYS.TRANSACTIONS,
      STORAGE_KEYS.SETTINGS,
      STORAGE_KEYS.BG_SETTINGS,
      STORAGE_KEYS.FAB_POS,
      STORAGE_KEYS.BILLS,
      STORAGE_KEYS.BILL_DISMISS,
      STORAGE_KEYS.STOCKS,
    ]);

    const txs        = txRaw[1]  ? JSON.parse(txRaw[1])  as Transaction[]        : [];
    const rawSetting = setRaw[1] ? JSON.parse(setRaw[1]) as Partial<AppSettings> : {};
    const bgRawParsed = bgRaw[1] ? JSON.parse(bgRaw[1]) as Partial<BgSettings> : {};
    const bgSettings: BgSettings = { ...DEFAULT_BG, ...bgRawParsed };
    const fabPosition = fabRaw[1] ? JSON.parse(fabRaw[1]) as FabPosition         : null;
    const bills          = billRaw[1]    ? JSON.parse(billRaw[1])    as Bill[]          : [];
    const billDismissDate = dismissRaw[1] ? JSON.parse(dismissRaw[1]) as string         : '';
    const stockHoldings  = stockRaw[1]   ? JSON.parse(stockRaw[1])   as StockHolding[] : [];

    // ── 向後相容遷移 ──
    const raw = rawSetting as Record<string, unknown>;

    // mealDailyLimit → mealPeriodBudget（30 天估算）
    let mealPeriodBudget = parseInt(String(raw.mealPeriodBudget ?? '')) || 0;
    if (!mealPeriodBudget) {
      const oldDaily = parseInt(String(raw.mealDailyLimit ?? '')) || 0;
      mealPeriodBudget = oldDaily ? oldDaily * 30 : DEFAULT_SETTINGS.mealPeriodBudget;
    }

    // budget（舊單一值）→ monthlyCategoryBudgets
    let monthlyCategoryBudgets = raw.monthlyCategoryBudgets as MonthlyCategoryBudgets | undefined;
    if (!monthlyCategoryBudgets || typeof monthlyCategoryBudgets !== 'object') {
      const oldBudget = parseInt(String(raw.budget ?? '')) || 15000;
      monthlyCategoryBudgets = {
        食材採購: Math.round(oldBudget * 0.5),
        日用品:   Math.round(oldBudget * 0.2),
        娛樂:     Math.round(oldBudget * 0.3),
      };
    }
    // 確保三個欄位都有值
    monthlyCategoryBudgets = {
      ...DEFAULT_MONTHLY_BUDGETS,
      ...monthlyCategoryBudgets,
    };

    const settings: AppSettings = { ...DEFAULT_SETTINGS, ...rawSetting, mealPeriodBudget, monthlyCategoryBudgets };
    settings.payday  = Math.min(28, Math.max(1, parseInt(String(settings.payday)) || 5));
    settings.savings = parseFloat(String(settings.savings)) || 0;
    if (!settings.periodBalances) settings.periodBalances = {};

    useBudgetStore.setState({
      transactions: txs,
      settings,
      bgSettings,
      fabPosition,
      bills,
      billDismissDate,
      stockHoldings,
      hydrated: true,
    });
  } catch {
    useBudgetStore.setState({ hydrated: true });
  }
}
