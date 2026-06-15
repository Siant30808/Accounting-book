/**
 * theme.ts ── App 全域設計 Token (Pastel Glassmorphism)
 * 營造頂級淺色粉彩玻璃質感與剔透的彩色光暈
 */
import { ViewStyle } from 'react-native';

// ─────────────────────────────────────────
// 顏色系統
// ─────────────────────────────────────────
export const colors = {
  // 背景
  appBg:          '#E2E8F0',
  cardBg:         'rgba(255, 255, 255, 0.32)',
  cardBorder:     'rgba(255, 255, 255, 1)',
  neuCardBg:      'rgba(255, 255, 255, 0.6)',
  insetBg:        'rgba(0, 0, 0, 0.02)',
  insetBorder:    'rgba(255, 255, 255, 0.8)',
  darkCard:       'rgba(255, 255, 255, 0.85)',
  tabBar:         'rgba(255, 255, 255, 0.75)',

  // 文字
  textPrimary:    '#1E293B',
  textSecondary:  '#475569',
  textMuted:      '#94A3B8',
  textHint:       '#CBD5E1',
  textDisabled:   '#E2E8F0',
  textWhite:      '#FFFFFF',

  // 粉彩霓虹色系
  cyan:           '#38BDF8',
  pink:           '#F472B6',
  mint:           '#34D399',
  lavender:       '#A78BFA',
  peach:          '#FBBF24',

  // 狀態對應（向下相容）
  income:         '#34D399',
  expense:        '#F472B6',
  credit:         '#38BDF8',
  savings:        '#A78BFA',
  neutral:        '#FBBF24',

  accent:         '#38BDF8',
  periodDot:      '#34D399',
  tagBg:          'rgba(255, 255, 255, 0.65)',

  shadowCard:     '#475569',
  shadowNeu:      '#475569',
  shadowSavings:  '#A78BFA',
} as const;

// ─────────────────────────────────────────
// 圓角、間距、字體
// ─────────────────────────────────────────
export const radius  = { xs: 8, sm: 12, md: 18, lg: 24, xl: 28, xxl: 32, pill: 50 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, screenH: 16, screenH2: 20 } as const;
export const fontSize = { xs: 10, sm: 12, base: 13, md: 14, lg: 16, xl: 18, h3: 20, h2: 24, h1: 28, hero: 34 } as const;

// ─────────────────────────────────────────
// 彩色光暈預設集 (Pastel Ambient Bloom)
// ─────────────────────────────────────────
export const glows = {
  base: {
    shadowColor:     '#475569',
    shadowOffset:    { width: 0, height: 12 },
    shadowOpacity:   0.08,
    shadowRadius:    24,
    elevation:       0,
    backgroundColor: 'transparent',
  } satisfies ViewStyle,

  cyanGlow: {
    shadowColor:     colors.cyan,
    shadowOffset:    { width: 0, height: 10 },
    shadowOpacity:   0.35,
    shadowRadius:    20,
    elevation:       0,
    backgroundColor: 'transparent',
  } satisfies ViewStyle,

  pinkGlow: {
    shadowColor:     colors.pink,
    shadowOffset:    { width: 0, height: 10 },
    shadowOpacity:   0.35,
    shadowRadius:    20,
    elevation:       0,
    backgroundColor: 'transparent',
  } satisfies ViewStyle,

  mintGlow: {
    shadowColor:     colors.mint,
    shadowOffset:    { width: 0, height: 10 },
    shadowOpacity:   0.35,
    shadowRadius:    20,
    elevation:       0,
    backgroundColor: 'transparent',
  } satisfies ViewStyle,

  purpleGlow: {
    shadowColor:     colors.lavender,
    shadowOffset:    { width: 0, height: 10 },
    shadowOpacity:   0.35,
    shadowRadius:    20,
    elevation:       0,
    backgroundColor: 'transparent',
  } satisfies ViewStyle,

  // 向下相容
  incomeGlow:  { shadowColor: colors.income,  shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 0, backgroundColor: 'transparent' } satisfies ViewStyle,
  expenseGlow: { shadowColor: colors.expense, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 0, backgroundColor: 'transparent' } satisfies ViewStyle,
  creditGlow:  { shadowColor: colors.credit,  shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 0, backgroundColor: 'transparent' } satisfies ViewStyle,
  savingsGlow: { shadowColor: colors.savings, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 0, backgroundColor: 'transparent' } satisfies ViewStyle,
} as const;

// ─────────────────────────────────────────
// 文字陰影預設集（供全域引用）
// ─────────────────────────────────────────
export const textShadows = {
  /** 淺陰影：一般卡片內文字 */
  light: {
    textShadowColor:  'rgba(0, 0, 0, 0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  /** 重陰影：金額、標題等關鍵文字 */
  heavy: {
    textShadowColor:  'rgba(0, 0, 0, 0.48)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  /** 淺色背景版（深色文字 + 白色光暈，對抗深色背景）*/
  lightOnDark: {
    textShadowColor:  'rgba(255, 255, 255, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
} as const;

export const shadows = {
  card:     glows.base,
  neu:      glows.base,
  darkCard: glows.base,
  savings:  glows.savingsGlow,
  report:   glows.base,
} as const;


