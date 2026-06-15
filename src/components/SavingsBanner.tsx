/**
 * SavingsBanner — 動態極光存款卡片（新擬物化版）
 *
 * 結構：
 *   外殼 View（shadow，無 overflow:hidden） → 新擬物化陰影顯示
 *   Pressable（overflow:hidden） → Canvas 圓角裁切
 *     Layer 0: Skia Canvas absoluteFill → 3 色塊極光漂移
 *     Layer 1: 文字
 *     Layer 2: 小豬
 *   左上高光邊框（absoluteFill，pointerEvents:none）
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import {
  Canvas, Circle, BlurMask, Rect,
} from '@shopify/react-native-skia';
import {
  useSharedValue, withRepeat, withTiming,
  useDerivedValue, Easing,
} from 'react-native-reanimated';
import { PigSavings } from './PigSavings';
import { fmt } from '../utils/format';

interface SavingsBannerProps {
  totalSavings: number;
  onPress:      () => void;
}

const CARD_H  = 120;
const BLUR_R  = 40;   // 液態融合模糊半徑

export function SavingsBanner({ totalSavings, onPress }: SavingsBannerProps) {

  // ── 三個獨立週期時鐘（LinearEasing，確保無限均速循環）──
  const timeA = useSharedValue(0);
  const timeB = useSharedValue(0);
  const timeC = useSharedValue(0);

  useEffect(() => {
    // 關鍵修正：時鐘直接存相位角度（0 → 2π）
    // sin/cos 在 0 和 2π 的值完全相同 → 循環邊界無縫閉合，零跳針
    timeA.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 3000, easing: Easing.linear }), -1, false,
    );
    timeB.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 4500, easing: Easing.linear }), -1, false,
    );
    timeC.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 6000, easing: Easing.linear }), -1, false,
    );
  }, []);

  // ── 色塊 A：主紫，橢圓軌道（只用整數倍相位，頭尾值相同確保無縫循環）──
  const aX = useDerivedValue(() => {
    'worklet';
    return 80 + Math.cos(timeA.value) * 90;
  });
  const aY = useDerivedValue(() => {
    'worklet';
    return CARD_H * 0.5 + Math.sin(timeB.value) * CARD_H * 0.35;
  });
  const aR = useDerivedValue(() => {
    'worklet';
    return 80 + Math.sin(timeC.value) * 18;
  });

  // ── 色塊 B：亮紫，斜向漂移 ──
  const bX = useDerivedValue(() => {
    'worklet';
    return 220 + Math.cos(timeB.value) * 80;
  });
  const bY = useDerivedValue(() => {
    'worklet';
    return CARD_H * 0.4 + Math.sin(timeA.value) * CARD_H * 0.4;
  });
  const bR = useDerivedValue(() => {
    'worklet';
    return 90 + Math.cos(timeC.value) * 20;
  });

  // ── 色塊 C：賽博藍，慢速大圓 ──
  const cX = useDerivedValue(() => {
    'worklet';
    return 160 + Math.sin(timeC.value) * 100;
  });
  const cY = useDerivedValue(() => {
    'worklet';
    return CARD_H * 0.55 + Math.cos(timeB.value) * CARD_H * 0.4;
  });
  const cR = useDerivedValue(() => {
    'worklet';
    return 100 + Math.sin(timeA.value) * 22;
  });

  return (
    <View style={styles.outerShell}>
      <Pressable onPress={onPress} style={styles.card}>

        {/* ── Layer 0: 動態極光 Canvas ── */}
        <Canvas style={StyleSheet.absoluteFill}>
          {/* 深紫底色 */}
          <Rect x={0} y={0} width={800} height={CARD_H} color="#2D1B69" />

          {/* 色塊 A（每個 Circle 各自加 BlurMask，才能真正模糊）*/}
          <Circle cx={aX} cy={aY} r={aR} color="rgba(121,82,156,0.88)">
            <BlurMask blur={BLUR_R} style="normal" />
          </Circle>
          {/* 色塊 B */}
          <Circle cx={bX} cy={bY} r={bR} color="rgba(168,85,247,0.70)">
            <BlurMask blur={BLUR_R} style="normal" />
          </Circle>
          {/* 色塊 C */}
          <Circle cx={cX} cy={cY} r={cR} color="rgba(79,70,229,0.60)">
            <BlurMask blur={BLUR_R} style="normal" />
          </Circle>
        </Canvas>

        {/* ── Layer 1: 文字 ── */}
        <View style={styles.textCol}>
          <View style={styles.labelRow}>
            <Text style={styles.labelIcon}>🗂️</Text>
            <Text style={styles.labelTxt}>當前存款（自動計算）</Text>
          </View>
          <Text style={styles.amountTxt} numberOfLines={1} adjustsFontSizeToFit>
            {fmt(totalSavings)}
          </Text>
          <Text style={styles.subTxt}>存款基準 + 本期結餘｜點擊更新基準</Text>
        </View>

        {/* ── Layer 2: 水晶小豬 ── */}
        <View style={styles.pigCol}>
          <PigSavings onPress={onPress} />
        </View>

        {/* ── 左上白色高光亮邊（新擬物化語彙，pointerEvents:none）── */}
        <View style={styles.highlight} pointerEvents="none" />

      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // 外殼：只負責陰影，不裁切內容
  outerShell: {
    marginHorizontal: 14,
    marginBottom:     14,
    borderRadius:     20,
    // 右下深色沉浸陰影（新擬物化規格）
    shadowColor:      '#000000',
    shadowOffset:     { width: 4, height: 4 },
    shadowOpacity:    0.18,
    shadowRadius:     6,
    elevation:        6,
  },

  // 卡片本體：overflow:hidden 裁切 Canvas 與小豬光暈以外的內容
  card: {
    height:        CARD_H,
    borderRadius:  20,
    overflow:      'hidden',
    flexDirection: 'row',
    alignItems:    'center',
  },

  // 左上白色高光亮邊（絕對定位，覆蓋在所有 Layer 之上）
  highlight: {
    position:      'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius:  20,
    borderTopWidth:  1.8,
    borderLeftWidth: 1.8,
    borderBottomWidth: 0,
    borderRightWidth:  0,
    borderColor:   'rgba(255,255,255,0.45)',
  },

  // 文字欄
  textCol: {
    flex:            1,
    paddingLeft:     18,
    paddingVertical: 14,
    paddingRight:    8,
    zIndex:          1,
  },
  labelRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  labelIcon: { fontSize: 16 },
  labelTxt:  { fontSize: 13, color: 'rgba(255,255,255,0.88)', fontWeight: '500' },
  amountTxt: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 6 },
  subTxt:    { fontSize: 11, color: 'rgba(255,255,255,0.62)' },

  // 小豬欄
  pigCol: {
    width:          130,
    height:         CARD_H,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'visible',
    zIndex:         1,
  },
});
