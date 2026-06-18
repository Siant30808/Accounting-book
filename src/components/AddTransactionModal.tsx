/**
 * AddTransactionModal.tsx — 新增記帳 Bottom Sheet
 *
 * 布局：
 *   固定頂部：拖曳條 + Segmented Control (支出/收入)
 *   可滾動主體：金額 → 分類(自動換行) → 付款方式 → 日期 → 備註
 *   固定底部：送出按鈕
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable,
  TextInput, ScrollView, KeyboardAvoidingView,
  Platform, Keyboard, KeyboardEvent,
  TextInput as RNTextInput,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CAT_GROUPS, getCatHint } from '../types';
import { colors, radius, spacing, fontSize } from '../theme';

// 收入分類（含退款、投資收益、其他收入）
const INCOME_CATS = [
  { e: '💼', n: '薪資'   },
  { e: '🎁', n: '獎金'   },
  { e: '↩️', n: '退款'   },
  { e: '📈', n: '投資收益' },
  { e: '📋', n: '其他收入' },
] as const;

export interface AddTransactionInput {
  type:   'expense' | 'income';
  cat:    string;
  amount: number;
  date:   string;   // YYYY-MM-DD
  time:   string;   // HH:MM
  pay:    '現金' | '信用卡' | '—';
  note:   string;
}

interface Props {
  visible:       boolean;
  initialType?:  'expense' | 'income';
  onClose:       () => void;
  onAdd:         (tx: AddTransactionInput) => void;
}

export function AddTransactionModal({ visible, initialType = 'expense', onClose, onAdd }: Props) {
  const [addType,        setAddType]        = useState<'expense' | 'income'>(initialType);
  const [addAmt,         setAddAmt]         = useState('');
  const [addCat,         setAddCat]         = useState('餐費');
  const [addPay,         setAddPay]         = useState<'現金' | '信用卡'>('現金');
  const [addNote,        setAddNote]        = useState('');
  const [selectedDate,   setSelectedDate]   = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const amtRef = useRef<RNTextInput>(null);

  // Modal 開啟時重置狀態；iOS 才自動 focus（Android 鍵盤會遮住 Modal）
  useEffect(() => {
    if (visible) {
      setAddType(initialType);
      setAddAmt('');
      setAddNote('');
      setAddPay('現金');
      setSelectedDate(new Date());
      setKeyboardHeight(0);
      setAddCat(initialType === 'expense' ? '餐費' : '薪資');
      if (Platform.OS === 'ios') {
        const t = setTimeout(() => amtRef.current?.focus(), 500);
        return () => clearTimeout(t);
      }
    }
  }, [visible, initialType]);

  // 監聽鍵盤高度（Android 用 keyboardDidShow/Hide）
  useEffect(() => {
    if (!visible) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, [visible]);

  const handleTypeChange = useCallback((type: 'expense' | 'income') => {
    setAddType(type);
    setAddCat(type === 'expense' ? '餐費' : '薪資');
    setAddPay('現金');
  }, []);

  const amount   = parseFloat(addAmt);
  const isValid  = !!addAmt && !isNaN(amount) && amount > 0;

  const handleSubmit = useCallback(() => {
    const amt = parseFloat(addAmt);
    if (!amt || amt <= 0) return;
    Keyboard.dismiss();
    const now = new Date();
    const d   = selectedDate;
    onAdd({
      type: addType,
      cat:  addCat,
      amount: amt,
      date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
      time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
      pay:  addType === 'expense' ? addPay : '—',
      note: addNote.trim(),
    });
  }, [addAmt, addType, addCat, addPay, addNote, selectedDate, onAdd]);

  // 分類提示文字：收入模式固定顯示
  const hintText = addType === 'income' ? '此分類會計入本期收入' : getCatHint(addCat);

  // 日期顯示
  const dateDisplay = [
    selectedDate.getFullYear(),
    String(selectedDate.getMonth() + 1).padStart(2, '0'),
    String(selectedDate.getDate()).padStart(2, '0'),
  ].join(' / ');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => { Keyboard.dismiss(); setTimeout(onClose, 50); }}
    >
      {/* 背景遮罩（在 KAV 外層，避免 Android 手勢攔截） */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => { Keyboard.dismiss(); setTimeout(onClose, 50); }}
      />

      {/*
        Android: behavior={undefined} — 不讓 KAV 壓縮 Modal 高度；
                 鍵盤滑到 ScrollView 下方後用者自行滑動。
        iOS:     behavior="padding"  — KAV 上推整個 sheet。
      */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={sty.avoidingView}
        pointerEvents="box-none"
      >
        {/* Modal 本體：Android 鍵盤出現時往上推並縮減高度 */}
        <View style={[
          sty.box,
          Platform.OS === 'android' && keyboardHeight > 0 && {
            marginBottom: keyboardHeight,
            maxHeight: '64%',
            minHeight: 360,
          },
        ]}>

          {/* 拖曳條 */}
          <View style={sty.dragHandle} />

          {/* ── Segmented Control ── */}
          <View style={sty.segment}>
            {(['expense', 'income'] as const).map(type => (
              <Pressable
                key={type}
                style={[
                  sty.segBtn,
                  addType === type && (type === 'expense' ? sty.segActiveExp : sty.segActiveInc),
                ]}
                onPress={() => handleTypeChange(type)}
              >
                <Text style={[
                  sty.segText,
                  addType === type && { color: type === 'expense' ? colors.expense : colors.income },
                ]}>
                  {type === 'expense' ? '支出' : '收入'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── 可滾動內容 ── */}
          <ScrollView
            style={sty.body}
            contentContainerStyle={[
              sty.bodyContent,
              keyboardHeight > 0 && { paddingBottom: 160 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* 金額 */}
            <View style={sty.section}>
              <Text style={sty.fieldLabel}>金額</Text>
              <TextInput
                ref={amtRef}
                style={sty.amtInput}
                placeholder="NT$ 0"
                placeholderTextColor="#CBD5E1"
                keyboardType="decimal-pad"
                value={addAmt}
                onChangeText={setAddAmt}
              />
            </View>

            {/* 分類 */}
            <View style={sty.section}>
              <Text style={sty.fieldLabel}>分類</Text>

              {addType === 'expense' ? (
                <>
                  {([
                    { label: '每日',     cats: CAT_GROUPS.daily   as readonly { e: string; n: string }[] },
                    { label: '每月',     cats: CAT_GROUPS.monthly as readonly { e: string; n: string }[] },
                    { label: '獨立統計', cats: CAT_GROUPS.indep   as readonly { e: string; n: string }[] },
                  ] as const).map(({ label, cats }) => (
                    <View key={label} style={sty.catGroup}>
                      <Text style={sty.catGroupLabel}>{label}</Text>
                      <View style={sty.chips}>
                        {cats.map(c => (
                          <Pressable
                            key={c.n}
                            style={[sty.chip, addCat === c.n && sty.chipActiveExp]}
                            onPress={() => setAddCat(c.n)}
                          >
                            <Text style={[sty.chipText, addCat === c.n && { color: colors.expense }]}>
                              {c.e} {c.n}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                <View style={sty.chips}>
                  {INCOME_CATS.map(c => (
                    <Pressable
                      key={c.n}
                      style={[sty.chip, addCat === c.n && sty.chipActiveInc]}
                      onPress={() => setAddCat(c.n)}
                    >
                      <Text style={[sty.chipText, addCat === c.n && { color: colors.income }]}>
                        {c.e} {c.n}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={sty.hintText}>{hintText}</Text>
            </View>

            {/* 付款方式（僅支出模式）*/}
            {addType === 'expense' && (
              <View style={sty.section}>
                <Text style={sty.fieldLabel}>付款方式</Text>
                <View style={sty.payRow}>
                  {(['現金', '信用卡'] as const).map(pay => (
                    <Pressable
                      key={pay}
                      style={[sty.payBtn, addPay === pay && sty.payBtnActive]}
                      onPress={() => setAddPay(pay)}
                    >
                      <Text style={[sty.payBtnText, addPay === pay && { color: colors.credit }]}>
                        {pay}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* 日期 */}
            <View style={sty.section}>
              <Text style={sty.fieldLabel}>日期</Text>
              <Pressable style={sty.dateTrigger} onPress={() => setShowDatePicker(true)}>
                <Feather name="calendar" size={14} color={colors.textSecondary} />
                <Text style={sty.dateTriggerText}>{dateDisplay}</Text>
                <Feather name="chevron-down" size={13} color={colors.textMuted} />
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="default"
                  onChange={(_e, d) => { setShowDatePicker(false); if (d) setSelectedDate(d); }}
                />
              )}
            </View>

            {/* 備註 */}
            <View style={sty.section}>
              <Text style={sty.fieldLabel}>備註</Text>
              <TextInput
                style={sty.noteInput}
                placeholder="選填"
                placeholderTextColor="#CBD5E1"
                value={addNote}
                onChangeText={setAddNote}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>

          </ScrollView>

          {/* ── 固定底部送出按鈕 ── */}
          <View style={[
            sty.footer,
            Platform.OS === 'android' && keyboardHeight > 0 && { paddingBottom: 12 },
          ]}>
            <Pressable
              style={[
                sty.submitBtn,
                { backgroundColor: addType === 'expense' ? colors.expense : colors.income },
                !isValid && sty.submitDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!isValid}
            >
              <Text style={sty.submitText}>
                {addType === 'expense' ? '記帳支出' : '記帳收入'}
              </Text>
            </Pressable>
          </View>

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────
const sty = StyleSheet.create({
  avoidingView: {
    flex:           1,
    justifyContent: 'flex-end',
  },

  // Modal 容器：flex column，固定高度讓 ScrollView 可捲動、不被壓縮
  box: {
    backgroundColor:      'rgba(255,255,255,0.97)',
    borderTopLeftRadius:  radius.xxl,
    borderTopRightRadius: radius.xxl,
    // 固定高度：給足空間又不遮整個螢幕
    maxHeight:            '88%',
    minHeight:            520,
    flexDirection:        'column',
    borderWidth:          1,
    borderColor:          'rgba(255,255,255,0.80)',
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -10 },
    shadowOpacity:        0.15,
    shadowRadius:         30,
    elevation:            24,
  },

  dragHandle: {
    width:           40,
    height:          4,
    backgroundColor: '#E2E8F0',
    borderRadius:    2,
    alignSelf:       'center',
    marginTop:       14,
    marginBottom:    14,
  },

  // Segmented Control
  segment: {
    flexDirection:   'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius:    radius.md,
    marginHorizontal: spacing.xl + 2,
    marginBottom:    spacing.md,
    padding:         4,
    height:          48,
  },
  segBtn: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   radius.sm,
  },
  segActiveExp: { backgroundColor: 'rgba(244,114,182,0.18)' },
  segActiveInc: { backgroundColor: 'rgba(52,211,153,0.18)'  },
  segText: {
    fontSize:   fontSize.lg,
    fontWeight: '700',
    color:      colors.textMuted,
  },

  // 可滾動主體
  body:        { flex: 1 },
  bodyContent: {
    paddingHorizontal: spacing.xl + 2,
    paddingTop:        spacing.sm,
    // 底部留足夠空間，確保最後欄位不被 footer 遮住
    paddingBottom:     120,
  },

  // 欄位區塊
  section: { marginBottom: spacing.lg },
  fieldLabel: {
    fontSize:      fontSize.sm,
    fontWeight:    '700',
    color:         colors.textMuted,
    letterSpacing: 0.5,
    marginBottom:  spacing.sm,
    textTransform: 'uppercase',
  },

  // 金額輸入
  amtInput: {
    backgroundColor:   '#F8FAFC',
    borderRadius:      radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical:   10,
    fontSize:          28,
    fontWeight:        '800',
    color:             colors.textPrimary,
    borderWidth:       1.5,
    borderColor:       'rgba(0,0,0,0.07)',
  },

  // 分類 group
  catGroup:      { marginBottom: 10 },
  catGroupLabel: {
    fontSize:      fontSize.xs,
    fontWeight:    '700',
    color:         '#94A3B8',
    letterSpacing: 0.7,
    marginBottom:  6,
  },

  // Chips 自動換行
  chips: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical:   7,
    borderRadius:      radius.pill,
    backgroundColor:   'rgba(0,0,0,0.04)',
    borderWidth:       1.5,
    borderColor:       'rgba(0,0,0,0.07)',
  },
  chipActiveExp: {
    backgroundColor: 'rgba(244,114,182,0.14)',
    borderColor:     colors.expense,
  },
  chipActiveInc: {
    backgroundColor: 'rgba(52,211,153,0.14)',
    borderColor:     colors.income,
  },
  chipText: {
    fontSize:   fontSize.base,
    fontWeight: '600',
    color:      colors.textPrimary,
  },

  hintText: {
    fontSize:  fontSize.xs + 1,
    color:     '#64748B',
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },

  // 付款方式
  payRow: { flexDirection: 'row', gap: 10 },
  payBtn: {
    flex:            1,
    paddingVertical: 10,
    borderRadius:    radius.lg,
    alignItems:      'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth:     1.5,
    borderColor:     'rgba(0,0,0,0.07)',
  },
  payBtnActive: {
    backgroundColor: 'rgba(56,189,248,0.14)',
    borderColor:     colors.credit,
  },
  payBtnText: {
    fontSize:   fontSize.md,
    fontWeight: '700',
    color:      colors.textSecondary,
  },

  // 日期
  dateTrigger: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    backgroundColor:   '#F8FAFC',
    borderRadius:      radius.lg,
    paddingHorizontal: 14,
    paddingVertical:   11,
    borderWidth:       1,
    borderColor:       'rgba(0,0,0,0.06)',
  },
  dateTriggerText: {
    flex:       1,
    fontSize:   fontSize.md,
    fontWeight: '600',
    color:      colors.textPrimary,
  },

  // 備註
  noteInput: {
    backgroundColor:   '#F8FAFC',
    borderRadius:      radius.lg,
    paddingHorizontal: 14,
    paddingVertical:   11,
    fontSize:          fontSize.md,
    borderWidth:       1,
    borderColor:       'rgba(0,0,0,0.06)',
    color:             colors.textPrimary,
  },

  // 固定底部
  footer: {
    paddingHorizontal: spacing.xl + 2,
    paddingTop:        spacing.md,
    paddingBottom:     28,
    borderTopWidth:    StyleSheet.hairlineWidth,
    borderTopColor:    'rgba(0,0,0,0.06)',
  },
  submitBtn: {
    padding:      16,
    borderRadius: radius.lg,
    alignItems:   'center',
  },
  submitDisabled: { opacity: 0.38 },
  submitText: {
    color:         colors.textWhite,
    fontSize:      fontSize.h3,
    fontWeight:    '700',
    letterSpacing: 0.5,
  },
});
