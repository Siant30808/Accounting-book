/**
 * FabRobot.tsx ── 機器人外殼版 v4（雙路徑 backing + visible，外殼 PNG 最上層）
 */
import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { PanResponder, Dimensions } from 'react-native';
import {
  Canvas, Circle, Group, BlurMask,
  Path, Skia, Mask, RadialGradient,
  useImage, Image as SkiaImage, RoundedRect, vec,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue, withTiming, withRepeat, withSequence,
  useDerivedValue, withSpring, useAnimatedStyle,
  Easing,
} from 'react-native-reanimated';
import { useBudgetStore } from '../store/useBudgetStore';

const { width: SW, height: SH } = Dimensions.get('window');

// ── 機器人本體尺寸
const ROBOT_SIZE   = 140;
const SHADOW_PAD   = 20;
const OUTER_SIZE   = ROBOT_SIZE + SHADOW_PAD * 2;  // 180
const OUTER_CENTER = OUTER_SIZE / 2;               // 90

// ── 可見面板控制點（貼合外殼洞口）
const FV_X = ROBOT_SIZE * 0.205;  // 28.7
const FV_Y = ROBOT_SIZE * 0.305;  // 42.7
const FV_W = ROBOT_SIZE * 0.590;  // 82.6
const FV_H = ROBOT_SIZE * 0.445;  // 62.3

// ── Backing 面板控制點（略大，填滿所有空隙，外殼 PNG 負責遮邊）
const FB_X = FV_X - ROBOT_SIZE * 0.020;  // 25.9
const FB_Y = FV_Y - ROBOT_SIZE * 0.012;  // 41.0
const FB_W = FV_W + ROBOT_SIZE * 0.040;  // 88.2
const FB_H = FV_H + ROBOT_SIZE * 0.055;  // 70.0

// ── 面罩中心（用於表情定位）
const FACE_CX = FV_X + FV_W / 2;
const FACE_CY = FV_Y + FV_H * 0.47;

// 建立符合洞口形狀的 Path（上寬、側直、下方兩側內收）
function makeFacePath(x: number, y: number, w: number, h: number) {
  const p = Skia.Path.Make();
  // 上邊：略帶弧度
  p.moveTo(x + w * 0.15, y);
  p.quadTo(x + w * 0.50, y - ROBOT_SIZE * 0.008, x + w * 0.85, y);
  // 右上圓角
  p.quadTo(x + w, y + h * 0.02, x + w, y + h * 0.18);
  // 右側往下
  p.lineTo(x + w, y + h * 0.70);
  // 右下內收（避免臉頰露餡）
  p.quadTo(x + w * 0.97, y + h * 0.92, x + w * 0.82, y + h);
  // 下邊
  p.quadTo(x + w * 0.50, y + h + ROBOT_SIZE * 0.008, x + w * 0.18, y + h);
  // 左下內收
  p.quadTo(x + w * 0.03, y + h * 0.92, x, y + h * 0.70);
  // 左側往上
  p.lineTo(x, y + h * 0.18);
  // 左上圓角
  p.quadTo(x, y + h * 0.02, x + w * 0.15, y);
  p.close();
  return p;
}

const FACE_VISIBLE_PATH = makeFacePath(FV_X, FV_Y, FV_W, FV_H);
const FACE_BACKING_PATH = makeFacePath(FB_X, FB_Y, FB_W, FB_H);

// ── LED 點陣（依可見面板 bounding box 生成，由 FACE_VISIBLE_PATH 裁切）
const FACE_LED_GRID = (() => {
  const path = Skia.Path.Make();
  const gap  = 2.2;
  const dotR = 0.45;
  const pad  = 7;
  for (let x = FV_X + pad; x < FV_X + FV_W - pad; x += gap) {
    for (let y = FV_Y + pad; y < FV_Y + FV_H - pad; y += gap) {
      path.addCircle(x, y, dotR);
    }
  }
  return path;
})();

