/**
 * RobotBubble.tsx ── 浮動財務提示卡（無尾巴，高可讀玻璃白）
 *
 * 兩種模式：
 *   simple  – 只有 message，小巧一列 + 可選 CTA
 *   rich    – title + message + stats + tone accent + X 關閉
 */
import React, { useCallback, useEffect } from 'react';
import {
  StyleSheet, Text, Dimensions, TouchableOpacity, View,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing,
} from 'react-native-reanimated';

const { width: SW } = Dimensions.get('window');

const CARD_MAX_W  = 272;
const CARD_MIN_W  = 200;
const ROBOT_SIZE  = 180;
const CARD_GAP    = 12;   // 卡片與機器人的水平間距

export interface BubbleStat {
  label: string;
  value: string;
}

export type BubbleTone = 'info' | 'good' | 'warning' | 'danger';

export interface RobotBubbleProps {
  message:    string;
  visible:    boolean;
  robotX:     number;
  robotY:     number;
  onRecord?:  () => void;   // CTA「要記帳了嗎？」
  onClose?:   () => void;   // 手動關閉
  // 財務提醒（rich mode）
  title?:     string;
  stats?:     BubbleStat[];
  tone?:      BubbleTone;
}

// ── Tone 色盤（輕量 accent，不大面積上色）
const TONE: Record<BubbleTone, { accent: string; badgeBg: string; badgeBorder: string; text: string }> = {
  info:    { accent: '#38BDF8', badgeBg: 'rgba(56,189,248,0.12)',  badgeBorder: 'rgba(56,189,248,0.30)',  text: '#0369A1' },
  good:    { accent: '#34D399', badgeBg: 'rgba(52,211,153,0.12)',  badgeBorder: 'rgba(52,211,153,0.30)',  text: '#065F46' },
  warning: { accent: '#FB923C', badgeBg: 'rgba(251,146,60,0.12)',  badgeBorder: 'rgba(251,146,60,0.30)',  text: '#9A3412' },
  danger:  { accent: '#F472B6', badgeBg: 'rgba(244,114,182,0.12)', badgeBorder: 'rgba(244,114,182,0.30)', text: '#9D174D' },
};

const TONE_EMOJI: Record<BubbleTone, string> = {
  info:    'ℹ️',
  good:    '✅',
  warning: '⚠️',
  danger:  '🚨',
};

