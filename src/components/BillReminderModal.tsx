import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Bill, Period, getCatIcon } from '../types';
import { localDateStr, getDueDateInPeriod } from '../utils/period';
import { fmt } from '../utils/format';
import { colors, radius, spacing, fontSize } from '../theme';

interface Props {
  visible:  boolean;
  bills:    Bill[];
  period:   Period;
  onMarkPaid: (id: number) => void;
  onClose:    (dismissToday: boolean) => void;
}

export function BillReminderModal({ visible, bills, period, onMarkPaid, onClose }: Props) {
  const [dismissToday, setDismissToday] = React.useState(false);
  const todayStr = localDateStr(new Date());

  React.useEffect(() => {
    if (visible) setDismissToday(false);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => onClose(dismissToday)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onClose(dismissToday)} />
        <View style={styles.modalBox}>
          <View style={styles.dragHandle} />
          <View style={styles.titleRow}>
            <Feather name="bell" size={18} color={colors.savings} />
            <Text style={styles.title}>固定帳單提醒</Text>
          </View>
          <Text style={styles.sub}>本期（{period.label}）尚有未處理的帳單</Text>

          <ScrollView style={{ maxHeight: 320 }}>
            {bills.map(bill => {
              const due = getDueDateInPeriod(bill.dueDay, period);
              const dueStr = localDateStr(due);
              const overdue = !bill.autoDeduct && todayStr > dueStr;
              return (
                <View key={bill.id} style={styles.billRow}>
                  <View style={styles.billIconBox}>
                    <Text style={styles.billIcon}>{getCatIcon(bill.cat)}</Text>
                  </View>
                  <View style={styles.billInfo}>
                    <Text style={styles.billName}>{bill.name}</Text>
                    <View style={styles.billMetaRow}>
                      <Text style={styles.billMeta}>{due.getMonth() + 1}/{due.getDate()} 到期</Text>
                      {bill.autoDeduct ? (
                        <View style={[styles.tag, styles.tagAuto]}>
                          <Text style={[styles.tagText, { color: colors.credit }]}>自動扣繳</Text>
                        </View>
                      ) : overdue ? (
                        <View style={[styles.tag, styles.tagOverdue]}>
                          <Text style={[styles.tagText, { color: colors.expense }]}>逾期未繳</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.billAmount}>{fmt(bill.amount)}</Text>
                  {!bill.autoDeduct && (
                    <Pressable style={styles.payBtn} onPress={() => onMarkPaid(bill.id)}>
                      <Text style={styles.payBtnText}>已繳費</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <Pressable style={styles.dismissRow} onPress={() => setDismissToday(v => !v)}>
            <View style={[styles.checkbox, dismissToday && styles.checkboxActive]}>
              {dismissToday && <Feather name="check" size={14} color="#fff" />}
            </View>
            <Text style={styles.dismissText}>今日不再提醒</Text>
          </Pressable>

          <Pressable style={styles.closeBtn} onPress={() => onClose(dismissToday)}>
            <Text style={styles.closeBtnText}>關閉</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBox: {
    backgroundColor:      'rgba(255,255,255,0.96)',
    borderTopLeftRadius:  radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: 22,
    paddingBottom: 36,
    borderWidth:   1,
    borderColor:   'rgba(255,255,255,0.80)',
  },
  dragHandle: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: fontSize.h2, fontWeight: '700', color: colors.textPrimary },
  sub:   { fontSize: fontSize.base, color: colors.textMuted, marginBottom: spacing.lg },

  billRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
  },
  billIconBox: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(167,139,250,0.15)',
  },
  billIcon: { fontSize: 18 },
  billInfo: { flex: 1, minWidth: 0 },
  billName: { fontSize: fontSize.lg, fontWeight: '600', color: colors.textPrimary },
  billMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  billMeta: { fontSize: fontSize.sm, color: colors.textMuted },
  tag: { borderRadius: radius.xs, paddingHorizontal: 6, paddingVertical: 1 },
  tagAuto:    { backgroundColor: 'rgba(56,189,248,0.15)' },
  tagOverdue: { backgroundColor: 'rgba(244,114,182,0.15)' },
  tagText: { fontSize: fontSize.xs, fontWeight: '700' },
  billAmount: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary, marginRight: spacing.sm },

  payBtn: {
    backgroundColor: 'rgba(52,211,153,0.15)', borderWidth: 1.5, borderColor: 'rgba(52,211,153,0.40)',
    borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  payBtnText: { fontSize: fontSize.base, fontWeight: '700', color: colors.income },

  dismissRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md },
  checkbox: {
    width: 20, height: 20, borderRadius: radius.xs, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.savings, borderColor: colors.savings },
  dismissText: { fontSize: fontSize.lg, color: colors.textSecondary },

  closeBtn: {
    padding: spacing.lg, borderRadius: radius.md, alignItems: 'center',
    backgroundColor: 'rgba(167,139,250,0.15)', borderWidth: 1.5, borderColor: 'rgba(167,139,250,0.40)',
  },
  closeBtnText: { fontSize: fontSize.xl, fontWeight: '700', color: colors.savings },
});
