import { PlatformColor, type ColorValue } from 'react-native';

/**
 * SONDER design tokens.
 *
 * Colors come from iOS semantic system colors so light/dark mode, increased contrast
 * and accessibility settings are handled by the system. Only the accent is ours.
 */
export const colors = {
  accent: '#FF6B4A' as ColorValue,
  label: PlatformColor('label'),
  secondaryLabel: PlatformColor('secondaryLabel'),
  tertiaryLabel: PlatformColor('tertiaryLabel'),
  separator: PlatformColor('separator'),
  background: PlatformColor('systemBackground'),
  groupedBackground: PlatformColor('systemGroupedBackground'),
  secondaryGroupedBackground: PlatformColor('secondarySystemGroupedBackground'),
  fill: PlatformColor('tertiarySystemFill'),
  secondaryFill: PlatformColor('secondarySystemFill'),
  placeholder: PlatformColor('systemGray5'),
  destructive: PlatformColor('systemRed'),
  favorite: PlatformColor('systemPink'),
};

/** Colors used on top of artwork backgrounds (Now Playing), always light-on-dark. */
export const onArtwork = {
  primary: 'rgba(255,255,255,0.96)',
  secondary: 'rgba(255,255,255,0.62)',
  tertiary: 'rgba(255,255,255,0.35)',
  track: 'rgba(255,255,255,0.22)',
  scrim: 'rgba(0,0,0,0.38)',
};

/** 4-point base grid. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  screen: 20,
} as const;

/** Artwork corner radius scales with artwork size so small thumbnails don't look like pills. */
export function artworkRadius(size: number): number {
  if (size <= 48) return 6;
  if (size <= 96) return 8;
  if (size <= 200) return 10;
  return 14;
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  capsule: 999,
} as const;

/**
 * Type ramp. Font sizes here are the iOS defaults; React Native's `allowFontScaling`
 * (on by default) scales them with Dynamic Type.
 */
export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: 0.37 },
  title1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: 0.36 },
  title2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: 0.35 },
  title3: { fontSize: 20, fontWeight: '600' as const, letterSpacing: 0.38 },
  headline: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.43 },
  body: { fontSize: 17, fontWeight: '400' as const, letterSpacing: -0.43 },
  callout: { fontSize: 16, fontWeight: '400' as const, letterSpacing: -0.31 },
  subhead: { fontSize: 15, fontWeight: '400' as const, letterSpacing: -0.23 },
  footnote: { fontSize: 13, fontWeight: '400' as const, letterSpacing: -0.08 },
  caption: { fontSize: 12, fontWeight: '400' as const, letterSpacing: 0 },
  caption2: { fontSize: 11, fontWeight: '400' as const, letterSpacing: 0.06 },
  monoDigits: { fontVariant: ['tabular-nums' as const] },
};

/** Spring presets shared across the app (Reanimated `withSpring` configs). */
export const springs = {
  /** Buttons and small controls: quick, no visible overshoot. */
  press: { damping: 20, stiffness: 420, mass: 0.6 },
  /** Artwork scale when play state changes. */
  artwork: { damping: 18, stiffness: 180, mass: 0.9 },
  /** Larger movements: sheets, reorder settle. */
  settle: { damping: 24, stiffness: 260, mass: 0.8 },
} as const;

export const layout = {
  rowHeight: 60,
  rowArtwork: 44,
  miniArtwork: 36,
  gridGap: 16,
} as const;
