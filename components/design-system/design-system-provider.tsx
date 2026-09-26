import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { designColors } from '@/lib/design-system/tokens';
import { ThemeColorScope, useTheme } from '@/lib/theme/ThemeContext';

/**
 * The root `ThemeProvider` now applies Ink app-wide, so this returns the same colours as `useTheme`.
 * Kept so a boundary can read the palette before its provider mounts.
 */
export function useDesignSystemTheme() {
  const theme = useTheme();
  return { ...theme, rawColors: designColors[theme.isDark ? 'dark' : 'light'] };
}

/**
 * A page boundary for redesigned screens: a full-height View on the page background. The colours
 * match the root provider since Ink became app-wide; it stays so existing layouts don't shift.
 */
export function DesignSystemProvider({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { rawColors } = useDesignSystemTheme();
  return <ThemeColorScope colors={rawColors} style={style}>{children}</ThemeColorScope>;
}
