import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, SafeAreaView, KeyboardAvoidingView, Platform,
  StatusBar, Modal, TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassCard } from '../components/GlassCard';
import { colors, radius, spacing, fontSize, textShadows } from '../theme';

const STORAGE_KEY = '@shopping_items';

// ── 分類定義 ──
const CATS = [
  { id: 'food',      label: '餐飲',   icon: '🍱', color: colors.pink,     glowColor: colors.pink,     gradBot: 'rgba(244,114,182,0.18)' },
  { id: 'drinks',    label: '飲料',   icon: '🥤', color: colors.cyan,     glowColor: colors.cyan,     gradBot: 'rgba(56,189,248,0.18)'  },
  { id: 'groceries', label: '日用品', icon: '🛒', color: colors.mint,     glowColor: colors.mint,     gradBot: 'rgba(52,211,153,0.18)'  },
  { id: 'clothes',   label: '服飾',   icon: '👕', color: colors.lavender, glowColor: colors.lavender, gradBot: 'rgba(167,139,250,0.18)' },
  { id: 'other',     label: '其他',   icon: '🛍️', color: colors.peach,    glowColor: colors.peach,    gradBot: 'rgba(251,191,36,0.18)'  },
] as const;

type CatId   = typeof CATS[number]['id'];
type BuyerT  = '我自己' | '家人';
const BUYERS: BuyerT[] = ['我自己', '家人'];

interface ShoppingItem {
  id:     number;
  cat:    CatId;
  icon:   string;
  color:  string;
  label:  string;
  note:   string;
  amount: number;
  buyer:  BuyerT;
}