// ── 額頭燈槽（略微下移入槽）
const TOP_SLOT_Y  = ROBOT_SIZE * 0.255;
const TOP_SLOT_H  = ROBOT_SIZE * 0.040;
const TOP_LIGHT_X = ROBOT_SIZE * 0.405;
const TOP_LIGHT_Y = TOP_SLOT_Y + ROBOT_SIZE * 0.008;
const TOP_LIGHT_W = ROBOT_SIZE * 0.190;
const TOP_LIGHT_H = TOP_SLOT_H * 0.82;
const TOP_LIGHT_R = TOP_LIGHT_H / 2;

// ── 下巴燈槽
const BOTTOM_SLOT_Y  = ROBOT_SIZE * 0.785;
const BOTTOM_SLOT_H  = ROBOT_SIZE * 0.032;
const BOTTOM_LIGHT_X = ROBOT_SIZE * 0.435;
const BOTTOM_LIGHT_Y = BOTTOM_SLOT_Y + ROBOT_SIZE * 0.004;
const BOTTOM_LIGHT_W = ROBOT_SIZE * 0.130;
const BOTTOM_LIGHT_H = BOTTOM_SLOT_H * 0.84;
const BOTTOM_LIGHT_R = BOTTOM_LIGHT_H / 2;

// ── 情緒顏色
const STAGES = [
  { name: 'happy',   color: '#00ff33', dark: '#0a2e0e', glow: '#00ff33' },
  { name: 'normal',  color: '#00ffff', dark: '#001a33', glow: '#00ffff' },
  { name: 'nervous', color: '#ffea00', dark: '#332b00', glow: '#ffea00' },
  { name: 'angry',   color: '#ff0033', dark: '#330008', glow: '#ff0033' },
  { name: 'dizzy',   color: '#e600ff', dark: '#2a0033', glow: '#e600ff' },
] as const;

// ── 呼吸燈動畫參數（各 stage 不同節奏）
const LIGHT_ANIM = {
  happy:   { duration: 1800, min: 0.35, max: 1.00, glowScale: 1.00 },
  normal:  { duration: 2400, min: 0.25, max: 0.88, glowScale: 0.80 },
  nervous: { duration: 1400, min: 0.30, max: 1.00, glowScale: 1.10 },
  angry:   { duration:  900, min: 0.35, max: 1.00, glowScale: 1.20 },
  dizzy:   { duration:  380, min: 0.10, max: 1.00, glowScale: 1.35 },
} as const;

