/**
 * GlassCard.tsx ── 帶漸層的粉彩玻璃卡片
 * 用 Skia Canvas 在底層繪製 LinearGradient，上層放 children
 */
import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Canvas, RoundedRect, LinearGradient, vec } from '@shopify/react-native-skia';
import { radius as R } from '../theme';

interface GlassCardProps {
  children:     React.ReactNode;
  style?:       ViewStyle | ViewStyle[] | any;
  colorTop?:    string;
  colorBot?:    string;
  borderRadius?: number;
}

export function GlassCard({
  children,
  style,
  colorTop = 'rgba(255,255,255,0.35)',
  colorBot = 'rgba(210,225,245,0.15)',
  borderRadius = R.lg,
}: GlassCardProps) {
  const [w, setW] = React.useState(0);
  const [h, setH] = React.useState(0);

  return (
    <View
      style={[
        { borderRadius, overflow: 'hidden' },
        style,
        { backgroundColor: 'transparent' }, // 最後覆蓋，防止 elevation 強制白底
      ]}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setW(width);
          setH(height);
        }
      }}
    >
      {/* Skia 漸層底板（absolute，不影響 layout）*/}
      {w > 0 && h > 0 && (
        <Canvas
          style={{ position: 'absolute', top: 0, left: 0, width: w, height: h }}
          pointerEvents="none"
        >
          {/* 主體漸層：左上亮白 → 右下帶藍調 */}
          <RoundedRect x={0} y={0} width={w} height={h} r={borderRadius}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(w, h)}
              colors={[colorTop, colorBot]}
            />
          </RoundedRect>
          {/* 頂部高光邊線 */}
          <RoundedRect
            x={0.75} y={0.75}
            width={w - 1.5} height={h - 1.5}
            r={borderRadius - 1}
            color="rgba(255,255,255,0.9)"
            style="stroke" strokeWidth={1.2}
          />
          {/* 底部深色折射線 */}
          <RoundedRect
            x={1.5} y={1.5}
            width={w - 3} height={h - 3}
            r={borderRadius - 2}
            color="rgba(180,195,215,0.25)"
            style="stroke" strokeWidth={0.6}
          />
        </Canvas>
      )}

      {/* 內容層（直接 render，不加 flex:1 避免破壞高度計算）*/}
      {children}
    </View>
  );
}
