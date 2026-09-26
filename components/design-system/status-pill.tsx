import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { motion, radius, sizes, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';

/** The live dot. Its ring pulses outward; under reduced motion it is a still dot. */
export function LiveDot({ pulse = true }: { pulse?: boolean }) {
  const { rawColors } = useTheme();
  const reducedMotion = useReducedMotion();
  const animate = pulse && !reducedMotion;
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!animate) { cancelAnimation(progress); progress.value = 0; return; }
    progress.value = withRepeat(withTiming(1, { duration: motion.livePulse, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(progress);
  }, [animate, progress]);

  // The mockup's ring grows 6 dp over 70% of the cycle, then rests.
  const ring = useAnimatedStyle(() => {
    const t = Math.min(1, progress.value / 0.7);
    return { opacity: animate ? 0.55 * (1 - t) : 0, transform: [{ scale: 1 + t * (12 / sizes.liveDot) }] };
  });

  return <View style={{ width: sizes.liveDot, height: sizes.liveDot, flexShrink: 0 }}>
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.pill, backgroundColor: rawColors.live }, ring]} />
    <View style={{ flex: 1, borderRadius: radius.pill, backgroundColor: rawColors.live }} />
  </View>;
}

/** Workout or exercise state. `live` is the only use of the green highlight on a card. */
export function StatusPill({ status, label }: { status: 'live' | 'completed'; label?: string }) {
  const { rawColors } = useTheme();
  const text = label ?? (status === 'live' ? 'In progress' : 'Completed');

  if (status === 'completed') {
    return <View accessible accessibilityLabel={text}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      <MaterialCommunityIcons name="check" size={14} color={rawColors.foregroundMuted} />
      <Text style={{ color: rawColors.foregroundSecondary, ...typography.pill }}>{text}</Text>
    </View>;
  }

  return <View accessible accessibilityLabel={text}
    style={{
      flexDirection: 'row', alignItems: 'center', gap: space[6], flexShrink: 0, alignSelf: 'flex-start',
      paddingVertical: 3, paddingLeft: 7, paddingRight: 9, borderRadius: radius.pill, backgroundColor: rawColors.liveSoft,
    }}>
    <LiveDot />
    <Text style={{ color: rawColors.liveInk, ...typography.pill }}>{text}</Text>
  </View>;
}
