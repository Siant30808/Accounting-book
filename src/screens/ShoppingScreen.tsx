import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, SafeAreaView, KeyboardAvoidingView, Platform,
  StatusBar, Modal, TouchableOpacity, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassCard } from '../components/GlassCard';
import { useBudgetStore } from '../store/useBudgetStore';
import { colors } from '../theme';
import { localDateStr } from '../utils/period';

const STORAGE_KEY          = '@shopping_items_v2';
const FREQUENT_STORAGE_KEY = '@shopping_frequent_items';

// ── 分類定義 ──
const CATS = [
  { id: 'meal',          label: '餐費',   icon: '🍱', txCat: '餐費',       color: '#DB4F91', gradBot: 'rgba(219,79,145,0.12)'  },
  { id: 'groceries',     label: '食材採購', icon: '🥬', txCat: '食材採購',   color: '#10B981', gradBot: 'rgba(16,185,129,0.12)'  },
  { id: 'daily',         label: '日用品', icon: '🧻', txCat: '日用品',     color: '#0284C7', gradBot: 'rgba(2,132,199,0.12)'   },
  { id: 'entertainment', label: '娛樂',   icon: '🎮', txCat: '娛樂',       color: '#8B5CF6', gradBot: 'rgba(139,92,246,0.12)'  },
  { id: 'clothes',       label: '服飾',   icon: '👕', txCat: '日用品',     color: '#64748B', gradBot: 'rgba(100,116,139,0.12)' },
  { id: 'necessary',     label: '必要支出', icon: '🧾', txCat: '其他必要支出', color: '#F59E0B', gradBot: 'rgba(245,158,11,0.12)'  },
] as const;

function getTxCatFromShoppingCat(cat: string, label?: string): string {
  if (label === '餐飲' || label === '飲料') return '餐費';
  if (label === '日用品') return '日用品';
  if (label === '服飾') return '日用品';
  if (label === '其他') return '其他必要支出';
  const found = CATS.find(c => c.id === cat);
  return found?.txCat ?? '其他必要支出';
}

type CatId  = typeof CATS[number]['id'];
type BuyerT = '我自己' | '家人';
const BUYERS: BuyerT[] = ['我自己', '家人'];

// ── 資料型別 ──
interface ShoppingItem {
  id:      number;
  cat:     CatId;
  txCat:   string;
  icon:    string;
  color:   string;
  label:   string;
  note:    string;
  amount?: number;
  buyer:   BuyerT;
  checked: boolean;
}

interface FrequentItem {
  id:             string;
  name:           string;
  cat:            CatId;
  txCat:          string;
  buyer?:         BuyerT;
  defaultAmount?: number;
  useCount:       number;
  lastUsedAt?:    string;
  userPinned:     boolean;
}

