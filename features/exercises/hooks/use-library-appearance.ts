import type { ColorValue } from 'react-native';
import { useTheme } from '@/lib/theme/ThemeContext';

export function useLibraryAppearance() {
  const { rawColors, isDark } = useTheme();
  const screenBackground = rawColors.background;
  const heroGradient: readonly [ColorValue, ColorValue] = isDark
    ? [rawColors.background, rawColors.surface]
    : [rawColors.surface, rawColors.pressed];
  const sectionLabelColor = isDark ? rawColors.foregroundMuted : "#8895AB";
  const raisedSurface = isDark ? rawColors.surface : "#FFFFFF";
  const subtleBorder = isDark ? rawColors.border : "#E3EAF5";
  const lightShadowColor = isDark ? rawColors.shadow : "#9AA9C3";
  return { rawColors, isDark, screenBackground, heroGradient, sectionLabelColor, raisedSurface, subtleBorder, lightShadowColor };
}
