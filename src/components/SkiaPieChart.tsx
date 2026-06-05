/**
 * SkiaPieChart.tsx ── Cyberpunk HUD + Per-Segment Localized SweepGradient
 * 每個分段都有獨立的局部漸層，顏色在切片邊界完美銜接
 */
import React, { useMemo, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import {
  Canvas, Circle, Path, Skia, BlurMask, Group,
  vec, SweepGradient, DashPathEffect, Path1DPathEffect,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue, withRepeat, withTiming,
  useDerivedValue, Easing,
} from 'react-native-reanimated';

export interface ChartSlice {
  label:  string;
  amount: number;
  color:  string;
}

interface SkiaPieChartProps {
  slices:       ChartSlice[];
  size?:        number;
  centerLabel?: string;
}

function fmtCenter(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '萬';
  return Math.round(n).toLocaleString('zh-TW');
}

/** 將 hex / rgba 字串解析為 [r,g,b,a] (0~1) */
function parseColor(c: string): [number, number, number, number] {
  // rgba(r,g,b,a)
  const rgba = c.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/);
  if (rgba) return [+rgba[1]/255, +rgba[2]/255, +rgba[3]/255, rgba[4] !== undefined ? +rgba[4] : 1];
  // #rrggbb / #rgb
  const hex = c.replace('#', '');
  if (hex.length === 3) {
    const [r,g,b] = hex.split('').map(x => parseInt(x+x, 16)/255);
    return [r, g, b, 1];
  }
  const r = parseInt(hex.slice(0,2),16)/255;
  const g = parseInt(hex.slice(2,4),16)/255;
  const b = parseInt(hex.slice(4,6),16)/255;
  return [r, g, b, 1];
}

/** 在兩個顏色之間線性插值，回傳 rgba 字串 */
function lerpColor(a: string, b: string, t: number): string {
  const [ar,ag,ab,aa] = parseColor(a);
  const [br,bg,bb,ba] = parseColor(b);
  const r = Math.round((ar + (br-ar)*t) * 255);
  const g = Math.round((ag + (bg-ag)*t) * 255);
  const b2 = Math.round((ab + (bb-ab)*t) * 255);
  const a2 = aa + (ba-aa)*t;
  return `rgba(${r},${g},${b2},${a2.toFixed(3)})`;
}

