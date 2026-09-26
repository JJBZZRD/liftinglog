import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { designColors } from '@/lib/design-system/tokens';
import { ThemeColorScope, useTheme } from '@/lib/theme/ThemeContext';

/** Read the shared palette without changing the user's stored theme preference. */
export function useDesignSystemTheme() {
  const theme = useTheme();
  return { ...theme, rawColors: designColors[theme.isDark ? 'dark' : 'light'] };
}

/** Apply the shared colors to useTheme consumers and NativeWind classes in this subtree. */
export function DesignSystemProvider({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { rawColors } = useDesignSystemTheme();
  return <ThemeColorScope colors={rawColors} style={style}>{children}</ThemeColorScope>;
}
