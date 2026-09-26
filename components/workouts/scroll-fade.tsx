import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { sizes } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';

// Eased "scrim" curve: alpha falls quickly near the edge and flattens out, so the
// fade has no visible start or end line. Pairs are [position, alpha].
const scrim = [
  [0, 1], [0.19, 0.738], [0.34, 0.541], [0.47, 0.382], [0.565, 0.278], [0.65, 0.194],
  [0.73, 0.126], [0.802, 0.075], [0.861, 0.042], [0.91, 0.021], [0.952, 0.008], [0.982, 0.002], [1, 0],
] as const;

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Keep mounted; supply scroll-derived opacity to track gestures without timing lag.
 * `solidExtent` adds an opaque band at the edge, for example to cover a status bar.
 */
export function ScrollFade({ edge, inset = 0, solidExtent = 0, opacity }: { edge: 'top' | 'bottom'; inset?: number; solidExtent?: number; opacity?: Readonly<SharedValue<number>> }) {
  const { rawColors } = useTheme();
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity?.value ?? 1 }));
  const height = solidExtent + sizes.scrollFade;
  const solid = solidExtent / height;
  const colors = scrim.map(([, alpha]) => withAlpha(rawColors.background, alpha)) as [string, string, ...string[]];
  const locations = scrim.map(([position]) => solid + position * (1 - solid)) as [number, number, ...number[]];
  const top = edge === 'top';
  return <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[{ position: 'absolute', left: 0, right: 0, [edge]: inset, height }, animatedStyle]}>
    <LinearGradient colors={colors} locations={locations}
      start={{ x: 0, y: top ? 0 : 1 }} end={{ x: 0, y: top ? 1 : 0 }} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}
