/** NeuCard.tsx ── 粉彩玻璃卡片（Glassmorphism 版本）*/
import React from 'react';
import { ViewStyle } from 'react-native';
import { GlassCard } from './GlassCard';

interface NeuCardProps {
  children:   React.ReactNode;
  style?:     ViewStyle;
  /** 右下角光暈滲透色，預設透明 */
  glowColor?: string;
  /** 外層 shadow style（來自 glows.*）*/
  glow?:      ViewStyle;
}

export function NeuCard({
  children,
  style,
  glowColor = 'rgba(255,255,255,0.02)',
  glow,
}: NeuCardProps) {
  return (
    <GlassCard
      style={[glow, style]}
      colorTop="rgba(255,255,255,0.35)"
      colorBot={glowColor}
    >
      {children}
    </GlassCard>
  );
}
