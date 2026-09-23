import type { ReactNode } from 'react';
import { ThemeColorScope, useTheme, type RawThemeColors } from '@/lib/theme/ThemeContext';

const shared = {
  success: '#249B79', warning: '#C88730', destructive: '#DC535F',
  primaryForeground: '#FFFFFF', shadow: '#000000', pbGold: '#C88730',
};

export const workoutColors: Record<'light' | 'dark', RawThemeColors> = {
  light: {
    ...shared, primary: '#285DCE', primaryLight: '#E7EDFB',
    background: '#F4F6F8', surface: '#FFFFFF', surfaceSecondary: '#EAEFF4',
    border: '#D8E0E9', borderLight: '#E7EBF0', foreground: '#182330',
    foregroundSecondary: '#526174', foregroundMuted: '#69788A', pressed: '#E5EBF3',
    overlay: 'rgba(35, 48, 66, 0.25)', overlayDark: 'rgba(18, 27, 40, 0.45)',
  },
  dark: {
    ...shared, primary: '#568DFA', primaryLight: '#203353',
    background: '#101720', surface: '#19232F', surfaceSecondary: '#233040',
    border: '#354354', borderLight: '#293646', foreground: '#F1F5F9',
    foregroundSecondary: '#B3C0D0', foregroundMuted: '#91A0B4', pressed: '#2A3B50',
    overlay: 'rgba(7, 13, 23, 0.35)', overlayDark: 'rgba(7, 13, 23, 0.6)',
    success: '#50C5A1', warning: '#E3B166', destructive: '#FF7B85',
  },
};

export function useWorkoutTheme() {
  const theme = useTheme();
  return { ...theme, rawColors: workoutColors[theme.isDark ? 'dark' : 'light'] };
}

export function WorkoutThemeBoundary({ children }: { children: ReactNode }) {
  const { rawColors } = useWorkoutTheme();
  return <ThemeColorScope colors={rawColors}>{children}</ThemeColorScope>;
}
