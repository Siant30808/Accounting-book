/**
 * PlasmaPieChart.tsx ── 120Hz Cyberpunk 科技雷達儀表版 (Segmented HUD)
 */
import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import {
  Canvas, Circle, Path, Skia,
  BlurMask, Group, vec, SweepGradient,
  DashPathEffect, Path1DPathEffect,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue, withTiming, withRepeat,
  useDerivedValue, Easing,
} from 'react-native-reanimated';

interface PieSlice {
  cat: string;
  amount: number;
  color: string;
}

interface PlasmaPieChartProps {
  slices: PieSlice[];
  size?: number;
}

function formatCenter(total: number): string {
  if (total === 0) return '0';
  if (total >= 10000) return (total / 10000).toFixed(1) + '萬';
  return Math.round(total).toLocaleString('zh-TW');
}

export function PlasmaPieChart({ slices, size = 150 }: PlasmaPieChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const total = slices.reduce((s, sl) => s + sl.amount, 0);

  // ── 雷達各層半徑設定 ──
  const rOuterTech = size * 0.45; // 最外圍科技護盾圈
  const rTick      = size * 0.40; // 細緻刻度盤
  const rBlock     = size * 0.32; // 核心能量塊圈
  const blockW     = size * 0.12; // 能量塊的厚度
  const rInner     = size * 0.22; // 內層深灰圓盤

  // ── 動畫時鐘 (UI Thread) ──
  const progressAnim = useSharedValue(0);
  const breatheAnim  = useSharedValue(0);
  const scanClock    = useSharedValue(0);

  useEffect(() => {
    progressAnim.value = 0;
    progressAnim.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.back(1.5)) });

    breatheAnim.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      -1, true
    );

    scanClock.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.linear }),
      -1, false
    );
  }, [slices]);

  const glowBlur   = useDerivedValue(() => 4 + breatheAnim.value * 6);
  const scanMatrix = useDerivedValue(() => {
    const m = Skia.Matrix();
    m.translate(cx, cy);
    m.rotate(scanClock.value * Math.PI * 2);
    m.translate(-cx, -cy);
    return m.get();
  });

  // ── 科技刻度與護盾樣板路徑 ──
  const tickMark = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(0, -3); p.lineTo(0, 3);
    return p;
  }, []);

  const outerDash = useMemo(() => {
    const p = Skia.Path.Make();
    p.addArc({ x: -10, y: -2, width: 20, height: 4 }, 180, 180);
    return p;
  }, []);

  // ── 靜態切片路徑（避免 Worklet 中呼叫 Skia.Path.Make）──
  const staticSlices = useMemo(() => {
    let startAngle = -90;
    return slices.map(sl => {
      const sweepAngle = total ? (sl.amount / total) * 360 : 0;
      const p = Skia.Path.Make();
      if (sweepAngle > 1.5) {
        p.addArc(
          { x: cx - rBlock, y: cy - rBlock, width: rBlock * 2, height: rBlock * 2 },
          startAngle + 1.5,
          sweepAngle - 1.5
        );
      }
      startAngle += sweepAngle;
      return { path: p, color: sl.color };
    });
  }, [slices, total, cx, cy, rBlock]);

  // ── 展開動畫用的 clip 路徑（僅裁切進度用）──
  const progressPath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const sweep = 360 * progressAnim.value;
    if (sweep > 0) {
      p.addArc(
        { x: cx - rBlock - blockW, y: cy - rBlock - blockW,
          width:  (rBlock + blockW) * 2,
          height: (rBlock + blockW) * 2 },
        -90, sweep
      );
      // 封閉扇形 clip
      p.lineTo(cx, cy);
      p.close();
    }
    return p;
  });

  return (
    <View style={styles.container}>
      <Canvas style={{ width: size, height: size }}>

        {/* ═══ 背景雷達掃描層 ═══ */}
        <Circle cx={cx} cy={cy} r={rOuterTech} opacity={0.15}>
          <SweepGradient
            c={vec(cx, cy)}
            colors={['transparent', 'rgba(150,200,255,0.05)', 'rgba(150,200,255,0.3)', 'transparent']}
            matrix={scanMatrix}
          />
        </Circle>

        {/* ═══ LAYER 1: 外圍科技護盾 ═══ */}
        <Circle cx={cx} cy={cy} r={rOuterTech} color="rgba(255,255,255,0.15)" style="stroke" strokeWidth={1}>
          <Path1DPathEffect path={outerDash} advance={45} phase={0} style="rotate" />
        </Circle>
        <Circle cx={cx} cy={cy} r={rOuterTech - 3} color="rgba(255,255,255,0.08)" style="stroke" strokeWidth={0.5} />

        {/* ═══ LAYER 2: 細緻刻度盤 ═══ */}
        <Circle cx={cx} cy={cy} r={rTick} color="rgba(255,255,255,0.3)" style="stroke" strokeWidth={1}>
          <Path1DPathEffect path={tickMark} advance={8} phase={0} style="rotate" />
        </Circle>
        <Circle cx={cx} cy={cy} r={rTick - 4} color="rgba(255,255,255,0.15)" style="stroke" strokeWidth={1} />

        {/* ═══ LAYER 3: 深色能量槽底座 ═══ */}
        <Circle cx={cx} cy={cy} r={rBlock} color="#111318" style="stroke" strokeWidth={blockW} />

        {/* ═══ LAYER 4: 核心分段能量塊 ═══ */}
        {total > 0 && staticSlices.map((sl, i) => (
          <Group key={i}>
            {/* 實體能量方塊 */}
            <Path path={sl.path} color={sl.color} style="stroke" strokeWidth={blockW}>
              <DashPathEffect intervals={[18, 4]} />
            </Path>
            {/* 霓虹發光層 */}
            <Path path={sl.path} color={sl.color} style="stroke" strokeWidth={blockW} opacity={0.8} blendMode="screen">
              <DashPathEffect intervals={[18, 4]} />
              <BlurMask blur={glowBlur} style="normal" />
            </Path>
          </Group>
        ))}

        {/* ═══ LAYER 5: 內層深灰圓盤 ═══ */}
        <Circle cx={cx} cy={cy} r={rInner} color="#1A1D24">
          <BlurMask blur={4} style="inner" />
        </Circle>
        <Circle cx={cx} cy={cy} r={rInner} color="rgba(255,255,255,0.4)" style="stroke" strokeWidth={1.5} />
        <Circle cx={cx} cy={cy} r={rInner - 3} color="rgba(255,255,255,0.1)" style="stroke" strokeWidth={0.5} />

      </Canvas>

      {/* ═══ 中心數據文字 ═══ */}
      <View style={styles.centerTextContainer}>
        {total > 0 ? (
          <>
            <Text style={styles.valueText}>{formatCenter(total)}</Text>
            <Text style={styles.currencyText}>NT$</Text>
          </>
        ) : (
          <Text style={styles.emptyText}>尚無資料</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  centerTextContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  valueText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: 1,
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  currencyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 1.5,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    fontWeight: '600',
  },
});