// ── 簡易下拉選單 ──
function Dropdown({ value, options, onChange }: {
  value: string; options: string[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable style={sty.dropBtn} onPress={() => setOpen(true)}>
        <Text style={sty.dropValue}>{value}</Text>
        <Feather name="chevron-down" size={14} color="#94A3B8" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={sty.dropOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={sty.dropMenu}>
            {options.map(opt => (
              <Pressable
                key={opt}
                style={[sty.dropItem, opt === value && sty.dropItemActive]}
                onPress={() => { onChange(opt); setOpen(false); }}
              >
                <Text style={[sty.dropItemText, opt === value && sty.dropItemTextActive]}>
                  {opt}
                </Text>
                {opt === value && <Feather name="check" size={14} color="#8B5CF6" />}
              </Pressable>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── 分組計算輔助 ──
interface TxGroup {
  txCat:  string;
  amount: number;
  note:   string;
  count:  number;
}

function buildTxGroups(items: ShoppingItem[]): TxGroup[] {
  const validItems = items.filter(i => i.amount && i.amount > 0);
  const groups: Record<string, ShoppingItem[]> = {};
  validItems.forEach(item => {
    const key = item.txCat || getTxCatFromShoppingCat(item.cat, item.label);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  return Object.entries(groups).map(([txCat, groupItems]) => {
    const names = groupItems.map(i => i.note).filter(Boolean);
    const note  = names.length <= 4
      ? names.join('、')
      : `${names.slice(0, 4).join('、')} 等 ${names.length} 項`;
    return {
      txCat,
      amount: groupItems.reduce((s, i) => s + (i.amount ?? 0), 0),
      note,
      count:  groupItems.length,
    };
  });
}

// ── 轉成記帳預覽 Modal ──
type PayT = '現金' | '信用卡';
const PAY_OPTIONS: PayT[] = ['現金', '信用卡'];

interface CommitPreviewModalProps {
  visible:     boolean;
  groups:      TxGroup[];
  pay:         PayT;
  onChangePay: (p: PayT) => void;
  onConfirm:   () => void;
  onClose:     () => void;
}

function CommitPreviewModal({
  visible, groups, pay, onChangePay, onConfirm, onClose,
}: CommitPreviewModalProps) {
  const total = groups.reduce((s, g) => s + g.amount, 0);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={sty.modalOverlay} onPress={onClose} />
      <View style={sty.modalSheet}>
        <View style={sty.modalHandle} />

        <View style={sty.modalHeader}>
          <Feather name="check-square" size={18} color="#10B981" />
          <Text style={sty.modalTitle}>轉成記帳</Text>
          <Pressable onPress={onClose} hitSlop={10} style={{ marginLeft: 'auto' }}>
            <Feather name="x" size={20} color="#94A3B8" />
          </Pressable>
        </View>

        <Text style={sty.commitPreviewSub}>
          將建立 {groups.length} 筆記帳，合計 NT${total.toLocaleString('zh-TW')}
        </Text>

        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 260 }}>
          {groups.map(g => (
            <View key={g.txCat} style={sty.commitGroupRow}>
              <View style={sty.commitGroupLeft}>
                <Text style={sty.commitGroupCat}>{g.txCat}</Text>
                <Text style={sty.commitGroupNote} numberOfLines={2}>{g.note}</Text>
              </View>
              <Text style={sty.commitGroupAmt}>NT${g.amount.toLocaleString('zh-TW')}</Text>
            </View>
          ))}
        </ScrollView>

        {/* 付款方式 */}
        <View style={sty.commitPayWrap}>
          <Text style={sty.commitPayLabel}>付款方式</Text>
          <View style={sty.commitPayRow}>
            {PAY_OPTIONS.map(p => (
              <Pressable
                key={p}
                style={[sty.commitPayChip, pay === p && sty.commitPayChipActive]}
                onPress={() => onChangePay(p)}
              >
                <Text style={[sty.commitPayChipText, pay === p && { color: '#fff' }]}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 按鈕列 */}
        <View style={sty.commitFooter}>
          <Pressable style={sty.commitCancelBtn} onPress={onClose}>
            <Text style={sty.commitCancelText}>取消</Text>
          </Pressable>
          <Pressable style={sty.commitConfirmBtn} onPress={onConfirm}>
            <Feather name="check" size={16} color="#fff" />
            <Text style={sty.commitConfirmText}>確認記帳</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── 編輯常買品項 Modal ──
interface EditFrequentModalProps {
  visible:        boolean;
  items:          FrequentItem[];
  onClose:        () => void;
  onAdd:          (item: Omit<FrequentItem, 'id' | 'useCount' | 'lastUsedAt'>) => void;
  onDelete:       (id: string) => void;
  onTogglePin:    (id: string) => void;
}

function EditFrequentModal({
  visible, items, onClose, onAdd, onDelete, onTogglePin,
}: EditFrequentModalProps) {
  const [newName,   setNewName]   = useState('');
  const [newCat,    setNewCat]    = useState<CatId>('meal');
  const [newBuyer,  setNewBuyer]  = useState<BuyerT | ''>('');
  const [newAmt,    setNewAmt]    = useState('');

  const reset = () => { setNewName(''); setNewCat('meal'); setNewBuyer(''); setNewAmt(''); };

  const handleAdd = () => {
    const n = newName.trim();
    if (!n) return;
    const parsedAmt = parseFloat(newAmt);
    const txCat = CATS.find(c => c.id === newCat)?.txCat ?? '其他必要支出';
    onAdd({
      name:          n,
      cat:           newCat,
      txCat,
      buyer:         newBuyer || undefined,
      defaultAmount: (!isNaN(parsedAmt) && parsedAmt > 0) ? parsedAmt : undefined,
      userPinned:    true,
    });
    reset();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={sty.modalOverlay} onPress={onClose} />
      <View style={sty.modalSheet}>
        <View style={sty.modalHandle} />

        {/* 標題 */}
        <View style={sty.modalHeader}>
          <Feather name="star" size={18} color="#8B5CF6" />
          <Text style={sty.modalTitle}>編輯常買品項</Text>
          <Pressable onPress={onClose} hitSlop={10} style={{ marginLeft: 'auto' }}>
            <Feather name="x" size={20} color="#94A3B8" />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 新增表單 */}
          <GlassCard
            style={sty.modalAddCard}
            colorTop="rgba(248,250,252,0.92)"
            borderRadius={20}
          >
            <Text style={sty.modalSectionLabel}>新增品項</Text>

            <TextInput
              style={sty.modalInput}
              placeholder="品項名稱，例如 牛奶"
              placeholderTextColor="#CBD5E1"
              value={newName}
              onChangeText={setNewName}
            />

            {/* 分類選擇 */}
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 6 }}
            >
              {CATS.map(cat => (
                <Pressable
                  key={cat.id}
                  onPress={() => setNewCat(cat.id)}
                  style={[sty.modalCatChip, newCat === cat.id && sty.modalCatChipActive]}
                >
                  <Text style={{ fontSize: 13 }}>{cat.icon}</Text>
                  <Text style={[sty.modalCatLabel, newCat === cat.id && { color: '#8B5CF6' }]}>
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* 買給誰 + 預設金額 */}
            <View style={sty.modalRowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={sty.modalFieldLabel}>買給（可選）</Text>
                <Dropdown
                  value={newBuyer || '不指定'}
                  options={['不指定', ...BUYERS]}
                  onChange={v => setNewBuyer(v === '不指定' ? '' : v as BuyerT)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sty.modalFieldLabel}>預設金額（可選）</Text>
                <TextInput
                  style={sty.modalAmtInput}
                  placeholder="NT$"
                  placeholderTextColor="#CBD5E1"
                  keyboardType="decimal-pad"
                  value={newAmt}
                  onChangeText={setNewAmt}
                />
              </View>
            </View>

            <Pressable
              style={[sty.modalAddBtn, !newName.trim() && { opacity: 0.45 }]}
              onPress={handleAdd}
              disabled={!newName.trim()}
            >
              <Feather name="plus" size={16} color="#fff" />
              <Text style={sty.modalAddBtnText}>新增</Text>
            </Pressable>
          </GlassCard>

          {/* 現有品項列表 */}
          {items.length > 0 && (
            <>
              <Text style={sty.modalSectionTitle}>已儲存品項</Text>
              {items.map(fi => {
                const cat = CATS.find(c => c.id === fi.cat);
                return (
                  <View key={fi.id} style={sty.modalFreqRow}>
                    <View style={[sty.modalFreqIcon, { backgroundColor: (cat?.color ?? '#94A3B8') + '22' }]}>
                      <Text style={{ fontSize: 15 }}>{cat?.icon ?? '🛍️'}</Text>
                    </View>
                    <View style={sty.modalFreqInfo}>
                      <Text style={sty.modalFreqName}>{fi.name}</Text>
                      <Text style={sty.modalFreqMeta}>
                        {cat?.label}
                        {fi.buyer ? `・${fi.buyer}` : ''}
                        {fi.defaultAmount ? `・NT$${fi.defaultAmount}` : ''}
                        {fi.useCount > 0 ? `・${fi.useCount}次` : ''}
                      </Text>
                    </View>
                    {/* 釘選 */}
                    <Pressable onPress={() => onTogglePin(fi.id)} hitSlop={8} style={sty.modalFreqAction}>
                      <Feather
                        name="star"
                        size={17}
                        color={fi.userPinned ? '#F59E0B' : '#CBD5E1'}
                      />
                    </Pressable>
                    {/* 刪除 */}
                    <Pressable onPress={() => onDelete(fi.id)} hitSlop={8} style={sty.modalFreqAction}>
                      <Feather name="trash-2" size={16} color="rgba(219,79,145,0.55)" />
                    </Pressable>
                  </View>
                );
              })}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── 主畫面 ──
export function ShoppingScreen() {
  const addTransaction = useBudgetStore(s => s.addTransaction);

  const [selectedCatId, setSelectedCatId] = useState<CatId>('meal');
  const [note,    setNote]    = useState('');
  const [amount,  setAmount]  = useState('');
  const [buyer,   setBuyer]   = useState<BuyerT>('我自己');
  const [items,   setItems]   = useState<ShoppingItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [frequentItems,    setFrequentItems]    = useState<FrequentItem[]>([]);
  const [showEditFrequent, setShowEditFrequent] = useState(false);
  const [showCommitModal,  setShowCommitModal]  = useState(false);
  const [commitGroups,     setCommitGroups]     = useState<TxGroup[]>([]);
  const [shoppingPay,      setShoppingPay]      = useState<PayT>('現金');

  const itemsLoaded    = useRef(false);
  const frequentLoaded = useRef(false);
  const noteRef = useRef<TextInput>(null);

  // ── AsyncStorage 載入 ──
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as ShoppingItem[];
          setItems(parsed.map(i => ({
            ...i,
            checked: i.checked ?? false,
            amount:  (i.amount === 0 || i.amount === undefined) ? undefined : i.amount,
            txCat:   i.txCat ?? getTxCatFromShoppingCat(i.cat, i.label),
          })));
        } catch {}
      }
      itemsLoaded.current = true;
    });

    AsyncStorage.getItem(FREQUENT_STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as FrequentItem[];
          setFrequentItems(parsed.map(fi => ({
            ...fi,
            txCat: fi.txCat ?? getTxCatFromShoppingCat(fi.cat),
          })));
        } catch {}
      }
      frequentLoaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!itemsLoaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items]);

  useEffect(() => {
    if (!frequentLoaded.current) return;
    AsyncStorage.setItem(FREQUENT_STORAGE_KEY, JSON.stringify(frequentItems)).catch(() => {});
  }, [frequentItems]);

  // ── 自動更新常買品項 ──
  const updateFrequentItem = useCallback((params: {
    name: string; cat: CatId; buyer: BuyerT; amount?: number;
  }) => {
    const { name, cat, buyer: b, amount: amt } = params;
    const key = name.trim().toLowerCase();
    if (!key) return;

    const txCat = CATS.find(c => c.id === cat)?.txCat ?? '其他必要支出';
    setFrequentItems(prev => {
      const idx = prev.findIndex(i => i.name.trim().toLowerCase() === key);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          useCount:   updated[idx].useCount + 1,
          lastUsedAt: new Date().toISOString(),
          cat,
          txCat,
          buyer: b,
          ...(amt !== undefined && { defaultAmount: amt }),
        };
        return updated;
      }
      return [...prev, {
        id:            `auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name:          name.trim(),
        cat,
        txCat,
        buyer:         b,
        defaultAmount: amt,
        useCount:      1,
        lastUsedAt:    new Date().toISOString(),
        userPinned:    false,
      }];
    });
  }, []);

  // ── 可見常買品項（userPinned 或 useCount >= 2，最多 10 個） ──
  const visibleFrequentItems = frequentItems
    .filter(i => i.userPinned || i.useCount >= 2)
    .sort((a, b) => {
      if (a.userPinned !== b.userPinned) return a.userPinned ? -1 : 1;
      if (b.useCount !== a.useCount) return b.useCount - a.useCount;
      return new Date(b.lastUsedAt ?? 0).getTime() - new Date(a.lastUsedAt ?? 0).getTime();
    })
    .slice(0, 10);

  const selectedCat = CATS.find(c => c.id === selectedCatId)!;
  const parsedAmt   = parseFloat(amount);
  const hasAmt      = !isNaN(parsedAmt) && parsedAmt > 0;
  const hasNote     = note.trim().length > 0;
  const isEditing   = editingId !== null;

  const totalAll   = items.reduce((s, i) => s + (i.amount ?? 0), 0);
  const noAmtCount = items.filter(i => !i.amount).length;

  const resetForm = useCallback(() => {
    setNote('');
    setAmount('');
    setBuyer('我自己');
    setEditingId(null);
  }, []);

  // ── 加入 / 更新項目 ──
  const handleAdd = useCallback(() => {
    if (!hasNote) return;

    if (isEditing) {
      setItems(prev => prev.map(i => i.id === editingId ? {
        ...i,
        cat:    selectedCat.id,
        txCat:  selectedCat.txCat,
        icon:   selectedCat.icon,
        color:  selectedCat.color,
        label:  selectedCat.label,
        note:   note.trim(),
        amount: hasAmt ? parsedAmt : undefined,
        buyer,
      } : i));
      resetForm();
      return;
    }

    setItems(prev => [...prev, {
      id:      Date.now(),
      cat:     selectedCat.id,
      txCat:   selectedCat.txCat,
      icon:    selectedCat.icon,
      color:   selectedCat.color,
      label:   selectedCat.label,
      note:    note.trim(),
      amount:  hasAmt ? parsedAmt : undefined,
      buyer,
      checked: false,
    }]);

    updateFrequentItem({
      name:   note.trim(),
      cat:    selectedCat.id,
      buyer,
      amount: hasAmt ? parsedAmt : undefined,
    });

    setNote('');
    setAmount('');
  }, [hasNote, isEditing, editingId, selectedCat, note, parsedAmt, hasAmt, buyer, resetForm, updateFrequentItem]);

  // ── 點常買 chip 填入 ──
  const handleFrequentChip = useCallback((fi: FrequentItem) => {
    setNote(fi.name);
    setSelectedCatId(fi.cat);
    if (fi.buyer) setBuyer(fi.buyer);
    if (!amount && fi.defaultAmount !== undefined) {
      setAmount(String(fi.defaultAmount));
    }
    noteRef.current?.focus();
  }, [amount]);

  // ── 點清單項目進入編輯 ──
  const handleEdit = useCallback((item: ShoppingItem) => {
    setEditingId(item.id);
    setSelectedCatId(item.cat);
    setNote(item.note);
    setAmount(item.amount ? String(item.amount) : '');
    setBuyer(item.buyer);
    noteRef.current?.focus();
  }, []);

  const toggleCheck = useCallback((id: number) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  }, []);

  const handleDelete = useCallback((id: number) => {
    setItems(prev => prev.filter(i => i.id !== id));
    if (editingId === id) resetForm();
  }, [editingId, resetForm]);

  const handleClearAll = useCallback(() => {
    setItems([]);
    resetForm();
  }, [resetForm]);

  // ── 常買品項管理 handlers ──
  const handleFrequentAdd = useCallback((
    item: Omit<FrequentItem, 'id' | 'useCount' | 'lastUsedAt'>,
  ) => {
    setFrequentItems(prev => {
      const key = item.name.trim().toLowerCase();
      const exists = prev.findIndex(i => i.name.trim().toLowerCase() === key);
      if (exists >= 0) {
        const updated = [...prev];
        updated[exists] = { ...updated[exists], ...item, userPinned: true };
        return updated;
      }
      return [...prev, {
        ...item,
        id:         `pin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        useCount:   0,
        lastUsedAt: new Date().toISOString(),
      }];
    });
  }, []);

  const handleFrequentDelete = useCallback((id: string) => {
    setFrequentItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const handleFrequentTogglePin = useCallback((id: string) => {
    setFrequentItems(prev => prev.map(i => i.id === id ? { ...i, userPinned: !i.userPinned } : i));
  }, []);

  // ── 轉成記帳：開預覽 Modal ──
  const handleCommit = useCallback(() => {
    const groups = buildTxGroups(items);
    if (groups.length === 0) return;
    setCommitGroups(groups);
    setShowCommitModal(true);
  }, [items]);

  // ── 確認後實際新增記帳 ──
  const handleCommitConfirm = useCallback(() => {
    const now = new Date();
    const hh  = String(now.getHours()).padStart(2, '0');
    const mm  = String(now.getMinutes()).padStart(2, '0');
    const date = localDateStr(now);
    const time  = `${hh}:${mm}`;

    commitGroups.forEach(group => {
      addTransaction({
        type:   'expense',
        amount: group.amount,
        cat:    group.txCat,
        pay:    shoppingPay,
        note:   group.note || `購物清單 ${group.count} 項`,
        date,
        time,
      });
    });

    setShowCommitModal(false);

    const total = commitGroups.reduce((s, g) => s + g.amount, 0);
    Alert.alert(
      '已轉成記帳 ✅',
      `已建立 ${commitGroups.length} 筆記帳，合計 NT$${total.toLocaleString('zh-TW')}。\n要清空購物清單嗎？`,
      [
        { text: '保留清單', style: 'cancel' },
        { text: '清空', style: 'destructive', onPress: handleClearAll },
      ],
    );
  }, [commitGroups, shoppingPay, addTransaction, handleClearAll]);

  return (
    <SafeAreaView style={sty.root}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={sty.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ── */}
          <View style={sty.header}>
            <View>
              <Text style={sty.headerSub}>採購暫存清單</Text>
              <Text style={sty.headerTitle}>今日購物 🛍️</Text>
            </View>
            {items.length > 0 && (
              <Pressable onPress={handleClearAll} style={sty.clearAllBtn}>
                <Feather name="trash-2" size={15} color="#DB4F91" />
                <Text style={sty.clearAllText}>清空清單</Text>
              </Pressable>
            )}
          </View>

          {/* ── 輸入卡片 ── */}
          <GlassCard
            style={sty.inputCard}
            colorTop="rgba(255,255,255,0.76)"
            colorBot="rgba(248,250,252,0.35)"
            borderRadius={24}
          >
            <Text style={sty.fieldLabel}>品項名稱</Text>
            <TextInput
              ref={noteRef}
              style={sty.noteInput}
              placeholder="買了什麼？例如 牛奶、雞蛋、衛生紙"
              placeholderTextColor="#CBD5E1"
              value={note}
              onChangeText={setNote}
              returnKeyType="next"
            />

            <View style={sty.divider} />

            <Text style={sty.fieldLabel}>金額（可稍後填）</Text>
            <View style={sty.amtRow}>
              <Text style={sty.currency}>NT$</Text>
              <TextInput
                style={sty.amtInput}
                placeholder="0"
                placeholderTextColor="#CBD5E1"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                returnKeyType="done"
                onSubmitEditing={handleAdd}
              />
              {amount !== '' && (
                <Pressable onPress={() => setAmount('')} hitSlop={8}>
                  <Feather name="x-circle" size={18} color="#CBD5E1" />
                </Pressable>
              )}
            </View>
          </GlassCard>

          {/* ── 常買品項 chips ── */}
          <View style={sty.freqHeader}>
            <Text style={sty.sectionTitle}>常買品項</Text>
            <Pressable
              style={sty.freqEditBtn}
              onPress={() => setShowEditFrequent(true)}
            >
              <Feather name="settings" size={13} color="#8B5CF6" />
              <Text style={sty.freqEditText}>管理</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={sty.freqScroll}
            contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
          >
            {visibleFrequentItems.length === 0 ? (
              <Pressable style={sty.freqEmptyChip} onPress={() => setShowEditFrequent(true)}>
                <Feather name="plus" size={13} color="#8B5CF6" />
                <Text style={sty.freqEditChipText}>新增常買品項</Text>
              </Pressable>
            ) : (
              <>
                {visibleFrequentItems.map(fi => {
                  const cat = CATS.find(c => c.id === fi.cat);
                  return (
                    <Pressable key={fi.id} style={sty.freqChip} onPress={() => handleFrequentChip(fi)}>
                      <Text style={{ fontSize: 14 }}>{cat?.icon ?? '🛍️'}</Text>
                      <Text style={sty.freqChipText}>{fi.name}</Text>
                      {fi.userPinned && (
                        <Feather name="star" size={11} color="#F59E0B" />
                      )}
                    </Pressable>
                  );
                })}
                <Pressable style={sty.freqEditChip} onPress={() => setShowEditFrequent(true)}>
                  <Feather name="edit-2" size={13} color="#8B5CF6" />
                  <Text style={sty.freqEditChipText}>編輯</Text>
                </Pressable>
              </>
            )}
          </ScrollView>

          {/* ── 分類 chips ── */}
          <Text style={sty.sectionTitle}>分類</Text>
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={sty.catScroll}
            contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}
          >
            {CATS.map(cat => {
              const active = cat.id === selectedCatId;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setSelectedCatId(cat.id)}
                  style={[sty.catChip, active && sty.catChipActive]}
                >
                  <Text style={sty.catIcon}>{cat.icon}</Text>
                  <Text style={[sty.catLabel, active && { color: '#8B5CF6' }]}>{cat.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* ── 買給誰 ── */}
          <View style={sty.buyerWrap}>
            <Feather name="user" size={14} color="#94A3B8" />
            <Text style={sty.buyerLabel}>買給</Text>
            <Dropdown value={buyer} options={BUYERS} onChange={v => setBuyer(v as BuyerT)} />
          </View>

          {/* ── 加入 / 更新按鈕 ── */}
          <View style={sty.addBtnWrap}>
            <Pressable
              style={[sty.addBtn, { backgroundColor: hasNote ? '#8B5CF6' : 'rgba(148,163,184,0.45)' }]}
              onPress={handleAdd}
              disabled={!hasNote}
            >
              <Feather name={isEditing ? 'refresh-cw' : 'plus-circle'} size={18} color="#fff" />
              <Text style={sty.addBtnText}>
                {isEditing
                  ? '更新項目'
                  : hasAmt
                    ? `加入清單  NT$${parsedAmt.toLocaleString('zh-TW')}`
                    : '加入清單'}
              </Text>
            </Pressable>
            {isEditing && (
              <Pressable style={sty.cancelEditBtn} onPress={resetForm}>
                <Text style={sty.cancelEditText}>取消編輯</Text>
              </Pressable>
            )}
          </View>

          {/* ── 購物清單 ── */}
          {items.length > 0 && (
            <>
              <View style={sty.listHeader}>
                <Text style={sty.sectionTitle}>購物清單</Text>
                <Text style={sty.itemCount}>{items.length} 項</Text>
              </View>

              {items.map(item => (
                <Pressable key={item.id} onPress={() => handleEdit(item)}>
                  <GlassCard
                    style={[sty.listItem, item.checked && sty.listItemChecked]}
                    borderRadius={20}
                    colorTop={item.checked ? 'rgba(248,250,252,0.60)' : 'rgba(255,255,255,0.74)'}
                  >
                    <Pressable
                      onPress={e => { e.stopPropagation?.(); toggleCheck(item.id); }}
                      hitSlop={8}
                      style={[sty.checkbox, item.checked && sty.checkboxChecked]}
                    >
                      {item.checked && <Feather name="check" size={13} color="#fff" />}
                    </Pressable>

                    <View style={[sty.listIconBox, { backgroundColor: item.color + '22' }]}>
                      <Text style={{ fontSize: 17 }}>{item.icon}</Text>
                    </View>

                    <View style={sty.listInfo}>
                      <Text style={[sty.listNote, item.checked && sty.listNoteChecked]}>
                        {item.note}
                      </Text>
                      <Text style={[sty.listCat, { color: item.color }]}>
                        {item.label}{item.buyer ? `・${item.buyer}` : ''}
                      </Text>
                    </View>

                    <Text style={[sty.listAmt, !item.amount && sty.listAmtEmpty]}>
                      {item.amount ? `NT$${item.amount.toLocaleString('zh-TW')}` : '未填金額'}
                    </Text>

                    <Pressable
                      onPress={e => { e.stopPropagation?.(); handleDelete(item.id); }}
                      hitSlop={10}
                      style={sty.delBtn}
                    >
                      <Feather name="x" size={16} color="rgba(100,116,139,0.45)" />
                    </Pressable>
                  </GlassCard>
                </Pressable>
              ))}

              {/* ── 合計卡 ── */}
              <GlassCard
                style={sty.totalCard}
                borderRadius={22}
                colorTop="rgba(255,255,255,0.76)"
                colorBot="rgba(248,250,252,0.35)"
              >
                <View>
                  <Text style={sty.totalLabel}>本次合計</Text>
                  {noAmtCount > 0 && (
                    <Text style={sty.totalSub}>未填金額：{noAmtCount} 項</Text>
                  )}
                </View>
                <Text style={sty.totalAmt}>NT${totalAll.toLocaleString('zh-TW')}</Text>
              </GlassCard>

              {/* ── 轉成記帳 ── */}
              <View style={sty.commitWrap}>
                <Pressable
                  style={[sty.commitBtn, totalAll <= 0 && sty.commitBtnDisabled]}
                  onPress={handleCommit}
                  disabled={totalAll <= 0}
                >
                  <Feather name="check-square" size={18} color="#fff" />
                  <Text style={sty.commitBtnText}>轉成記帳</Text>
                </Pressable>
              </View>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── 轉成記帳預覽 Modal ── */}
      <CommitPreviewModal
        visible={showCommitModal}
        groups={commitGroups}
        pay={shoppingPay}
        onChangePay={setShoppingPay}
        onConfirm={handleCommitConfirm}
        onClose={() => setShowCommitModal(false)}
      />

      {/* ── 編輯常買品項 Modal ── */}
      <EditFrequentModal
        visible={showEditFrequent}
        items={frequentItems}
        onClose={() => setShowEditFrequent(false)}
        onAdd={handleFrequentAdd}
        onDelete={handleFrequentDelete}
        onTogglePin={handleFrequentTogglePin}
      />
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const sty = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.appBg },
  scroll: { paddingBottom: 24 },

  // Header
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'flex-end',
    paddingHorizontal: 24,
    paddingTop:        24,
    paddingBottom:     16,
  },
  headerSub:   { fontSize: 14, fontWeight: '600', color: '#94A3B8', marginBottom: 4 },
  headerTitle: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: '#1E293B' },

  clearAllBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    paddingVertical:   7,
    paddingHorizontal: 12,
    borderRadius:      20,
    backgroundColor:   'rgba(219,79,145,0.12)',
    borderWidth:       1,
    borderColor:       'rgba(219,79,145,0.28)',
  },
  clearAllText: { fontSize: 13, color: '#DB4F91', fontWeight: '700' },

  // 輸入卡片
  inputCard: {
    marginHorizontal:  24,
    marginBottom:      20,
    paddingVertical:   16,
    paddingHorizontal: 18,
    overflow:          'hidden',
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginBottom: 6 },
  noteInput: {
    fontSize: 16, color: '#1E293B', minHeight: 40, paddingVertical: 4,
  },
  divider: {
    height: 1, backgroundColor: 'rgba(200,210,220,0.5)', marginVertical: 14,
  },
  amtRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currency: { fontSize: 18, fontWeight: '700', color: '#94A3B8' },
  amtInput: {
    flex: 1, fontSize: 28, fontWeight: '800', color: '#1E293B', paddingVertical: 4,
  },

  // 常買品項
  freqHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 24,
    marginBottom:      10,
    marginTop:         2,
  },
  freqEditBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingVertical:   4,
    paddingHorizontal: 10,
    borderRadius:      16,
    backgroundColor:   'rgba(139,92,246,0.10)',
  },
  freqEditText: { fontSize: 12, fontWeight: '700', color: '#8B5CF6' },

  freqScroll: { marginBottom: 16 },
  freqChip: {
    height:            38,
    paddingHorizontal: 14,
    borderRadius:      19,
    backgroundColor:   'rgba(255,255,255,0.72)',
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.86)',
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
  },
  freqChipText: { fontSize: 14, fontWeight: '700', color: '#475569' },

  freqEditChip: {
    height:            38,
    paddingHorizontal: 14,
    borderRadius:      19,
    backgroundColor:   'rgba(139,92,246,0.12)',
    borderWidth:       1,
    borderColor:       'rgba(139,92,246,0.32)',
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
  },
  freqEmptyChip: {
    height:            38,
    paddingHorizontal: 14,
    borderRadius:      19,
    backgroundColor:   'rgba(139,92,246,0.08)',
    borderWidth:       1,
    borderColor:       'rgba(139,92,246,0.22)',
    borderStyle:       'dashed',
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
  },
  freqEditChipText: { fontSize: 13, fontWeight: '700', color: '#8B5CF6' },

  // 分類
  sectionTitle: {
    fontSize:          16,
    fontWeight:        '700',
    color:             '#475569',
    paddingHorizontal: 24,
    marginBottom:      10,
    marginTop:         2,
  },
  catScroll: { marginBottom: 14 },
  catChip: {
    height:            38,
    paddingHorizontal: 14,
    borderRadius:      19,
    backgroundColor:   'rgba(255,255,255,0.72)',
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.86)',
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
  },
  catChipActive: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderColor:     '#8B5CF6',
  },
  catIcon:  { fontSize: 15 },
  catLabel: { fontSize: 13, color: '#475569', fontWeight: '700' },

  // 買給誰
  buyerWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingHorizontal: 24,
    marginBottom:      18,
  },
  buyerLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },

  // 下拉選單
  dropBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingVertical:   5,
    paddingHorizontal: 10,
    borderRadius:      20,
    backgroundColor:   'rgba(248,250,252,0.94)',
    borderWidth:       1,
    borderColor:       'rgba(0,0,0,0.06)',
  },
  dropValue: { fontSize: 13, color: '#1E293B', fontWeight: '700' },
  dropOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  dropMenu: {
    backgroundColor: '#fff',
    borderRadius:    16,
    paddingVertical: 6,
    minWidth:        140,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.10,
    shadowRadius:    12,
    elevation:       8,
  },
  dropItem: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingVertical:   12,
    paddingHorizontal: 16,
  },
  dropItemActive:     { backgroundColor: 'rgba(139,92,246,0.08)' },
  dropItemText:       { fontSize: 15, color: '#1E293B', fontWeight: '600' },
  dropItemTextActive: { color: '#8B5CF6' },

  // 加入按鈕
  addBtnWrap: { marginHorizontal: 24, marginBottom: 24, gap: 10 },
  addBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    paddingVertical: 14,
    borderRadius:    24,
  },
  addBtnText:    { fontSize: 16, fontWeight: '700', color: '#fff' },
  cancelEditBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelEditText: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },

  // 清單
  listHeader: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: 24,
    marginBottom:      8,
  },
  itemCount: { fontSize: 13, color: '#94A3B8', fontWeight: '600' },

  listItem: {
    flexDirection:     'row',
    alignItems:        'center',
    marginHorizontal:  24,
    marginBottom:      10,
    paddingVertical:   12,
    paddingHorizontal: 14,
    gap:               10,
    overflow:          'hidden',
  },
  listItemChecked: { opacity: 0.68 },

  checkbox: {
    width:           22,
    height:          22,
    borderRadius:    6,
    borderWidth:     1.5,
    borderColor:     'rgba(148,163,184,0.55)',
    backgroundColor: 'rgba(255,255,255,0.60)',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  checkboxChecked: { backgroundColor: '#10B981', borderColor: '#10B981' },

  listIconBox: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  listInfo:         { flex: 1, minWidth: 0 },
  listNote:         { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  listNoteChecked:  { textDecorationLine: 'line-through', color: '#94A3B8' },
  listCat:          { fontSize: 12, fontWeight: '600', marginTop: 2 },
  listAmt:          { fontSize: 15, fontWeight: '700', color: '#1E293B', flexShrink: 0 },
  listAmtEmpty:     { fontSize: 12, fontWeight: '500', color: '#CBD5E1' },
  delBtn:           { paddingHorizontal: 2 },

  // 合計
  totalCard: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    marginHorizontal:  24,
    marginTop:         4,
    marginBottom:      14,
    paddingVertical:   16,
    paddingHorizontal: 20,
    overflow:          'hidden',
  },
  totalLabel: { fontSize: 15, fontWeight: '700', color: '#475569' },
  totalSub:   { fontSize: 12, color: '#CBD5E1', marginTop: 3 },
  totalAmt:   { fontSize: 24, fontWeight: '800', color: '#1E293B' },

  // 轉成記帳
  commitWrap: { marginHorizontal: 24, marginBottom: 10 },
  commitBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    paddingVertical: 14,
    borderRadius:    24,
    backgroundColor: '#10B981',
  },
  commitBtnDisabled: { backgroundColor: 'rgba(148,163,184,0.45)' },
  commitBtnText:     { fontSize: 16, fontWeight: '700', color: '#fff' },

  // ── 轉成記帳預覽 Modal ──
  commitPreviewSub: {
    fontSize: 13, color: '#94A3B8', fontWeight: '600', marginBottom: 14,
  },
  commitGroupRow: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'flex-start',
    backgroundColor:   'rgba(248,250,252,0.90)',
    borderRadius:      14,
    padding:           12,
    marginBottom:      8,
    gap:               12,
  },
  commitGroupLeft:  { flex: 1, minWidth: 0 },
  commitGroupCat:   { fontSize: 14, fontWeight: '800', color: '#1E293B', marginBottom: 2 },
  commitGroupNote:  { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  commitGroupAmt:   { fontSize: 15, fontWeight: '800', color: '#10B981', flexShrink: 0 },

  commitPayWrap: {
    marginTop:    14,
    marginBottom: 4,
  },
  commitPayLabel: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 8 },
  commitPayRow:   { flexDirection: 'row', gap: 10 },
  commitPayChip: {
    paddingVertical:   8,
    paddingHorizontal: 18,
    borderRadius:      20,
    backgroundColor:   'rgba(248,250,252,0.94)',
    borderWidth:       1,
    borderColor:       'rgba(0,0,0,0.07)',
  },
  commitPayChipActive: {
    backgroundColor: '#8B5CF6',
    borderColor:     '#8B5CF6',
  },
  commitPayChipText: { fontSize: 14, fontWeight: '700', color: '#475569' },

  commitFooter: {
    flexDirection:  'row',
    gap:            12,
    marginTop:      16,
    paddingTop:     14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  commitCancelBtn: {
    flex:            1,
    paddingVertical: 14,
    borderRadius:    22,
    alignItems:      'center',
    backgroundColor: '#F8FAFC',
    borderWidth:     1,
    borderColor:     'rgba(0,0,0,0.07)',
  },
  commitCancelText:  { fontSize: 15, fontWeight: '700', color: '#475569' },
  commitConfirmBtn: {
    flex:            2,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    paddingVertical: 14,
    borderRadius:    22,
    backgroundColor: '#10B981',
  },
  commitConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // ── 編輯常買 Modal ──────────────────────────────────────
  modalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  modalSheet: {
    position:             'absolute',
    bottom:               0,
    left:                 0,
    right:                0,
    maxHeight:            '85%',
    backgroundColor:      'rgba(255,255,255,0.97)',
    borderTopLeftRadius:  32,
    borderTopRightRadius: 32,
    paddingHorizontal:    20,
    paddingBottom:        Platform.OS === 'android' ? 28 : 20,
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -8 },
    shadowOpacity:        0.10,
    shadowRadius:         22,
    elevation:            18,
  },
  modalHandle: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: '#E2E8F0',
    alignSelf:       'center',
    marginTop:       12,
    marginBottom:    14,
  },
  modalHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    marginBottom:   16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },

  modalAddCard: {
    marginBottom:      16,
    paddingVertical:   14,
    paddingHorizontal: 16,
    overflow:          'hidden',
  },
  modalSectionLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginBottom: 8 },
  modalInput: {
    fontSize:        15,
    color:           '#1E293B',
    borderWidth:     1,
    borderColor:     'rgba(0,0,0,0.07)',
    borderRadius:    12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom:    10,
  },
  modalCatChip: {
    height:            32,
    paddingHorizontal: 12,
    borderRadius:      16,
    backgroundColor:   'rgba(248,250,252,0.90)',
    borderWidth:       1,
    borderColor:       'rgba(0,0,0,0.06)',
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
  },
  modalCatChipActive: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderColor:     '#8B5CF6',
  },
  modalCatLabel: { fontSize: 12, color: '#475569', fontWeight: '700' },

  modalRowInputs: {
    flexDirection: 'row',
    gap:           12,
    marginTop:     10,
    marginBottom:  12,
    alignItems:    'flex-start',
  },
  modalFieldLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginBottom: 6 },
  modalAmtInput: {
    fontSize:          14,
    color:             '#1E293B',
    borderWidth:       1,
    borderColor:       'rgba(0,0,0,0.07)',
    borderRadius:      12,
    paddingVertical:   8,
    paddingHorizontal: 12,
    fontWeight:        '700',
  },

  modalAddBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    paddingVertical: 10,
    borderRadius:    20,
    backgroundColor: '#8B5CF6',
  },
  modalAddBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  modalSectionTitle: {
    fontSize:     14,
    fontWeight:   '700',
    color:        '#475569',
    marginBottom: 10,
    marginTop:    4,
  },
  modalFreqRow: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   'rgba(248,250,252,0.90)',
    borderRadius:      14,
    padding:           12,
    marginBottom:      8,
    gap:               10,
  },
  modalFreqIcon: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  modalFreqInfo:  { flex: 1, minWidth: 0 },
  modalFreqName:  { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  modalFreqMeta:  { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  modalFreqAction: { padding: 4 },
});
