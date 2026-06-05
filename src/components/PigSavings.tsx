/**
 * PigSavings — 水晶小豬（輪廓發光版）
 *
 * 發光原理：
 *   先畫一層豬的副本 → ColorMatrix 轉紫白色 → BlurMask 大模糊
 *   → 模糊沿豬的 PNG 輪廓（耳朵/腳爪）向外擴散，不是圓圈
 *
 * 畫布 180×180，豬 88×88 居中（四周 46px 緩衝）
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import {
  Canvas, Circle, Group, BlurMask,
  Image as SkiaImage, useImage, ColorMatrix,
} from '@shopify/react-native-skia';

const CANVAS  = 180;
const PIG     = 88;
const CX      = CANVAS / 2;   // 90
const CY      = CANVAS / 2;   // 90
const PIG_OFF = (CANVAS - PIG) / 2;   // 46

// 輪廓發光色彩矩陣：把豬的所有像素轉為亮紫色，保留 alpha 形狀
// 格式：[R, G, B, A, offset]  ×  RGBA 四列（共 20 個值）
const GLOW_MATRIX: number[] = [
  0, 0, 0, 0, 0.73,   // R = #bb
  0, 0, 0, 0, 0.64,   // G = #a4
  0, 0, 0, 0, 1.00,   // B = #ff
  0, 0, 0, 2.5, 0,    // A = 2.5× 放大讓輪廓更亮
];

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number; alpha: number; decay: number;
}

interface PigSavingsProps {
  onPress: () => void;
}

export function PigSavings({ onPress }: PigSavingsProps) {
  const pigImage = useImage(require('../../assets/Pig_Coin_00000.png'));

  const shakeX   = useRef(new Animated.Value(0)).current;
  const shakeY   = useRef(new Animated.Value(0)).current;
  const shakeRot = useRef(new Animated.Value(0)).current;

  const breatheRef   = useRef(0);
  const breatheDir   = useRef(1);
  const particlesRef = useRef<Particle[]>([]);
  const pRafRef      = useRef<number | null>(null);
  const [, setTick]  = useState(0);

  // 呼吸主 loop
  useEffect(() => {
    let raf: number;
    const loop = () => {
      breatheRef.current += 0.008 * breatheDir.current;
      if (breatheRef.current >= 1) { breatheRef.current = 1; breatheDir.current = -1; }
      if (breatheRef.current <= 0) { breatheRef.current = 0; breatheDir.current =  1; }
      setTick(t => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 粒子 loop
  const runParticles = useCallback(() => {
    particlesRef.current = particlesRef.current
      .map(p => ({
        ...p,
        x: p.x + p.vx, y: p.y + p.vy,
        vx: p.vx * 0.96, vy: p.vy * 0.96,
        alpha: p.alpha - p.decay,
      }))
      .filter(p => p.alpha > 0.02);
    setTick(t => t + 1);
    if (particlesRef.current.length > 0) {
      pRafRef.current = requestAnimationFrame(runParticles);
    } else {
      pRafRef.current = null;
    }
  }, []);

  const triggerShake = useCallback(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(shakeX,   { toValue: -4, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeY,   { toValue: -3, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeRot, { toValue: -4, duration: 40, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(shakeX,   { toValue:  4, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeY,   { toValue:  2, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeRot, { toValue:  3, duration: 50, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(shakeX,   { toValue: -3, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeY,   { toValue:  3, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeRot, { toValue: -2, duration: 50, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(shakeX,   { toValue:  3, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeY,   { toValue: -2, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeRot, { toValue:  2, duration: 50, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(shakeX,   { toValue:  0, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeY,   { toValue:  0, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeRot, { toValue:  0, duration: 80, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const spawnParticles = useCallback(() => {
    const newP: Particle[] = Array.from({ length: 22 }, (_, i) => {
      const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 1.5 + Math.random() * 2.5;
      return {
        x: CX, y: CY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r:  1.0 + Math.random() * 1.6,
        alpha: 0.9,
        decay: 0.020 + Math.random() * 0.018,
      };
    });
    particlesRef.current = [...particlesRef.current, ...newP];
    if (!pRafRef.current) {
      pRafRef.current = requestAnimationFrame(runParticles);
    }
  }, [runParticles]);

  useEffect(() => {
    const schedule = () => {
      const t = setTimeout(() => { triggerShake(); spawnParticles(); schedule(); },
        4000 + Math.random() * 5000);
      return t;
    };
    const t = schedule();
    return () => {
      clearTimeout(t);
      if (pRafRef.current) cancelAnimationFrame(pRafRef.current);
    };
  }, [triggerShake, spawnParticles]);

  const handlePress = useCallback(() => {
    triggerShake();
    spawnParticles();
    onPress();
  }, [triggerShake, spawnParticles, onPress]);

  const b           = breatheRef.current;
  const glowOpacity = 0.20 + b * 0.55;   // 0.20 ~ 0.75
  const glowBlur    = 18 + b * 10;        // 18 ~ 28

  const rotateDeg = shakeRot.interpolate({
    inputRange: [-4, 4], outputRange: ['-4deg', '4deg'],
  });

  return (
    <TouchableWithoutFeedback onPress={handlePress}>
      <Animated.View style={[styles.wrapper, {
        transform: [
          { translateX: shakeX },
          { translateY: shakeY },
          { rotate: rotateDeg },
        ],
      }]}>
        <Canvas style={{ width: CANVAS, height: CANVAS }}>

          {/* ── A. 輪廓發光（豬的副本 → 紫白色 → 沿輪廓模糊）── */}
          {pigImage && (
            <Group opacity={glowOpacity}>
              <SkiaImage
                image={pigImage}
                x={PIG_OFF}
                y={PIG_OFF}
                width={PIG}
                height={PIG}
              >
                <ColorMatrix matrix={GLOW_MATRIX} />
                <BlurMask blur={glowBlur} style="normal" />
              </SkiaImage>
            </Group>
          )}

          {/* ── B. 小豬本體（正常顏色，疊在發光層上方）── */}
          {pigImage && (
            <SkiaImage
              image={pigImage}
              x={PIG_OFF}
              y={PIG_OFF}
              width={PIG}
              height={PIG}
            />
          )}

          {/* ── C. 22 顆擴散粒子 ── */}
          {particlesRef.current.map((p, i) => (
            <Group key={i}>
              <Circle
                cx={p.x} cy={p.y}
                r={p.r * 1.8}
                color={`rgba(255,255,255,${Math.max(0, p.alpha).toFixed(3)})`}
              >
                <BlurMask blur={p.r * 1.2} style="outer" />
              </Circle>
              <Circle
                cx={p.x} cy={p.y}
                r={p.r * 0.7}
                color={`rgba(220,225,255,${Math.max(0, p.alpha * 0.5).toFixed(3)})`}
              />
            </Group>
          ))}

        </Canvas>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width:          CANVAS,
    height:         CANVAS,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'visible',
  },
});
