import type { ColorValue } from 'react-native';
import { useTheme } from '@/lib/theme/ThemeContext';

export function useLibraryAppearance() {
  const { rawColors, isDark } = useTheme();
  const screenBackground = rawColors.background;
  const heroGradient: readonly [ColorValue, ColorValue] = isDark
    ? [rawColors.background, rawColors.surface]
    : [rawColors.surface, rawColors.pressed];
  const sectionLabelColor = rawColors.foregroundMuted;
  const raisedSurface = rawColors.surface;
  const subtleBorder = isDark ? rawColors.border : rawColors.borderLight;
  const lightShadowColor = rawColors.shadow;
  return { rawColors, isDark, screenBackground, heroGradient, sectionLabelColor, raisedSurface, subtleBorder, lightShadowColor };
}
