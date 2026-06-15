import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { textShadows } from '../theme';

interface LegendItem {
  label:  string;
  amount: number;
  color:  string;
  total:  number;
}

export function PieLegend({ items }: { items: LegendItem[] }) {
  return (
    <View style={styles.grid}>
      {items.slice(0, 4).map((item, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: item.color }]} />
          <Text style={styles.label} numberOfLines={1}>{item.label}</Text>
          <Text style={styles.pct}>
            {item.total ? Math.round((item.amount / item.total) * 100) : 0}%
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid:  { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 4 },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' },
  dot:   { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  label: { flex: 1, fontSize: 11, color: '#475569', ...textShadows.light },
  pct:   { fontSize: 11, fontWeight: '700', color: '#1E293B', ...textShadows.heavy },
});
