import type { TextStyle } from 'react-native';
import type { ColorScheme, RawThemeColors } from '@/lib/theme/themes';

/**
 * Ink: slate neutrals from the logo (ink #292F3D, white, #A3A3A3 tick). The ink is
 * the only action colour and flips to near-white in dark mode. Green (`live*`) is
 * reserved for in-progress state. `__tests__/design-system/contrast.test.ts`
 * checks WCAG AA for the text/background pairs, so run it after any change here.
 */
export const designColors = {
  light: {
    background: '#F3F4F7', surface: '#FFFFFF', surfaceSecondary: '#EDEFF3',
    control: '#E3E6EC', controlBorder: '#D2D7DF', border: '#DDE1E7', borderLight: '#EBEDF1',
    foreground: '#1D2230', foregroundSecondary: '#4F5667', foregroundMuted: '#626978',
    primary: '#292F3D', primaryForeground: '#FFFFFF', primaryLight: '#E6E8EE', pressed: '#E4E7EC',
    live: '#1F9D6B', liveSoft: '#E0F2EA', liveInk: '#16613F',
    success: '#287A5F', warning: '#9A6216', destructive: '#BF3E4A', onDestructive: '#FFFFFF', pbGold: '#9C6C1E',
    overlay: 'rgba(29, 34, 48, 0.28)', overlayDark: 'rgba(29, 34, 48, 0.45)', shadow: '#000000',
  },
  dark: {
    background: '#12151C', surface: '#1B1F28', surfaceSecondary: '#252A35',
    control: '#2A2F3A', controlBorder: '#3A4150', border: '#323845', borderLight: '#282D38',
    foreground: '#F2F4F7', foregroundSecondary: '#B4BAC6', foregroundMuted: '#8D94A2',
    primary: '#E8EBF0', primaryForeground: '#292F3D', primaryLight: '#2C3240', pressed: '#2C3240',
    live: '#4FD39B', liveSoft: '#17342A', liveInk: '#9BE3C2',
    success: '#5BBE98', warning: '#DDB06A', destructive: '#F07C86', onDestructive: '#1A1D25', pbGold: '#E0B45E',
    overlay: 'rgba(6, 8, 12, 0.5)', overlayDark: 'rgba(6, 8, 12, 0.65)', shadow: '#000000',
  },
} as const satisfies Record<ColorScheme, RawThemeColors>;

/** Spacing values already used by the redesigned screens. */
export const space = {
  4: 4, 6: 6, 8: 8, 12: 12, 16: 16, 18: 18, 20: 20, 22: 22, 24: 24, 32: 32,
} as const;

export const radius = {
  badge: 6, button: 8, chip: 10, control: 12, icon: 14, action: 16, card: 18, dialog: 24, pill: 999,
} as const;

/** Existing text roles; omitted properties continue to inherit React Native defaults. */
export const typography = {
  title: { fontSize: 32, lineHeight: 39, fontWeight: '700', letterSpacing: -0.8 },
  /** A tab's page title, such as Exercises or Settings. */
  screenTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6 },
  /** The workout name on workout detail. */
  detailTitle: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8 },
  /** Workout-card title (metric-strip card). */
  cardTitle: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  section: { fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
  body: { fontSize: 16 },
  label: { fontSize: 14 },
  caption: { fontSize: 12 },
  metricValue: { fontSize: 25, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -0.7 },
  metricLabel: { fontSize: 11, letterSpacing: 0.6 },
  /** Uppercase heading above a grouped list. */
  groupLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { fontSize: 13 },
  /** Value inside a metric-strip chip. */
  chipValue: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  /** Status pills, segmented-control labels, and other small emphasised text. */
  pill: { fontSize: 12, fontWeight: '600' },
} satisfies Record<string, TextStyle>;

export const motion = {
  layout: 180, listEnter: 240, dialogEnter: 260, stagger: 40,
  /** Press-and-hold: delay before feedback starts (so scrolls don't flash it), then the fill duration. */
  holdDelay: 120, hold: 500, holdRelease: 160,
  /** One cycle of the live-dot pulse. */
  livePulse: 2200,
} as const;

export const sizes = {
  touchTarget: 44, icon: 23, pageMaxWidth: 700, dialogMaxWidth: 420, scrollFade: 36,
  liveDot: 7, listLeading: 36, listLeadingSmall: 32, listRowMinHeight: 60, buttonLarge: 48, holdBar: 3,
  /** Docked tab bar: content height above the bottom safe area, and the active-icon pill. */
  dockBar: 58, dockPill: 30, dockPillWidth: 58,
  /** The in-progress workout strip docked above the tab bar. */
  liveStrip: 58,
} as const;

/** The LiftingLog mark: a fixed ink tile in both modes, as drawn in the mockups. */
export const brandColors = { tile: '#292F3D', tileEdge: 'rgba(255,255,255,0.14)', glyph: '#FFFFFF', check: '#A3A3A3' } as const;

export const glass = { blurIntensity: 42, borderAlpha: 'B3', surfaceAlpha: 'EB' } as const;

export const opacity = { disabled: 0.35 } as const;
