import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme/ThemeContext';

export function ScrollFade({ edge, blurTarget, inset = 0 }: { edge: 'top' | 'bottom'; blurTarget: RefObject<View | null>; inset?: number }) {
  const { rawColors, isDark } = useTheme();
  const top = edge === 'top';
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, [edge]: inset, height: 36 }}>
    {[0, 1, 2].map((step) => <BlurView key={step} pointerEvents="none"
      blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus"
      tint={isDark ? 'dark' : 'light'} intensity={8 + step * 8}
      style={{ position: 'absolute', left: 0, right: 0, [edge]: 0, height: 36 - step * 12, opacity: 0.12 }} />)}
    <LinearGradient colors={top ? [rawColors.background, `${rawColors.background}00`] : [`${rawColors.background}00`, rawColors.background]}
      style={StyleSheet.absoluteFill} />
  </View>;
}
