import 'react-native-reanimated';
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, fontSize } from './src/theme';
import { HomeScreen }     from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ReportScreen }   from './src/screens/ReportScreen';
import { ShoppingScreen } from './src/screens/ShoppingScreen';
import { useBudgetStore, hydrateStore } from './src/store/useBudgetStore';

type Tab = 'home' | 'report' | 'shopping' | 'settings';

const TABS: { key: Tab; icon: React.ComponentProps<typeof Feather>['name']; label: string }[] = [
  { key: 'home',     icon: 'home',         label: '主頁' },
  { key: 'report',   icon: 'bar-chart-2',  label: '報表' },
  { key: 'shopping', icon: 'shopping-bag', label: '採購' },
  { key: 'settings', icon: 'settings',     label: '設定' },
];

function AppInner() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const checkPeriodRollover = useBudgetStore(s => s.checkPeriodRollover);
  const hydrated = useBudgetStore(s => s.hydrated);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    hydrateStore().then(() => { checkPeriodRollover(); });
  }, []);

  // 資料載入中，顯示過渡畫面
  if (!hydrated) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.savings} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {activeTab === 'home'     && <HomeScreen />}
        {activeTab === 'report'   && <ReportScreen />}
        {activeTab === 'shopping' && <ShoppingScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </View>

      {/* Tab bar 自動避開系統導航列 */}
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.key)}
            >
              <Feather
                name={tab.icon}
                size={22}
                color={active ? '#1A1A1A' : '#aaa'}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: colors.appBg },
  loadingScreen:  { flex: 1, backgroundColor: colors.appBg, alignItems: 'center', justifyContent: 'center' },
  content:        { flex: 1 },
  tabBar: {
    flexDirection:   'row',
    backgroundColor: colors.tabBar,
    borderTopWidth:  1,
    borderTopColor:  'rgba(220,225,230,0.8)',
    paddingTop:      8,
    elevation:       10,
  },
  tabItem:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingBottom: 4 },
  tabLabel:       { fontSize: fontSize.sm, fontWeight: '600', color: '#aaa' },
  tabLabelActive: { color: colors.textPrimary },
});
