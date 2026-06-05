/**
 * FabRobot.tsx ── 120Hz 零掉幀・極致水晶版 (完美厚玻璃質感與高光)
 */
import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { PanResponder, Dimensions } from 'react-native';
import {
  Canvas, Circle, Group, BlurMask,
  RadialGradient, LinearGradient,
  Path, Skia, vec, Mask,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue, withTiming, withRepeat,
  useDerivedValue, withSpring, useAnimatedStyle,
  withSequence, Easing,
} from 'react-native-reanimated';
import { useBudgetStore } from '../store/useBudgetStore';

const { width: SW, height: SH } = Dimensions.get('window');

const RADIUS = 30;
const PAD    = 35;
const SIZE   = (RADIUS + PAD) * 2;   // 130
const CENTER = SIZE / 2;             // 65

const STAGES = [
  { name: 'happy',   color: '#00ff33', dark: '#0a2e0e', glow: '#00ff33' },
  { name: 'normal',  color: '#00ffff', dark: '#001a33', glow: '#00ffff' },
  { name: 'nervous', color: '#ffea00', dark: '#332b00', glow: '#ffea00' },
  { name: 'angry',   color: '#ff0033', dark: '#330008', glow: '#ff0033' },
  { name: 'dizzy',   color: '#e600ff', dark: '#2a0033', glow: '#e600ff' },
] as const;

// 圓點 LED Grid
const LED_GRID = (() => {
  const path = Skia.Path.Make();
  const gap  = 2.2;
  const dotR = 0.45;
  for (let x = CENTER - RADIUS; x < CENTER + RADIUS; x += gap) {
    for (let y = CENTER - RADIUS; y < CENTER + RADIUS; y += gap) {
      if ((x - CENTER) ** 2 + (y - CENTER) ** 2 < (RADIUS - 1) ** 2) {
        path.addCircle(x, y, dotR);
      }
    }
  }
  return path;
})();

const CLIP_CIRCLE = (() => {
  const p = Skia.Path.Make();
  p.addCircle(CENTER, CENTER, RADIUS);
  return p;
})();

// 微調半月反光罩的比例，讓它更飽滿
const GLASS_OVAL = (() => {
  const p  = Skia.Path.Make();
  const w  = RADIUS * 1.6;
  const h  = RADIUS * 1.0;
  const ox = CENTER - w / 2;
  const oy = CENTER - RADIUS * 0.95;
  p.addOval(Skia.XYWHRect(ox, oy, w, h));
  return p;
})();

function buildFacePath(name: string, blink: number): ReturnType<typeof Skia.Path.Make> {
  const p      = Skia.Path.Make();
  const cx     = CENTER;
  const cy     = CENTER;
  const eyeY   = cy - 5;
  const lx     = cx - 11;
  const rx     = cx + 11;
  const eHW    = 5;
  const mouthY = cy + 9;
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
      p.addRect({ x: cx - 6,   y: mouthY,          width: 12,      height: 1.8 });
      break;
    }
  }
  return p;
}

interface FabRobotProps {
  budgetPct?: number;
  onPress?:   () => void;
}

