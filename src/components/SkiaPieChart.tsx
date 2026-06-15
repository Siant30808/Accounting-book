/**
 * SkiaPieChart.tsx ── 旗艦級環形圖 (Frosted Jelly Donut)
 *
 * 分層渲染：
 *   Layer 0  玻璃溝槽底座（三層：深色陰影 + 白霧 + 內陰影）
 *   Layer 1  彩色果凍條（光暈 bloom + 本體 + 高光 gloss）
 *   Layer 2  中心文字（Canvas 外，白色雙層投影）
 *
 * 生長動畫：Skia Group transform scale 0→1，純 UI thread，無 JS re-render
 */
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import {
  Canvas, Path, Circle, BlurMask, Group, Skia, vec,
} from '@shopify/react-native-skia';
import {
  useSharedValue, withSpring, useDerivedValue,
} from 'react-native-reanimated';

export interface ChartSlice {
  label:  string;
  amount: number;
  color:  string;
}

interface SkiaPieChartProps {
  slices: ChartSlice[];
  size?:  number;
}

function fmtCenter(n: number): string {
  if (n === 0) return '0';
  if (n >= 10000) return (n / 10000).toFixed(1) + '萬';
  return Math.round(n).toLocaleString('zh-TW');
}

/** 把角度（度數）轉成弧弦坐標 */
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** 建立單段弧線的 SVG path d 字串（只 stroke） */
function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  const clamped = Math.min(sweepDeg, 359.9);
  const endDeg  = startDeg + clamped;
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${clamped > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

interface SlicePath { d: string; color: string }

function buildPaths(
  slices: ChartSlice[], total: number,
  cx: number, cy: number, r: number,
  gapDeg: number,
): SlicePath[] {
  if (total === 0 || slices.length === 0) return [];
  const actualGap = slices.length > 1 ? gapDeg : 0;
  const available = 360 - actualGap * slices.length;
  let cursor = 0;
  return slices.map(sl => {
    const sweep = (sl.amount / total) * available;
    const d = arcPath(cx, cy, r, cursor, sweep);
    cursor += sweep + actualGap;
    return { d, color: sl.color };
  });
}

export function SkiaPieChart({ slices, size = 160 }: SkiaPieChartProps) {
  const cx      = size / 2;
  const cy      = size / 2;
  const r       = size * 0.38;
  const strokeW = size * 0.12;
  const GAP     = 8;

  const total = useMemo(() => slices.reduce((s, sl) => s + sl.amount, 0), [slices]);
  const paths = useMemo(
    () => buildPaths(slices, total, cx, cy, r, GAP),
    [slices, total, size],
  );

  // ── 圓形剪裁遮罩（memoized，避免每 frame 重建 Skia 物件）──
  const clipPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(cx, cy, r + strokeW / 2);
    return p;
  }, [cx, cy, r, strokeW]);

  // ── 生長動畫：scale 0.01 → 1（純 UI thread）──
  const growScale = useSharedValue(0.01);

  useEffect(() => {
    growScale.value = 0.01;
    growScale.value = withSpring(1, { damping: 14, stiffness: 120, mass: 0.8 });
  }, [slices]);

  // Skia Group transform 需要 useDerivedValue
  const transform = useDerivedValue(() => [
    { translateX: cx },
    { translateY: cy },
    { scale: growScale.value },
    { translateX: -cx },
    { translateY: -cy },
  ]);

  return (
    <View style={{ width: size, height: size }}>
      <Canvas style={{ width: size, height: size }}>
        <Group transform={transform} clip={clipPath}>

          {/* ═════ Layer 0：玻璃溝槽底座 ═════ */}
          {/* 最底層：深色投影，塑造凹槽深度 */}
          <Circle cx={cx} cy={cy} r={r} color="rgba(0,0,0,0.15)" style="stroke" strokeWidth={strokeW} />
          {/* 中間層：白霧，玻璃材質感 */}
          <Circle cx={cx} cy={cy} r={r} color="rgba(255,255,255,0.40)" style="stroke" strokeWidth={strokeW} />
          {/* 頂層：內陰影，凹槽立體感靈魂 */}
          <Circle cx={cx} cy={cy} r={r} color="rgba(0,0,0,0.20)" style="stroke" strokeWidth={strokeW}>
            <BlurMask blur={3} style="inner" />
          </Circle>

          {/* ═════ Layer 1：彩色果凍條 ═════ */}
          {paths.map((sl, i) => (
            <Group key={i}>
              {/* 底部光暈 Bloom（調低透明度，避免搶走本體質感）*/}
              <Path
                path={sl.d}
                color={sl.color}
                style="stroke"
                strokeWidth={strokeW}
                strokeCap="round"
                opacity={0.3}
              >
                <BlurMask blur={8} style="normal" />
              </Path>
              {/* 果凍本體（提升 opacity 確保飽和度）*/}
              <Path
                path={sl.d}
                color={sl.color}
                style="stroke"
                strokeWidth={strokeW}
                strokeCap="round"
                opacity={0.9}
              />
              {/* 頂部高光 Glaze — 微上偏模擬凸面玻璃反光 */}
              <Path
                path={sl.d}
                color="rgba(255,255,255,0.70)"
                style="stroke"
                strokeWidth={strokeW * 0.4}
                strokeCap="round"
                transform={[{ translateY: -strokeW * 0.1 }]}
              >
                <BlurMask blur={1.5} style="normal" />
              </Path>
            </Group>
          ))}

        </Group>
      </Canvas>

      {/* ═════ Layer 2：中心文字（Canvas 外） ═════ */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.centerWrap}>
          {total === 0 ? (
            <Text style={styles.emptyText}>尚無資料</Text>
          ) : (
            <>
              <Text style={styles.amountText}>{fmtCenter(total)}</Text>
              <Text style={styles.currencyText}>NT$</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 白色 + 雙層投影（無論背景深淺都清晰）
  amountText: {
    color:            '#FFFFFF',
    fontSize:         22,
    fontWeight:       '800',
    letterSpacing:    0.5,
    textShadowColor:  'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  currencyText: {
    color:            'rgba(255,255,255,0.75)',
    fontSize:         11,
    fontWeight:       '700',
    marginTop:        2,
    letterSpacing:    1,
    textShadowColor:  'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  emptyText: {
    color:            'rgba(255,255,255,0.6)',
    fontSize:         13,
    fontWeight:       '600',
    textShadowColor:  'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