export function SkiaPieChart({ slices, size = 120, centerLabel }: SkiaPieChartProps) {
  const PAD    = 26;
  const CANVAS = size + PAD * 2;
  const cx     = CANVAS / 2;
  const cy     = CANVAS / 2;

  const rShield = size * 0.47;
  const rTick   = size * 0.42;
  const rBlock  = size * 0.34;
  const blockW  = size * 0.13;
  const rInner  = size * 0.22;

  const total    = slices.reduce((s, sl) => s + sl.amount, 0);
  const labelTxt = centerLabel ?? (total > 0 ? fmtCenter(total) : '');

  // ── 動畫 ──
  const breathe   = useSharedValue(0);
  const scanClock = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true);
    scanClock.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.linear }), -1, false);
  }, []);

  const scanMatrix = useDerivedValue(() => {
    const m = Skia.Matrix();
    m.rotate(scanClock.value * Math.PI * 2, cx, cy);
    return m.get();
  });

  // ── 樣板路徑（Path1DPathEffect）──
  const tickMark = useMemo(() =>
    Skia.PathBuilder.Make().moveTo(0, -2.5).lineTo(0, 2.5).build()
  , []);

  const shieldDash = useMemo(() =>
    Skia.PathBuilder.Make().addArc({ x: -8, y: -1.5, width: 16, height: 3 }, 180, 180).build()
  , []);

  // ── 每個切片的路徑 + 局部漸層資訊（JS Thread, useMemo）──
  const segments = useMemo(() => {
    if (total === 0) return [];
    const GAP = slices.length > 1 ? 3 : 0;
    const result: {
      path:       ReturnType<typeof Skia.Path.Make>;
      color:      string;
      nextColor:  string;
      startDeg:   number;
      endDeg:     number;
    }[] = [];

    let sd = -90;
    slices.forEach((sl, idx) => {
      const full = (sl.amount / total) * 360;
      if (full < 1) { sd += full; return; }
      const draw = Math.max(0, full - GAP);
      if (draw < 0.5) { sd += full; return; }

      const p = Skia.PathBuilder.Make()
        .addArc(
          { x: cx - rBlock, y: cy - rBlock, width: rBlock * 2, height: rBlock * 2 },
          sd + GAP / 2, draw,
        )
        .build();

      // 下一個切片的顏色（環狀）
      const nextIdx = (idx + 1) % slices.length;
      result.push({
        path:      p,
        color:     sl.color,
        nextColor: slices[nextIdx].color,
        startDeg:  sd + GAP / 2,
        endDeg:    sd + GAP / 2 + draw,
      });
      sd += full;
    });
    return result;
  }, [slices, total, cx, cy, rBlock]);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Canvas style={{ width: CANVAS, height: CANVAS }}>

        {/* ── 背景雷達掃描暈 ── */}
        <Circle cx={cx} cy={cy} r={rShield} opacity={0.12}>
          <SweepGradient
            c={vec(cx, cy)}
            colors={['transparent', 'rgba(160,210,255,0.04)', 'rgba(160,210,255,0.25)', 'transparent']}
            matrix={scanMatrix}
          />
        </Circle>

        {/* ── LAYER 1: 外圍護盾 ── */}
        <Circle cx={cx} cy={cy} r={rShield}
          color="rgba(255,255,255,0.18)" style="stroke" strokeWidth={1}>
          <Path1DPathEffect path={shieldDash} advance={40} phase={0} style="rotate" />
        </Circle>
        <Circle cx={cx} cy={cy} r={rShield - 3}
          color="rgba(255,255,255,0.07)" style="stroke" strokeWidth={0.5} />

        {/* ── LAYER 2: 刻度盤 ── */}
        <Circle cx={cx} cy={cy} r={rTick}
          color="rgba(255,255,255,0.28)" style="stroke" strokeWidth={1}>
          <Path1DPathEffect path={tickMark} advance={7} phase={0} style="rotate" />
        </Circle>
        <Circle cx={cx} cy={cy} r={rTick - 4}
          color="rgba(255,255,255,0.12)" style="stroke" strokeWidth={0.7} />

        {/* ── LAYER 3: 能量槽底座 ── */}
        <Circle cx={cx} cy={cy} r={rBlock} color="#0e1015" style="stroke" strokeWidth={blockW} />

        {/* ── LAYER 4: 分段能量塊（局部 SweepGradient）── */}
        {segments.map((seg, i) => {
          // 局部漸層：從 seg.color 漸變到 nextColor，精確覆蓋此切片的角度範圍
          const startRad = (seg.startDeg * Math.PI) / 180;
          const endRad   = (seg.endDeg   * Math.PI) / 180;
          // 在切片內插入 5 個色階，讓漸層平滑
          const STEPS = 5;
          const gradColors = Array.from({ length: STEPS + 1 }, (_, k) =>
            lerpColor(seg.color, seg.nextColor, k / STEPS),
          );
          // SweepGradient 的 start/end 對應切片角度
          const gradStops = Array.from({ length: STEPS + 1 }, (_, k) => k / STEPS);

          return (
            <Group key={i}>
              {/* 實體方塊 + 局部漸層 */}
              <Path path={seg.path} style="stroke" strokeWidth={blockW}>
                <DashPathEffect intervals={[16, 4]} />
                <SweepGradient
                  c={vec(cx, cy)}
                  colors={gradColors}
                  positions={gradStops}
                  start={startRad}
                  end={endRad}
                />
              </Path>

              {/* 外層廣角 Bloom */}
              <Path path={seg.path} style="stroke" strokeWidth={blockW + 10}
                opacity={0.22} blendMode="screen">
                <DashPathEffect intervals={[16, 4]} />
                <BlurMask blur={10} style="normal" />
                <SweepGradient
                  c={vec(cx, cy)}
                  colors={gradColors}
                  positions={gradStops}
                  start={startRad}
                  end={endRad}
                />
              </Path>

              {/* 中層 Glow */}
              <Path path={seg.path} style="stroke" strokeWidth={blockW + 2}
                opacity={0.55} blendMode="screen">
                <DashPathEffect intervals={[16, 4]} />
                <BlurMask blur={4} style="normal" />
                <SweepGradient
                  c={vec(cx, cy)}
                  colors={gradColors}
                  positions={gradStops}
                  start={startRad}
                  end={endRad}
                />
              </Path>

              {/* 頂部白色亮芯（柔化，避免硬邊突兀）*/}
              <Path path={seg.path} color="rgba(255,255,255,0.28)"
                style="stroke" strokeWidth={blockW * 0.4} blendMode="screen">
                <DashPathEffect intervals={[16, 4]} />
                <BlurMask blur={2.5} style="normal" />
              </Path>
            </Group>
          );
        })}

        {/* 空資料時顯示暗色軌道 */}
        {total === 0 && (
          <Circle cx={cx} cy={cy} r={rBlock}
            color="rgba(255,255,255,0.06)" style="stroke" strokeWidth={blockW} />
        )}

        {/* ── LAYER 5: 內層深色圓盤 ── */}
        <Circle cx={cx} cy={cy} r={rInner} color="#12151c" />
        <Circle cx={cx} cy={cy} r={rInner}
          color="rgba(255,255,255,0.35)" style="stroke" strokeWidth={1.5} />
        <Circle cx={cx} cy={cy} r={rInner - 3}
          color="rgba(255,255,255,0.08)" style="stroke" strokeWidth={0.5} />

      </Canvas>

      {/* 中央文字 */}
      {!!labelTxt && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={sty.centerAmt} numberOfLines={1} adjustsFontSizeToFit>
              {labelTxt}
            </Text>
            <Text style={sty.centerNT}>NT$</Text>
          </View>
        </View>
      )}
      {total === 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={sty.empty}>尚無資料</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const sty = StyleSheet.create({
  centerAmt: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(255,255,255,0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
    width: 64,
    textAlign: 'center',
  },
  centerNT: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginTop: 1,
  },
  empty: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    fontWeight: '600',
  },
});
