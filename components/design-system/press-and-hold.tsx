import * as Haptics from 'expo-haptics';
import { useCallback, useRef } from 'react';
import { View, type AccessibilityActionEvent } from 'react-native';
import Animated, {
  cancelAnimation, Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { motion, sizes } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';

const HOLD_SCALE = 0.97;

/**
 * Press-and-hold for a destructive shortcut on a tappable card. Spread `pressableProps`
 * onto the card's `Pressable` (they replace its `onPress`), wrap the card in an
 * `Animated.View` with `holdStyle`, and render `<HoldProgress progress={progress} />`
 * inside it.
 *
 * Feedback starts after `motion.holdDelay` so a scroll that begins on the card doesn't
 * flash it. Releasing early cancels. When the fill completes, a haptic fires, `onHold`
 * runs, and the tap that ends the press is swallowed. Screen readers get the same
 * action through `accessibilityActions`.
 */
export function usePressAndHold({ onHold, onPress, holdLabel, disabled = false }: {
  onHold: () => void;
  /** The card's ordinary tap. */
  onPress?: () => void;
  /** Screen-reader name of the hold action, such as “Delete workout”. */
  holdLabel: string;
  disabled?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const completed = useRef(false);

  const complete = useCallback(() => {
    completed.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    onHold();
  }, [onHold]);

  const onPressIn = useCallback(() => {
    if (disabled) return;
    completed.current = false;
    progress.value = withDelay(motion.holdDelay, withTiming(1, { duration: motion.hold, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(complete)();
    }));
  }, [complete, disabled, progress]);

  const onPressOut = useCallback(() => {
    if (completed.current) { progress.value = 0; return; }
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: motion.holdRelease });
  }, [progress]);

  const handlePress = useCallback(() => {
    if (completed.current) { completed.current = false; return; }
    onPress?.();
  }, [onPress]);

  const onAccessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'longpress' && !disabled) onHold();
    else if (event.nativeEvent.actionName === 'activate') onPress?.();
  }, [disabled, onHold, onPress]);

  // The card settles to its held scale over the first third of the fill.
  const holdStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reducedMotion ? 1 : 1 - (1 - HOLD_SCALE) * Math.min(1, progress.value * 3) }],
  }));

  return {
    progress,
    holdStyle,
    pressableProps: {
      onPressIn, onPressOut, onPress: handlePress,
      accessibilityActions: [{ name: 'activate' as const }, { name: 'longpress' as const, label: holdLabel }],
      onAccessibilityAction,
    },
  };
}

/** The destructive tint and bottom fill bar that show hold progress. Place it last inside the card. */
export function HoldProgress({ progress }: { progress: SharedValue<number> }) {
  const { rawColors } = useTheme();
  const tint = useAnimatedStyle(() => ({ opacity: progress.value > 0 ? Math.min(1, progress.value * 2) : 0 }));
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `${rawColors.destructive}0F` }, tint]} />
    <Animated.View style={[{ position: 'absolute', left: 0, bottom: 0, height: sizes.holdBar, backgroundColor: rawColors.destructive }, bar]} />
  </View>;
}
