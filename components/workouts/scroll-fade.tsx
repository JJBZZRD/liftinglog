import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';

/** Keep mounted and toggle visible so the glass can fade out as well as in. */
export function ScrollFade({ edge, blurTarget, inset = 0, visible = true }: { edge: 'top' | 'bottom'; blurTarget: RefObject<View | null>; inset?: number; visible?: boolean }) {
  const { rawColors, isDark } = useTheme();
  const opacity = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: motion.layout, reduceMotion: ReduceMotion.System });
  }, [opacity, visible]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const top = edge === 'top';
  return <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[{ position: 'absolute', left: 0, right: 0, [edge]: inset, height: 36 }, animatedStyle]}>
    {[0, 1, 2].map((step) => <BlurView key={step} pointerEvents="none"
      blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus"
      tint={isDark ? 'dark' : 'light'} intensity={8 + step * 8}
      style={{ position: 'absolute', left: 0, right: 0, [edge]: 0, height: 36 - step * 12, opacity: 0.12 }} />)}
    <LinearGradient colors={top ? [rawColors.background, `${rawColors.background}00`] : [`${rawColors.background}00`, rawColors.background]}
      style={StyleSheet.absoluteFill} />
  </Animated.View>;
}