export function FabRobot({ budgetPct = 0, onPress }: FabRobotProps) {
  const savedPos = useBudgetStore(s => s.fabPosition);
  const savePos  = useBudgetStore(s => s.saveFabPosition);

  const stageIdx = budgetPct <= 20 ? 0 : budgetPct <= 50 ? 1
                 : budgetPct <= 70 ? 2 : budgetPct <= 90 ? 3 : 4;
  const stage = STAGES[stageIdx];

  const faceOffsetX = useSharedValue(0);
  const faceOffsetY = useSharedValue(0);
  const [blinkSnap, setBlinkSnap] = useState(1);
  const mountedRef = useRef(true);

  const DIRS = useMemo<[number, number][]>(() => [
    [ 0,  0], [ 0, -5], [ 0,  6],
    [-7,  0], [ 7,  0],
    [-6, -4], [ 6, -4], [-6,  5], [ 6,  5],
  ], []);

  const startRandomLook = useCallback(() => {
    if (!mountedRef.current) return;
    const nervous  = stageIdx === 2 || stageIdx === 4;
    const goCenter = Math.random() > (nervous ? 0.3 : 0.6);
    const dir      = goCenter ? [0, 0] : DIRS[Math.floor(Math.random() * DIRS.length)];
    const moveMs   = 300 + Math.random() * 400;
    const stayMs   = nervous ? 500  + Math.random() * 1000 : 1500 + Math.random() * 2500;

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

  const breathe = useSharedValue(0);
  useEffect(() => {
    breathe.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      -1, true,
    );
  }, []);

  const bgLedOpacity = useDerivedValue(() => 0.015 + breathe.value * 0.035);

  const facePath = useMemo(() => buildFacePath(stage.name, blinkSnap), [stage.name, blinkSnap]);

  const faceTransform = useDerivedValue(() => [
    { translateX: faceOffsetX.value },
    { translateY: faceOffsetY.value },
  ]);

  const posX = useSharedValue(savedPos?.x ?? SW - SIZE - 8);
  const posY = useSharedValue(savedPos?.y ?? SH - SIZE - 100);

  const animStyle = useAnimatedStyle(() => ({
    position:  'absolute',
    width:     SIZE,
    height:    SIZE,
    zIndex:    9999,
    overflow:  'visible' as const,
    transform: [{ translateX: posX.value }, { translateY: posY.value }],
  }));

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderMove: (_, gs) => {
      posX.value = gs.moveX - CENTER;
      posY.value = gs.moveY - CENTER;
    },
    onPanResponderRelease: (_, gs) => {
      if (Math.abs(gs.dx) < 6 && Math.abs(gs.dy) < 6) { onPress?.(); return; }
      const snapX  = posX.value + CENTER < SW / 2 ? 8 : SW - SIZE - 8;
      const clampY = Math.min(Math.max(posY.value, 60), SH - SIZE - 60);
      posX.value   = withSpring(snapX,  { damping: 15 });
      posY.value   = withSpring(clampY, { damping: 15 });
      setTimeout(() => savePos({ x: snapX, y: clampY }), 600);
    },
  }), [onPress]);

  return (
    <Animated.View {...panResponder.panHandlers} style={animStyle}>
      <Canvas style={{ width: SIZE, height: SIZE }}>

        {/* ══ LAYER 1 ── Drop Shadow */}
        <Circle cx={CENTER} cy={CENTER + 8} r={RADIUS + 2} color="rgba(0,0,0,0.55)">
          <BlurMask blur={14} style="normal" />
        </Circle>

        {/* ══ LAYER 2 ── Ball Base（情緒 dark tint）*/}
        <Circle cx={CENTER} cy={CENTER} r={RADIUS}>
          <RadialGradient
            c={vec(CENTER - RADIUS * 0.40, CENTER - RADIUS * 0.40)}
            r={RADIUS * 1.70}
            colors={[stage.dark, '#03050a']}
            positions={[0, 1]}
          />
        </Circle>

        {/* ══ LAYER 3 ── Inset Depth */}
        <Group clip={CLIP_CIRCLE}>
          <Circle cx={CENTER + RADIUS * 0.55} cy={CENTER + RADIUS * 0.65} r={RADIUS * 1.10} color="rgba(0,0,0,0.88)">
            <BlurMask blur={12} style="normal" />
          </Circle>
          <Circle cx={CENTER - RADIUS * 0.28} cy={CENTER - RADIUS * 0.28} r={RADIUS * 0.75} color="rgba(255,255,255,0.14)">
            <BlurMask blur={8} style="normal" />
          </Circle>
        </Group>

        {/* ══ LAYER 4 ── 極微弱背景網格 */}
        <Path path={LED_GRID} color={stage.color} style="fill" opacity={bgLedOpacity} />

        {/* ══ LAYER 5 ── 球面亮暗深度 */}
        <Group clip={CLIP_CIRCLE}>
          <Circle cx={CENTER - RADIUS * 0.35} cy={CENTER - RADIUS * 0.35} r={RADIUS * 0.55} color="rgba(255,255,255,0.15)">
            <BlurMask blur={9} style="normal" />
          </Circle>
          <Circle cx={CENTER + RADIUS * 0.40} cy={CENTER + RADIUS * 0.45} r={RADIUS * 0.65} color="rgba(0,0,0,0.65)">
            <BlurMask blur={10} style="normal" />
          </Circle>
        </Group>

        {/* ══ LAYER 6 & 7 ── LED Face 點陣過濾與發光 */}
        <Group blendMode="screen">
          <Mask
            mode="alpha"
            mask={
              <Group transform={faceTransform}>
                <Path path={facePath} color="white" style="stroke" strokeWidth={3.5} strokeCap="round" strokeJoin="round" />
                <Path path={facePath} color="white" style="stroke" strokeWidth={16.0} strokeCap="round" strokeJoin="round" opacity={0.35}>
                  <BlurMask blur={5} style="normal" />
                </Path>
              </Group>
            }
          >
            <Path path={LED_GRID} color={stage.glow} style="fill" opacity={1.0} />
          </Mask>
          <Group transform={faceTransform}>
            <Path path={facePath} color={stage.glow} style="stroke" strokeWidth={10.0} strokeCap="round" opacity={0.15}>
              <BlurMask blur={8.0} style="normal" />
            </Path>
          </Group>
        </Group>

        {/* ══ LAYER 8 ── 頂級玻璃高光 (Skeuomorphic Glass) */}
        <Group clip={CLIP_CIRCLE}>
          {/* 1. 頂部半月形大面積柔和反光 */}
          <Path path={GLASS_OVAL} opacity={0.65}>
            <LinearGradient
              start={vec(CENTER, CENTER - RADIUS)}
              end={vec(CENTER, CENTER)}
              colors={['rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']}
            />
          </Path>
          {/* 2. 鏡面高光柔暈（讓高光點不生硬，更有層次）*/}
          <Circle cx={CENTER - RADIUS * 0.42} cy={CENTER - RADIUS * 0.42} r={RADIUS * 0.35} opacity={0.6}>
            <RadialGradient
              c={vec(CENTER - RADIUS * 0.42, CENTER - RADIUS * 0.42)}
              r={RADIUS * 0.35}
              colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
            />
          </Circle>
          {/* 3. 銳利核心反光點（微柔焦，對齊暗色玻璃球參考圖）*/}
          <Circle cx={CENTER - RADIUS * 0.48} cy={CENTER - RADIUS * 0.48} r={2.0} color="#ffffff" opacity={0.95}>
            <BlurMask blur={0.8} style="normal" />
          </Circle>
        </Group>

        {/* ══ LAYER 9 ── 玻璃物理厚度與折射 (Thick Glass Lip & Caustics) */}
        <Group clip={CLIP_CIRCLE}>
          {/* 1. 頂部拋光銳利邊緣線 (Polished Rim) — 硬質玻璃的關鍵 */}
          <Circle cx={CENTER} cy={CENTER} r={RADIUS - 1} color="transparent" style="stroke" strokeWidth={1.5} opacity={0.9}>
            <LinearGradient
              start={vec(CENTER - RADIUS, CENTER - RADIUS)}
              end={vec(CENTER + RADIUS * 0.2, CENTER + RADIUS * 0.2)}
              colors={['rgba(255,255,255,1)', 'rgba(255,255,255,0)']}
            />
          </Circle>
          {/* 2. 底部內反射光 (Caustic Bounce) — 玻璃球底部聚光，厚度感的靈魂 */}
          <Circle cx={CENTER} cy={CENTER} r={RADIUS - 2.5} color="transparent" style="stroke" strokeWidth={3} opacity={0.45}>
            <LinearGradient
              start={vec(CENTER, CENTER - RADIUS * 0.2)}
              end={vec(CENTER, CENTER + RADIUS)}
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.8)']}
            />
            <BlurMask blur={2.5} style="normal" />
          </Circle>
          {/* 3. 最外層深色環境吸收圈（強調球體邊緣輪廓與立體感）*/}
          <Circle cx={CENTER} cy={CENTER} r={RADIUS - 0.5} color="transparent" style="stroke" strokeWidth={2.0} opacity={0.85}>
            <LinearGradient
              start={vec(CENTER - RADIUS, CENTER - RADIUS)}
              end={vec(CENTER + RADIUS, CENTER + RADIUS)}
              colors={['rgba(255,255,255,0.3)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,1)']}
            />
          </Circle>
        </Group>

      </Canvas>
    </Animated.View>
  );
}
