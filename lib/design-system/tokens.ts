import type { TextStyle } from 'react-native';
import type { ColorScheme, RawThemeColors } from '@/lib/theme/themes';

const sharedColors = {
  success: '#249B79', warning: '#C88730', destructive: '#DC535F',
  primaryForeground: '#FFFFFF', shadow: '#000000', pbGold: '#C88730',
} as const;

/** The Workouts palette, independent of the legacy color-theme selection; light/dark mode still applies. */
export const designColors = {
  light: {
    ...sharedColors, primary: '#285DCE', primaryLight: '#E7EDFB',
    background: '#F4F6F8', surface: '#FFFFFF', surfaceSecondary: '#EAEFF4',
    border: '#D8E0E9', borderLight: '#E7EBF0', foreground: '#182330',
    foregroundSecondary: '#526174', foregroundMuted: '#69788A', pressed: '#E5EBF3',
    overlay: 'rgba(35, 48, 66, 0.25)', overlayDark: 'rgba(18, 27, 40, 0.45)',
  },
  dark: {
    ...sharedColors, primary: '#568DFA', primaryLight: '#203353',
    background: '#101720', surface: '#19232F', surfaceSecondary: '#233040',
    border: '#354354', borderLight: '#293646', foreground: '#F1F5F9',
    foregroundSecondary: '#B3C0D0', foregroundMuted: '#91A0B4', pressed: '#2A3B50',
    overlay: 'rgba(7, 13, 23, 0.35)', overlayDark: 'rgba(7, 13, 23, 0.6)',
    success: '#50C5A1', warning: '#E3B166', destructive: '#FF7B85',
  },
} as const satisfies Record<ColorScheme, RawThemeColors>;

/** Spacing values already used by the redesigned screens. */
export const space = {
  4: 4, 6: 6, 8: 8, 12: 12, 16: 16, 18: 18, 20: 20, 22: 22, 24: 24, 32: 32,
} as const;

export const radius = {
  badge: 6, button: 8, control: 12, icon: 14, action: 16, card: 18, dialog: 24,
} as const;

/** Existing text roles; omitted properties continue to inherit React Native defaults. */
export const typography = {
  title: { fontSize: 32, lineHeight: 39, fontWeight: '700', letterSpacing: -0.8 },
  cardTitle: { fontSize: 23, lineHeight: 29, fontWeight: '600' },
  section: { fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
  body: { fontSize: 16 },
  label: { fontSize: 14 },
  caption: { fontSize: 12 },
  metricValue: { fontSize: 25, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -0.7 },
  metricLabel: { fontSize: 11, letterSpacing: 0.6 },
} satisfies Record<string, TextStyle>;

export const motion = { layout: 180, listEnter: 240, dialogEnter: 260, stagger: 40 } as const;

export const sizes = { touchTarget: 44, icon: 23, pageMaxWidth: 700, dialogMaxWidth: 420 } as const;

export const glass = { blurIntensity: 42, borderAlpha: 'B3', surfaceAlpha: 'EB' } as const;

export const opacity = { disabled: 0.35 } as const;