export function RobotBubble({
  message, visible, robotX, robotY,
  onRecord, onClose,
  title, stats, tone,
}: RobotBubbleProps) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(8);
  const scale      = useSharedValue(0.94);

  useEffect(() => {
    if (visible) {
      opacity.value    = withTiming(1,    { duration: 190, easing: Easing.out(Easing.cubic) });
      translateY.value = withTiming(0,    { duration: 230, easing: Easing.out(Easing.cubic) });
      scale.value      = withTiming(1,    { duration: 230, easing: Easing.out(Easing.back(1.15)) });
    } else {
      opacity.value    = withTiming(0,    { duration: 170, easing: Easing.in(Easing.cubic) });
      translateY.value = withTiming(5,    { duration: 150 });
      scale.value      = withTiming(0.96, { duration: 150 });
    }
  }, [visible]);

  // 定位：機器人在右 → 卡片靠左上；在左 → 靠右上
  const isRobotRight = robotX + ROBOT_SIZE / 2 > SW / 2;
  const cardX = isRobotRight
    ? Math.max(8, robotX - CARD_MAX_W - CARD_GAP)
    : Math.min(SW - CARD_MAX_W - 8, robotX + ROBOT_SIZE + CARD_GAP);
  const cardY = Math.max(20, robotY - 20);

  const animStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const handleClose = useCallback(() => onClose?.(), [onClose]);
  const handleRecord = useCallback(() => onRecord?.(), [onRecord]);

  const isRich   = !!(title || (stats && stats.length > 0));
  const tc        = tone ? TONE[tone] : null;

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[styles.card, animStyle, { left: cardX, top: cardY }]}
    >
      {isRich ? (
        /* ══ RICH MODE ══ */
        <>
          {/* 標題列 + X 按鈕 */}
          <View style={styles.titleRow}>
            {/* Tone badge */}
            {tc && (
              <View style={[styles.badge, { backgroundColor: tc.badgeBg, borderColor: tc.badgeBorder }]}>
                <Text style={styles.badgeEmoji}>{TONE_EMOJI[tone!]}</Text>
              </View>
            )}
            <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
            {/* X 關閉按鈕 */}
            <TouchableOpacity
              style={styles.closeBtn}
              activeOpacity={0.65}
              onPress={handleClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 主訊息 */}
          {!!message && (
            <Text style={styles.richMessage}>{message}</Text>
          )}

          {/* Stats 表格 */}
          {stats && stats.length > 0 && (
            <View style={[
              styles.statsBox,
              tc && { borderColor: tc.badgeBorder, backgroundColor: tc.badgeBg },
            ]}>
              {stats.map((s, i) => (
                <View
                  key={i}
                  style={[styles.statRow, i > 0 && styles.statRowBorder]}
                >
                  <Text style={styles.statLabel}>{s.label}</Text>
                  <Text style={[styles.statValue, tc && { color: tc.text }]}>{s.value}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Action 列 */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.dismissBtn}
              activeOpacity={0.70}
              onPress={handleClose}
            >
              <Text style={styles.dismissText}>知道了</Text>
            </TouchableOpacity>
            {onRecord && (
              <TouchableOpacity
                style={styles.ctaBtn}
                activeOpacity={0.72}
                onPress={handleRecord}
              >
                <Text style={styles.ctaText}>要記帳了嗎？</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        /* ══ SIMPLE MODE ══ */
        <>
          <Text style={styles.simpleMessage}>{message}</Text>
          {onRecord && (
            <TouchableOpacity
              style={styles.ctaBtnSimple}
              activeOpacity={0.72}
              onPress={handleRecord}
            >
              <Text style={styles.ctaText}>要記帳了嗎？</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // ── 卡片外殼
  card: {
    position:          'absolute',
    zIndex:            10000,
    elevation:         14,
    maxWidth:          CARD_MAX_W,
    minWidth:          CARD_MIN_W,
    backgroundColor:   'rgba(255,255,255,0.96)',
    borderRadius:      20,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.95)',
    paddingHorizontal: 15,
    paddingVertical:   13,
    shadowColor:       '#334155',
    shadowOffset:      { width: 0, height: 8 },
    shadowOpacity:     0.16,
    shadowRadius:      18,
    overflow:          'hidden',
  },

  // ── Rich mode
  titleRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            7,
    marginTop:      2,
    marginBottom:   8,
  },
  badge: {
    width:          24,
    height:         24,
    borderRadius:   7,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  badgeEmoji: {
    fontSize: 13,
  },
  titleText: {
    flex:       1,
    fontSize:   13,
    fontWeight: '700',
    color:      '#0F172A',
    letterSpacing: 0.1,
  },
  closeBtn: {
    width:          22,
    height:         22,
    borderRadius:   11,
    backgroundColor: 'rgba(100,116,139,0.12)',
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  closeBtnText: {
    fontSize:   11,
    color:      '#64748B',
    fontWeight: '600',
    lineHeight: 14,
  },
  richMessage: {
    fontSize:     13,
    lineHeight:   19,
    color:        '#334155',
    fontWeight:   '500',
    marginBottom: 10,
  },
  statsBox: {
    borderRadius:      11,
    borderWidth:       1,
    borderColor:       'rgba(0,0,0,0.07)',
    backgroundColor:   'rgba(248,250,252,0.92)',
    paddingHorizontal: 11,
    paddingTop:        6,
    paddingBottom:     6,
    marginBottom:      10,
  },
  statRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingVertical: 4,
  },
  statRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.07)',
  },
  statLabel: {
    fontSize:   12,
    color:      '#64748B',
    fontWeight: '500',
  },
  statValue: {
    fontSize:   12,
    fontWeight: '700',
    color:      '#0F172A',
  },
  actionRow: {
    flexDirection: 'row',
    gap:           8,
    marginTop:     2,
  },
  dismissBtn: {
    flex:              1,
    alignItems:        'center',
    paddingVertical:   7,
    borderRadius:      11,
    backgroundColor:   'rgba(100,116,139,0.10)',
    borderWidth:       1,
    borderColor:       'rgba(100,116,139,0.20)',
  },
  dismissText: {
    fontSize:   13,
    fontWeight: '600',
    color:      '#475569',
  },
  ctaBtn: {
    flex:              1,
    alignItems:        'center',
    paddingVertical:   7,
    borderRadius:      11,
    backgroundColor:   'rgba(124,58,237,0.12)',
    borderWidth:       1,
    borderColor:       'rgba(124,58,237,0.30)',
  },
  ctaBtnSimple: {
    alignSelf:         'flex-start',
    marginTop:         9,
    paddingHorizontal: 14,
    paddingVertical:   7,
    borderRadius:      11,
    backgroundColor:   'rgba(124,58,237,0.12)',
    borderWidth:       1,
    borderColor:       'rgba(124,58,237,0.30)',
  },
  ctaText: {
    fontSize:   13,
    fontWeight: '700',
    color:      '#5B21B6',
  },

  // ── Simple mode
  simpleMessage: {
    fontSize:   14,
    lineHeight: 21,
    color:      '#1E293B',
    fontWeight: '500',
  },
});