// ── 表情路徑（以面罩中心為基準）
function buildFacePath(name: string, blink: number): ReturnType<typeof Skia.Path.Make> {
  const p      = Skia.Path.Make();
  const cx     = FACE_CX;
  const cy     = FACE_CY;
  const eyeY   = cy - 8;
  const lx     = cx - 16;
  const rx     = cx + 16;
  const eHW    = 5;
  const mouthY = cy + 12;
  const closed = blink === 0;

  switch (name) {
    case 'happy':
      if (closed) {
        p.addRect({ x: lx - eHW, y: eyeY, width: eHW * 2, height: 0.9 });
        p.addRect({ x: rx - eHW, y: eyeY, width: eHW * 2, height: 0.9 });
      } else {
        p.addArc({ x: lx - eHW, y: eyeY - 5, width: eHW * 2, height: 8 }, 180, 180);
        p.addArc({ x: rx - eHW, y: eyeY - 5, width: eHW * 2, height: 8 }, 180, 180);
      }
      p.addArc({ x: cx - 8, y: mouthY - 2, width: 16, height: 8 }, 0, 180);
      break;
    case 'nervous':
      if (closed) {
        p.addRect({ x: lx - eHW, y: eyeY, width: eHW * 2, height: 0.9 });
        p.addRect({ x: rx - eHW, y: eyeY, width: eHW * 2, height: 0.9 });
      } else {
        p.moveTo(lx - eHW, eyeY - 3); p.lineTo(lx + eHW, eyeY + 2);
        p.moveTo(rx - eHW, eyeY + 2); p.lineTo(rx + eHW, eyeY - 3);
      }
      p.addCircle(cx, mouthY + 2, 2);
      break;
    case 'angry':
      p.moveTo(lx - eHW, eyeY + 2); p.lineTo(lx + eHW, eyeY - 3);
      p.moveTo(rx - eHW, eyeY - 3); p.lineTo(rx + eHW, eyeY + 2);
      p.addRect({ x: cx - 8, y: mouthY + 1, width: 16, height: 2 });
      break;
    case 'dizzy': {
      const d = 4;
      p.moveTo(lx - d, eyeY - d); p.lineTo(lx + d, eyeY + d);
      p.moveTo(lx + d, eyeY - d); p.lineTo(lx - d, eyeY + d);
      p.moveTo(rx - d, eyeY - d); p.lineTo(rx + d, eyeY + d);
      p.moveTo(rx + d, eyeY - d); p.lineTo(rx - d, eyeY + d);
      p.moveTo(cx - 6, mouthY); p.lineTo(cx - 3, mouthY - 3);
      p.lineTo(cx + 3, mouthY); p.lineTo(cx + 6, mouthY - 3);
      break;
    }
    default: {
      const eyeH = closed ? 0.9 : 7;
      p.addRect({ x: lx - eHW, y: eyeY - eyeH / 2, width: eHW * 2, height: eyeH });
      p.addRect({ x: rx - eHW, y: eyeY - eyeH / 2, width: eHW * 2, height: eyeH });
      p.addRect({ x: cx - 6,   y: mouthY,           width: 12,      height: 1.8 });
      break;
    }
  }
  return p;
}

interface FabRobotProps {
  budgetPct?: number;
  /** 點擊時帶出機器人當前位置（px, py），供泡泡定位使用 */
  onPress?:   (px: number, py: number) => void;
}

