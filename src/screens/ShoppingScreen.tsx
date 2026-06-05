import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GlassCard } from '../components/GlassCard';
import { colors, radius, spacing, fontSize } from '../theme';

// ── 分類定義（光暈顏色跟隨分類動態切換）──
const CATS = [
  { id: 'food',      label: '餐飲',   icon: '🍱', color: colors.pink,     glowColor: colors.pink,     gradBot: 'rgba(244,114,182,0.18)' },
  { id: 'drinks',    label: '飲料',   icon: '🥤', color: colors.cyan,     glowColor: colors.cyan,     gradBot: 'rgba(56,189,248,0.18)'  },
  { id: 'groceries', label: '日用品', icon: '🛒', color: colors.mint,     glowColor: colors.mint,     gradBot: 'rgba(52,211,153,0.18)'  },
  { id: 'clothes',   label: '服飾',   icon: '👕', color: colors.lavender, glowColor: colors.lavender, gradBot: 'rgba(167,139,250,0.18)' },
  { id: 'other',     label: '其他',   icon: '🛍️', color: colors.peach,    glowColor: colors.peach,    gradBot: 'rgba(251,191,36,0.18)'  },
] as const;

type CatId = typeof CATS[number]['id'];

interface ShoppingItem {
  id:     number;
  cat:    CatId;
  icon:   string;
  color:  string;
  label:  string;
  note:   string;
  amount: number;
}

export function ShoppingScreen() {
  const [selectedCatId, setSelectedCatId] = useState<CatId>('food');
  const [amount,  setAmount]  = useState('');
  const [note,    setNote]    = useState('');
  const [items,   setItems]   = useState<ShoppingItem[]>([]);

  const selectedCat = CATS.find(c => c.id === selectedCatId)!;
  const total = items.reduce((s, i) => s + i.amount, 0);

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
    }]);
    setAmount('');
    setNote('');
  }, [amount, note, selectedCat]);

  const handleDelete = useCallback((id: number) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const handleClear = useCallback(() => {
    setItems([]);
    setAmount('');
    setNote('');
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
              <Pressable onPress={handleClear} style={sty.clearBtn}>
                <Feather name="trash-2" size={16} color={colors.textMuted} />
                <Text style={sty.clearText}>清空</Text>
              </Pressable>
            )}
          </View>

          {/* ── 主卡片：金額輸入，光暈跟隨分類動態變色 ── */}
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
          </GlassCard>

          {/* ── 分類選擇（橫向）── */}
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

          {/* ── 備註輸入 ── */}
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
          </GlassCard>

          {/* ── 加入按鈕 ── */}
          <Pressable
            style={({ pressed }) => [
              sty.addBtn,
              { backgroundColor: selectedCat.color, opacity: pressed ? 0.82 : 1 },
            ]}
            onPress={handleAdd}
          >
            <Feather name="plus" size={20} color="#fff" />
            <Text style={sty.addBtnText}>
              加入清單  NT${amount || '0'}
            </Text>
          </Pressable>

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
                    <Text style={[sty.listCat, { color: item.color }]}>{item.label}</Text>
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
  clearBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 4 },
  clearText:   { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },

  // 金額主卡片
  amountCard: {
    marginHorizontal: spacing.xl,
    marginBottom:     spacing.xl,
    paddingVertical:  36,
    alignItems:       'center',
    overflow:         'hidden',
  },
  catBadge:  { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.lg },
  inputRow:  { flexDirection: 'row', alignItems: 'center' },
  currency:  { fontSize: fontSize.h2, fontWeight: '700', marginRight: 6, marginTop: 10 },
  amountInput: {
    fontSize:     56,
    fontWeight:   '800',
    color:        colors.textPrimary,
    minWidth:     140,
    textAlign:    'center',
  },

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

  // 備註
  noteCard:  { marginHorizontal: spacing.xl, marginBottom: spacing.xl, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, overflow: 'hidden' },
  noteInput: { fontSize: fontSize.lg, color: colors.textPrimary, minHeight: 40 },

  // 加入按鈕
  addBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               spacing.sm,
    marginHorizontal:  spacing.xl,
    marginBottom:      spacing.xxl,
    paddingVertical:   16,
    borderRadius:      radius.pill,
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
  listNote:  { fontSize: fontSize.lg, fontWeight: '600', color: colors.textPrimary },
  listCat:   { fontSize: fontSize.sm, fontWeight: '600', marginTop: 2 },
  listAmt:   { fontSize: fontSize.xl, fontWeight: '800', flexShrink: 0 },
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
  totalLabel: { fontSize: fontSize.lg,  fontWeight: '700', color: colors.textSecondary },
  totalAmt:   { fontSize: fontSize.h2,  fontWeight: '800', color: colors.textPrimary },
});
