import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { sizes } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';

/** Keep mounted; supply scroll-derived opacity to track gestures without timing lag. */
export function ScrollFade({ edge, blurTarget, inset = 0, opacity }: { edge: 'top' | 'bottom'; blurTarget: RefObject<View | null>; inset?: number; opacity?: Readonly<SharedValue<number>> }) {
  const { rawColors, isDark } = useTheme();
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity?.value ?? 1 }));
  const top = edge === 'top';
  return <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[{ position: 'absolute', left: 0, right: 0, [edge]: inset, height: sizes.scrollFade }, animatedStyle]}>
    {[0, 1, 2].map((step) => <BlurView key={step} pointerEvents="none"
      blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus"
      tint={isDark ? 'dark' : 'light'} intensity={8 + step * 8}
      style={{ position: 'absolute', left: 0, right: 0, [edge]: 0, height: sizes.scrollFade * (1 - step / 3), opacity: 0.12 }} />)}
    <LinearGradient colors={top ? [rawColors.background, `${rawColors.background}00`] : [`${rawColors.background}00`, rawColors.background]}
      style={StyleSheet.absoluteFill} />
  </Animated.View>;
}