export function FabRobot({ budgetPct = 0, onPress }: FabRobotProps) {
  const savedPos = useBudgetStore(s => s.fabPosition);
  const savePos  = useBudgetStore(s => s.saveFabPosition);

  const shellImage = useImage(require('../../assets/robot_shell.png'));

  const stageIdx = budgetPct <= 20 ? 0 : budgetPct <= 50 ? 1
                 : budgetPct <= 70 ? 2 : budgetPct <= 90 ? 3 : 4;
  const stage = STAGES[stageIdx];

  const faceOffsetX = useSharedValue(0);
  const faceOffsetY = useSharedValue(0);
  const [blinkSnap, setBlinkSnap] = useState(1);
  const mountedRef = useRef(true);

  const DIRS = useMemo<[number, number][]>(() => [
    [ 0,  0], [ 0, -4], [ 0,  5],
    [-6,  0], [ 6,  0],
    [-5, -3], [ 5, -3], [-5,  4], [ 5,  4],
  ], []);

  const startRandomLook = useCallback(() => {
    if (!mountedRef.current) return;
    const nervous  = stageIdx === 2 || stageIdx === 4;
    const goCenter = Math.random() > (nervous ? 0.3 : 0.6);
    const dir      = goCenter ? [0, 0] : DIRS[Math.floor(Math.random() * DIRS.length)];
    const moveMs   = 300 + Math.random() * 400;
    const stayMs   = nervous ? 500 + Math.random() * 1000 : 1500 + Math.random() * 2500;
    setTimeout(() => {
      if (!mountedRef.current) return;
      faceOffsetX.value = withTiming(dir[0], { duration: moveMs, easing: Easing.out(Easing.cubic) });
      faceOffsetY.value = withTiming(dir[1], { duration: moveMs, easing: Easing.out(Easing.cubic) });
      setTimeout(startRandomLook, stayMs);
    }, moveMs);
  }, [stageIdx, DIRS]);

  useEffect(() => {
    mountedRef.current = true;
    startRandomLook();
    const blinkInterval = () => stageIdx === 2 ? 1000 + Math.random() * 2000 : 2500 + Math.random() * 4000;
    let blinkTimer: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      blinkTimer = setTimeout(() => {
        if (!mountedRef.current) return;
        if (stageIdx !== 3 && stageIdx !== 4) {
          setBlinkSnap(0);
          setTimeout(() => setBlinkSnap(1), 160);
        }
        scheduleBlink();
      }, blinkInterval());
    };
    scheduleBlink();
    return () => {
      mountedRef.current = false;
      clearTimeout(blinkTimer);
    };
  }, [stageIdx]);

  // stageIdx 傳入 UI thread，供 derived value 使用
  const stageIdxSV = useSharedValue(stageIdx);
  useEffect(() => { stageIdxSV.value = stageIdx; }, [stageIdx]);

  const breathe = useSharedValue(0);
  useEffect(() => {
    // dizzy：快速不規則閃爍
    if (stageIdx === 4) {
      breathe.value = withRepeat(
        withSequence(
          withTiming(1.0, { duration: 200, easing: Easing.out(Easing.quad) }),
          withTiming(0.1, { duration: 150, easing: Easing.in(Easing.quad) }),
          withTiming(0.85, { duration: 180, easing: Easing.out(Easing.quad) }),
          withTiming(0.05, { duration: 130, easing: Easing.in(Easing.quad) }),
        ),
        -1, false,
      );
    } else {
      const cfg = stageIdx === 0 ? LIGHT_ANIM.happy
                : stageIdx === 1 ? LIGHT_ANIM.normal
                : stageIdx === 2 ? LIGHT_ANIM.nervous
                :                  LIGHT_ANIM.angry;
      breathe.value = withRepeat(
        withTiming(1, { duration: cfg.duration, easing: Easing.inOut(Easing.sin) }),
        -1, true,
      );
    }
  }, [stageIdx]);

  // 依各 stage min/max 計算透明度（在 UI thread worklet 中用 stageIdxSV）
  const glowOpacity = useDerivedValue(() => {
    const s = stageIdxSV.value;
    const min = s === 0 ? 0.32 : s === 1 ? 0.20 : s === 2 ? 0.28 : s === 3 ? 0.32 : 0.10;
    const max = s === 0 ? 0.72 : s === 1 ? 0.55 : s === 2 ? 0.75 : s === 3 ? 0.80 : 1.00;
    return min + breathe.value * (max - min);
  });
  const mainOpacity = useDerivedValue(() => {
    const s = stageIdxSV.value;
    const min = s === 0 ? 0.45 : s === 1 ? 0.30 : s === 2 ? 0.42 : s === 3 ? 0.48 : 0.12;
    const max = s === 0 ? 1.00 : s === 1 ? 0.88 : s === 2 ? 1.00 : s === 3 ? 1.00 : 1.00;
    return min + breathe.value * (max - min);
  });
  const coreOpacity = useDerivedValue(() => {
    const s = stageIdxSV.value;
    const min = s === 0 ? 0.50 : s === 1 ? 0.35 : s === 2 ? 0.45 : s === 3 ? 0.52 : 0.08;
    const max = s === 0 ? 1.00 : s === 1 ? 0.90 : s === 2 ? 1.00 : s === 3 ? 1.00 : 1.00;
    return min + breathe.value * (max - min);
  });
  const bgLedOpacity = useDerivedValue(() => 0.012 + breathe.value * 0.038);

  // ── 互動 / 待機動畫 shared values
  const idleFloat           = useSharedValue(0);   // 上下漂浮 0→1
  const idleScale           = useSharedValue(1);   // 整體 scale 呼吸
  const pressPulse          = useSharedValue(1);   // 點擊回彈
  const dragScale           = useSharedValue(1);   // 拖曳放大
  const interactionBoost    = useSharedValue(0);   // 互動時燈光補亮

  // 待機漂浮 + scale 呼吸（只啟動一次）
  useEffect(() => {
    idleFloat.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
      -1, true,
    );
    idleScale.value = withRepeat(
      withTiming(1.014, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      -1, true,
    );
  }, []);

  // 互動補亮疊加到呼吸燈
  const glowFinal = useDerivedValue(() => Math.min(1, glowOpacity.value + interactionBoost.value * 0.55));
  const mainFinal = useDerivedValue(() => Math.min(1, mainOpacity.value + interactionBoost.value * 0.40));
  const coreFinal = useDerivedValue(() => Math.min(1, coreOpacity.value + interactionBoost.value * 0.35));

  // 拖曳時陰影變淡
  const shadowOpacity1 = useDerivedValue(() => 0.13 - dragScale.value * 0.04 + 0.04);
  const shadowOpacity2 = useDerivedValue(() => 0.12 - dragScale.value * 0.04 + 0.04);

  const facePath = useMemo(() => buildFacePath(stage.name, blinkSnap), [stage.name, blinkSnap]);

  const faceTransform = useDerivedValue(() => [
    { translateX: faceOffsetX.value },
    { translateY: faceOffsetY.value },
  ]);

  const EDGE_MARGIN = 0;
  const SAFE_TOP    = 72;
  const SAFE_BOTTOM = 140;

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const defaultX = SW - OUTER_SIZE - 4;
  const defaultY = SH - OUTER_SIZE - 150;

  const initialX = savedPos
    ? clamp(savedPos.x, EDGE_MARGIN, SW - OUTER_SIZE - EDGE_MARGIN)
    : defaultX;
  const initialY = savedPos
    ? clamp(savedPos.y, SAFE_TOP, SH - OUTER_SIZE - SAFE_BOTTOM)
    : defaultY;

  const posX = useSharedValue(initialX);
  const posY = useSharedValue(initialY);

  // 長按拖曳控制
  const isLongPressDragging = useRef(false);
  const longPressTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    position:  'absolute',
    width:     OUTER_SIZE,
    height:    OUTER_SIZE,
    zIndex:    9999,
    overflow:  'visible' as const,
    transform: [
      { translateX: posX.value },
      { translateY: posY.value + (idleFloat.value - 0.5) * 4 },
      { scale: idleScale.value * pressPulse.value * dragScale.value },
    ],
  }));

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  (_, gs) =>
      isLongPressDragging.current && (Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3),

    // 手指觸碰：啟動長按 timer，尚未進入拖曳
    onPanResponderGrant: () => {
      isLongPressDragging.current = false;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);

      longPressTimer.current = setTimeout(() => {
        isLongPressDragging.current = true;
        dragScale.value        = withSpring(1.06, { damping: 14, stiffness: 180 });
        interactionBoost.value = withTiming(0.22, { duration: 120 });
      }, 280);
    },

    // 移動中：只在長按拖曳模式下才移動
    onPanResponderMove: (_, gs) => {
      if (!isLongPressDragging.current) return;

      posX.value = gs.moveX - OUTER_CENTER;
      posY.value = gs.moveY - OUTER_CENTER;

      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      faceOffsetX.value = clamp(gs.vx * 2.5, -7, 7);
      faceOffsetY.value = clamp(gs.vy * 2.5, -5, 5);
    },

    onPanResponderRelease: (_, gs) => {
      // 清除尚未觸發的長按 timer
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      // 臉部回正
      faceOffsetX.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });
      faceOffsetY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) });

      if (!isLongPressDragging.current) {
        // 短按：點擊回彈 + 呼叫 onPress
        pressPulse.value = withSequence(
          withTiming(0.93, { duration: 70 }),
          withTiming(1.07, { duration: 90 }),
          withSpring(1, { damping: 12 }),
        );
        interactionBoost.value = withSequence(
          withTiming(0.45, { duration: 80 }),
          withTiming(0,    { duration: 280 }),
        );
        onPress?.(posX.value, posY.value);
        return;
      }

      // 長按拖曳結束：恢復 scale + 燈光，左右吸附，保存位置
      isLongPressDragging.current = false;
      dragScale.value        = withSpring(1, { damping: 14, stiffness: 160 });
      interactionBoost.value = withTiming(0, { duration: 240 });

      const snapX  = posX.value + OUTER_CENTER < SW / 2 ? EDGE_MARGIN : SW - OUTER_SIZE - EDGE_MARGIN;
      const clampY = Math.min(Math.max(posY.value, SAFE_TOP), SH - OUTER_SIZE - SAFE_BOTTOM);
      posX.value = withSpring(snapX,  { damping: 15 });
      posY.value = withSpring(clampY, { damping: 15 });
      setTimeout(() => savePos({ x: snapX, y: clampY }), 600);
    },

    onPanResponderTerminate: () => {
      // 手勢被系統取消（例如通知欄）：清除 timer，重置狀態
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      isLongPressDragging.current = false;
      dragScale.value        = withSpring(1, { damping: 14, stiffness: 160 });
      interactionBoost.value = withTiming(0, { duration: 200 });
      faceOffsetX.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
      faceOffsetY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
    },
  }), [onPress]);

  return (
    <Animated.View {...panResponder.panHandlers} style={animStyle}>
      <Canvas style={{ width: OUTER_SIZE, height: OUTER_SIZE }}>
      <Group transform={[{ translateX: SHADOW_PAD }, { translateY: SHADOW_PAD }]}>

        {/* ══ 1. 貼底小陰影（拖曳時微淡） */}
        <Circle cx={ROBOT_SIZE * 0.50} cy={ROBOT_SIZE * 0.82} r={ROBOT_SIZE * 0.22} color="rgba(0,0,0,0.13)" opacity={shadowOpacity1}>
          <BlurMask blur={8} style="normal" />
        </Circle>
        <Circle cx={ROBOT_SIZE * 0.50} cy={ROBOT_SIZE * 0.79} r={ROBOT_SIZE * 0.14} color="rgba(0,0,0,0.12)" opacity={shadowOpacity2}>
          <BlurMask blur={4} style="normal" />
        </Circle>

        {/* ══ 2. Backing path：略大，填滿洞口後方所有空隙 */}
        <Path path={FACE_BACKING_PATH}>
          <RadialGradient
            c={vec(FB_X + FB_W * 0.36, FB_Y + FB_H * 0.28)}
            r={FB_W * 0.90}
            colors={['#1c2130', '#090c12', '#020305']}
            positions={[0, 0.52, 1]}
          />
        </Path>

        {/* ══ 3. Visible path：裁切可見臉部區域（黑色面板 + 深度 + LED + 表情 + 反光）*/}
        <Group clip={FACE_VISIBLE_PATH}>

          {/* 黑色玻璃底 */}
          <Path path={FACE_VISIBLE_PATH} color="#07090f" />

          {/* 內部深度 */}
          <Circle
            cx={FACE_CX + FV_W * 0.30}
            cy={FACE_CY + FV_H * 0.35}
            r={FV_W * 0.58}
            color="rgba(0,0,0,0.72)"
          >
            <BlurMask blur={10} style="normal" />
          </Circle>
          <Circle
            cx={FACE_CX - FV_W * 0.18}
            cy={FACE_CY - FV_H * 0.18}
            r={FV_W * 0.38}
            color="rgba(255,255,255,0.08)"
          >
            <BlurMask blur={7} style="normal" />
          </Circle>

          {/* LED 背景點陣 */}
          <Path path={FACE_LED_GRID} color={stage.color} style="fill" opacity={bgLedOpacity} />

          {/* LED 表情（screen blend）*/}
          <Group blendMode="screen">
            <Mask
              mode="alpha"
              mask={
                <Group transform={faceTransform}>
                  <Path path={facePath} color="white" style="stroke" strokeWidth={3.5} strokeCap="round" strokeJoin="round" />
                  <Path path={facePath} color="white" style="stroke" strokeWidth={14.0} strokeCap="round" strokeJoin="round" opacity={0.35}>
                    <BlurMask blur={5} style="normal" />
                  </Path>
                </Group>
              }
            >
              <Path path={FACE_LED_GRID} color={stage.glow} style="fill" opacity={1.0} />
            </Mask>
            <Group transform={faceTransform}>
              <Path path={facePath} color={stage.glow} style="stroke" strokeWidth={8.0} strokeCap="round" opacity={0.15}>
                <BlurMask blur={6.0} style="normal" />
              </Path>
            </Group>
          </Group>

          {/* 上緣玻璃反光 */}
          <RoundedRect
            x={FV_X + 5} y={FV_Y + 4}
            width={FV_W - 10} height={FV_H * 0.30}
            r={12}
            color="rgba(255,255,255,0.07)"
          >
            <BlurMask blur={3} style="normal" />
          </RoundedRect>

        </Group>

        {/* ══ 4. 額頭呼吸燈（外殼 PNG 下方，透過燈槽露出）*/}
        <RoundedRect x={TOP_LIGHT_X - 2} y={TOP_LIGHT_Y - 2} width={TOP_LIGHT_W + 4} height={TOP_LIGHT_H + 4} r={TOP_LIGHT_R + 2} color={stage.glow} opacity={glowFinal}>
          <BlurMask blur={6} style="normal" />
        </RoundedRect>
        <RoundedRect x={TOP_LIGHT_X} y={TOP_LIGHT_Y} width={TOP_LIGHT_W} height={TOP_LIGHT_H} r={TOP_LIGHT_R} color={stage.glow} opacity={mainFinal} />
        <RoundedRect
          x={TOP_LIGHT_X + TOP_LIGHT_W * 0.12} y={TOP_LIGHT_Y + TOP_LIGHT_H * 0.28}
          width={TOP_LIGHT_W * 0.76} height={TOP_LIGHT_H * 0.38}
          r={TOP_LIGHT_H * 0.2}
          color="rgba(220,255,255,0.90)" opacity={coreFinal}
        />

        {/* ══ 5. 下巴呼吸燈 */}
        <RoundedRect x={BOTTOM_LIGHT_X - 2} y={BOTTOM_LIGHT_Y - 2} width={BOTTOM_LIGHT_W + 4} height={BOTTOM_LIGHT_H + 4} r={BOTTOM_LIGHT_R + 2} color={stage.glow} opacity={glowFinal}>
          <BlurMask blur={5} style="normal" />
        </RoundedRect>
        <RoundedRect x={BOTTOM_LIGHT_X} y={BOTTOM_LIGHT_Y} width={BOTTOM_LIGHT_W} height={BOTTOM_LIGHT_H} r={BOTTOM_LIGHT_R} color={stage.glow} opacity={mainFinal} />
        <RoundedRect
          x={BOTTOM_LIGHT_X + BOTTOM_LIGHT_W * 0.12} y={BOTTOM_LIGHT_Y + BOTTOM_LIGHT_H * 0.28}
          width={BOTTOM_LIGHT_W * 0.76} height={BOTTOM_LIGHT_H * 0.38}
          r={BOTTOM_LIGHT_H * 0.2}
          color="rgba(220,255,255,0.90)" opacity={coreFinal}
        />

        {/* ══ 6. 最上層外殼 PNG */}
        {shellImage && (
          <SkiaImage image={shellImage} x={0} y={0} width={ROBOT_SIZE} height={ROBOT_SIZE} fit="fill" />
        )}

      </Group>
      </Canvas>
    </Animated.View>
  );
}
