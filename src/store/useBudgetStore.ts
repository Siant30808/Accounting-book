import { create } from 'zustand';
import {
  Transaction, AppSettings, BgSettings, FabPosition,
  DEFAULT_SETTINGS, STORAGE_KEYS, Period,
} from '../types';
import { currentPeriod, getPeriod, getAllPeriods, inPeriod } from '../utils/period';

// ── MMKV 持久化儲存 ──
import { MMKV } from 'react-native-mmkv';
const storage = new MMKV();

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = storage.getString(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T): void {
  storage.set(key, JSON.stringify(value));
}

interface BudgetState {
  transactions: Transaction[];
  settings:     AppSettings;
  bgSettings:   BgSettings;
  fabPosition:  FabPosition | null;

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
}

// ── 初始資料 ──
const initTxs: Transaction[] = readJSON(STORAGE_KEYS.TRANSACTIONS, []);
const initSettings: AppSettings = {
  ...DEFAULT_SETTINGS,
  ...readJSON<Partial<AppSettings>>(STORAGE_KEYS.SETTINGS, {}),
};
initSettings.payday  = Math.min(28, Math.max(1, parseInt(String(initSettings.payday))  || 5));
initSettings.budget  = parseInt(String(initSettings.budget))   || 15000;
initSettings.savings = parseFloat(String(initSettings.savings)) || 0;
if (!initSettings.periodBalances) initSettings.periodBalances = {};

export const useBudgetStore = create<BudgetState>((set, get) => ({
  transactions: initTxs,
  settings:     initSettings,
  bgSettings:   readJSON(STORAGE_KEYS.BG_SETTINGS, { opacity: 100, fileUri: null }),
  fabPosition:  readJSON<FabPosition | null>(STORAGE_KEYS.FAB_POS, null),

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
      const isDup = existing.some(e => e.date === tx.date && e.cat === tx.cat && e.amount === tx.amount);
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

  // ── 自動跨期結算（支援跳期補算）──
  checkPeriodRollover: () => {
    try {
      const { settings, transactions } = get();
      const p         = currentPeriod(settings.payday);
      const lastStart = settings.lastPeriodStart;

      // 首次啟動：初始化週期記錄
      if (!lastStart) {
        get().saveSettings({ lastPeriodStart: p.startStr, lastPeriodEnd: p.endStr });
        return null;
      }

      // 同一週期：不需要任何動作
      if (lastStart === p.startStr) return null;

      // 跨週期（可能跨多期）：由舊到新逐期結算
      // getAllPeriods 已含當期；篩出 >= lastStart 且 < 當期 的所有待結算期
      const allP   = getAllPeriods(transactions.map(t => t.date), settings.payday)
                       .slice().reverse();                     // 由舊到新
      const missed = allP.filter(q => q.startStr >= lastStart && q.startStr < p.startStr);

      let runSavings   = settings.savings;
      const newBalances = { ...settings.periodBalances };

      for (const mp of missed) {
        newBalances[mp.startStr] = runSavings;                 // 鎖定該期月初
        const mpTxs  = transactions.filter(t => t.date >= mp.startStr && t.date <= mp.endStr);
        const mpInc  = mpTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const mpCash = mpTxs.filter(t => t.type === 'expense' && t.pay === '現金').reduce((s, t) => s + t.amount, 0);
        runSavings   = runSavings + (mpInc - mpCash);          // 本期月底 = 下期月初
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
}));