// ── 簡易下拉選單元件 ──
function Dropdown({
  value, options, onChange,
}: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable style={sty.dropBtn} onPress={() => setOpen(true)}>
        <Text style={sty.dropValue}>{value}</Text>
        <Feather name="chevron-down" size={14} color={colors.textMuted} />
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
                {opt === value && <Feather name="check" size={14} color={colors.income} />}
              </Pressable>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export function ShoppingScreen() {
  const [selectedCatId, setSelectedCatId] = useState<CatId>('food');
  const [amount,  setAmount]  = useState('');
  const [note,    setNote]    = useState('');
  const [buyer,   setBuyer]   = useState<BuyerT>('我自己');
  const [items,   setItems]   = useState<ShoppingItem[]>([]);
  const loaded = useRef(false);

  // ── 載入暫存資料 ──
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setItems(JSON.parse(raw)); } catch {}
      }
      loaded.current = true;
    });
  }, []);

  // ── 任何 items 變化都存回 AsyncStorage ──
  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items]);

  const selectedCat = CATS.find(c => c.id === selectedCatId)!;
  const total       = items.reduce((s, i) => s + i.amount, 0);
  const parsedAmt   = parseFloat(amount);
  const hasAmount   = !isNaN(parsedAmt) && parsedAmt > 0;

  // 清除輸入欄（不動清單）
  const handleClearInput = useCallback(() => {
    setAmount('');
    setNote('');
    setBuyer('我自己');
  }, []);

  const handleAdd = useCallback(() => {
    const n = parseFloat(amount);
    if (!n || n <= 0) return;
    setItems(prev => [...prev, {
      id:     Date.now(),
      cat:    selectedCat.id,
      icon:   selectedCat.icon,
      color:  selectedCat.color,
      label:  selectedCat.label,
      note:   note.trim() || selectedCat.label,
      amount: n,
      buyer,
    }]);
    setAmount('');
    setNote('');
  }, [amount, note, selectedCat, buyer]);

  const handleDelete = useCallback((id: number) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  // 清空整個清單
  const handleClearAll = useCallback(() => {
    setItems([]);
    setAmount('');
    setNote('');
    setBuyer('我自己');
  }, []);

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
              <Text style={sty.headerSub}>今日清單</Text>
              <Text style={sty.headerTitle}>快速採購 🛍️</Text>
            </View>
            {items.length > 0 && (
              <Pressable onPress={handleClearAll} style={sty.clearAllBtn}>
                <Feather name="trash-2" size={15} color="#fff" />
                <Text style={sty.clearAllText}>清空清單</Text>
              </Pressable>
            )}
          </View>

          {/* ── 主卡片：金額輸入 ── */}
          <GlassCard
            style={[sty.amountCard, {
              shadowColor:   selectedCat.glowColor,
              shadowOffset:  { width: 0, height: 12 },
              shadowOpacity: 0.4,
              shadowRadius:  24,
            }]}
            colorTop="rgba(255,255,255,0.42)"
            colorBot={selectedCat.gradBot}
            borderRadius={radius.xl}
          >
            <Text style={[sty.catBadge, { color: selectedCat.color }]}>
              {selectedCat.icon}  {selectedCat.label}
            </Text>
            <View style={sty.inputRow}>
              <Text style={[sty.currency, { color: selectedCat.color }]}>NT$</Text>
              <TextInput
                style={sty.amountInput}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textHint}
                value={amount}
                onChangeText={setAmount}
                returnKeyType="done"
                onSubmitEditing={handleAdd}
              />
            </View>

            {/* 清除輸入欄按鈕（金額有值才顯示）*/}
            {(amount !== '' || note !== '') && (
              <Pressable onPress={handleClearInput} style={sty.clearInputBtn}>
                <Feather name="x-circle" size={14} color={colors.textMuted} />
                <Text style={sty.clearInputText}>清除輸入</Text>
              </Pressable>
            )}
          </GlassCard>

          {/* ── 分類選擇 ── */}
          <Text style={sty.sectionTitle}>分類</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={sty.catScroll}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
          >
            {CATS.map(cat => {
              const active = cat.id === selectedCatId;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => setSelectedCatId(cat.id)}
                  style={[
                    sty.catChip,
                    active && { borderColor: cat.color, backgroundColor: 'rgba(255,255,255,0.75)' },
                  ]}
                >
                  <Text style={sty.catIcon}>{cat.icon}</Text>
                  <Text style={[sty.catLabel, active && { color: cat.color, fontWeight: '700' }]}>
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* ── 備註 + 買給誰 ── */}
          <Text style={sty.sectionTitle}>品項備註（選填）</Text>
          <GlassCard style={sty.noteCard} borderRadius={radius.lg}>
            <TextInput
              style={sty.noteInput}
              placeholder="買了什麼？"
              placeholderTextColor={colors.textHint}
              value={note}
              onChangeText={setNote}
              returnKeyType="done"
              onSubmitEditing={handleAdd}
            />
            <View style={sty.noteDivider} />
            <View style={sty.buyerRow}>
              <Feather name="user" size={14} color={colors.textMuted} />
              <Text style={sty.buyerLabel}>買給</Text>
              <Dropdown value={buyer} options={BUYERS} onChange={v => setBuyer(v as BuyerT)} />
            </View>
          </GlassCard>

          {/* ── Smart FAB：有金額才啟用，顯示即時金額 ── */}
          <View style={[
            sty.addBtnWrap,
            hasAmount && {
              shadowColor:   selectedCat.color,
              shadowOffset:  { width: 0, height: 10 },
              shadowOpacity: 0.5,
              shadowRadius:  20,
            },
          ]}>
            <Pressable
              style={({ pressed }) => [
                sty.addBtn,
                {
                  backgroundColor: hasAmount ? selectedCat.color : 'rgba(148,163,184,0.55)',
                  opacity: pressed && hasAmount ? 0.82 : 1,
                },
              ]}
              onPress={hasAmount ? handleAdd : undefined}
              disabled={!hasAmount}
            >
              <Feather name={hasAmount ? 'check-circle' : 'edit-2'} size={20} color="#fff" />
              <Text style={sty.addBtnText}>
                {hasAmount
                  ? `確認記下  NT$${parsedAmt.toLocaleString('zh-TW')}`
                  : '請先輸入金額'}
              </Text>
            </Pressable>
          </View>

          {/* ── 清單明細 ── */}
          {items.length > 0 && (
            <>
              <View style={sty.listHeader}>
                <Text style={sty.sectionTitle}>購物清單</Text>
                <Text style={sty.itemCount}>{items.length} 項</Text>
              </View>

              {items.map(item => (
                <GlassCard key={item.id} style={sty.listItem} borderRadius={radius.md}>
                  <View style={[sty.listIconBox, { backgroundColor: item.color + '22' }]}>
                    <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                  </View>
                  <View style={sty.listInfo}>
                    <Text style={sty.listNote}>{item.note}</Text>
                    <Text style={[sty.listCat, { color: item.color }]}>
                      {item.label}
                      {item.buyer ? `・${item.buyer}` : ''}
                    </Text>
                  </View>
                  <Text style={[sty.listAmt, { color: item.color }]}>
                    NT${item.amount.toLocaleString('zh-TW')}
                  </Text>
                  <Pressable onPress={() => handleDelete(item.id)} hitSlop={10} style={sty.delBtn}>
                    <Feather name="x" size={16} color={colors.textMuted} />
                  </Pressable>
                </GlassCard>
              ))}

              {/* ── 合計 ── */}
              <GlassCard style={sty.totalCard} borderRadius={radius.lg}
                colorTop="rgba(255,255,255,0.5)" colorBot="rgba(210,220,240,0.25)">
                <Text style={sty.totalLabel}>本次合計</Text>
                <Text style={sty.totalAmt}>
                  NT${total.toLocaleString('zh-TW')}
                </Text>
              </GlassCard>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const sty = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.appBg },
  scroll: { paddingBottom: 24 },

  // Header
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'flex-end',
    paddingHorizontal: spacing.xxl,
    paddingTop:        spacing.xxl,
    paddingBottom:     spacing.xl,
  },
  headerSub:   { fontSize: fontSize.md, color: colors.textMuted, marginBottom: 4 },
  headerTitle: { fontSize: fontSize.h1, fontWeight: '800', color: colors.textPrimary },

  // 清空清單按鈕
  clearAllBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius:    radius.pill,
    backgroundColor: 'rgba(239,68,68,0.85)',
  },
  clearAllText: { fontSize: fontSize.sm, color: '#fff', fontWeight: '700' },

  // 金額主卡片
  amountCard: {
    marginHorizontal: spacing.xl,
    marginBottom:     spacing.xl,
    paddingVertical:  36,
    alignItems:       'center',
    overflow:         'hidden',
  },
  catBadge:  { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.lg, ...textShadows.light },
  inputRow:  { flexDirection: 'row', alignItems: 'center' },
  currency:  { fontSize: fontSize.h2, fontWeight: '700', marginRight: 6, marginTop: 10, ...textShadows.light },
  amountInput: {
    fontSize:   56,
    fontWeight: '800',
    color:      colors.textPrimary,
    minWidth:   140,
    textAlign:  'center',
  },

  // 清除輸入欄按鈕（卡片內）
  clearInputBtn: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    marginTop:     12,
    paddingVertical:   5,
    paddingHorizontal: 12,
    borderRadius:  radius.pill,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  clearInputText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

  // 分類
  sectionTitle: {
    fontSize:          fontSize.md,
    fontWeight:        '700',
    color:             colors.textSecondary,
    marginBottom:      spacing.md,
    paddingHorizontal: spacing.xl,
  },
  catScroll: { marginBottom: spacing.xl },
  catChip: {
    width:           80,
    height:          88,
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    radius.lg,
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderWidth:     1.5,
    borderColor:     'rgba(255,255,255,0.85)',
    gap:             4,
  },
  catIcon:  { fontSize: 22 },
  catLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },

  // 備註卡片
  noteCard: {
    marginHorizontal: spacing.xl,
    marginBottom:     spacing.xl,
    paddingVertical:  spacing.sm,
    paddingHorizontal: spacing.lg,
    overflow:         'hidden',
  },
  noteInput:   { fontSize: fontSize.lg, color: colors.textPrimary, minHeight: 40 },
  noteDivider: { height: 1, backgroundColor: 'rgba(200,210,220,0.5)', marginVertical: 6 },

  // 買給誰列
  buyerRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    paddingVertical: 4,
  },
  buyerLabel: { fontSize: fontSize.md, color: colors.textMuted, fontWeight: '600' },

  // 下拉選單
  dropBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingVertical:   4,
    paddingHorizontal: 10,
    borderRadius:      radius.pill,
    backgroundColor:   'rgba(255,255,255,0.8)',
    borderWidth:       1,
    borderColor:       'rgba(200,210,220,0.8)',
  },
  dropValue:   { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: '700' },
  dropOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  dropMenu: {
    backgroundColor: '#fff',
    borderRadius:    radius.lg,
    paddingVertical: spacing.sm,
    minWidth:        140,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.15,
    shadowRadius:    12,
    elevation:       8,
  },
  dropItem: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingVertical:   12,
    paddingHorizontal: spacing.lg,
  },
  dropItemActive:     { backgroundColor: 'rgba(52,211,153,0.08)' },
  dropItemText:       { fontSize: fontSize.lg, color: colors.textPrimary, fontWeight: '600' },
  dropItemTextActive: { color: colors.income },

  // 加入按鈕
  addBtnWrap: {
    marginHorizontal: spacing.xl,
    marginBottom:     spacing.xxl,
    borderRadius:     radius.pill,
  },
  addBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing.sm,
    paddingVertical: 16,
    borderRadius:    radius.pill,
  },
  addBtnText: { fontSize: fontSize.h3, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  // 清單
  listHeader: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: spacing.xl,
    marginBottom:      spacing.md,
  },
  itemCount: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },

  listItem: {
    flexDirection:     'row',
    alignItems:        'center',
    marginHorizontal:  spacing.xl,
    marginBottom:      spacing.sm,
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.lg,
    gap:               spacing.md,
    overflow:          'hidden',
  },
  listIconBox: {
    width: 40, height: 40, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  listInfo:  { flex: 1, minWidth: 0 },
  listNote:  { fontSize: fontSize.lg, fontWeight: '600', color: colors.textPrimary, ...textShadows.light },
  listCat:   { fontSize: fontSize.sm, fontWeight: '600', marginTop: 2 },
  listAmt:   { fontSize: fontSize.xl, fontWeight: '800', flexShrink: 0, ...textShadows.heavy },
  delBtn:    { paddingHorizontal: 4 },

  // 合計
  totalCard: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    marginHorizontal:  spacing.xl,
    marginTop:         spacing.md,
    paddingVertical:   spacing.lg,
    paddingHorizontal: spacing.xl,
    overflow:          'hidden',
  },
  totalLabel: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textSecondary },
  totalAmt:   { fontSize: fontSize.h2, fontWeight: '800', color: colors.textPrimary, ...textShadows.heavy },
});
