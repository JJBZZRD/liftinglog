import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { ModalBlurTarget } from '@/components/modals/frosted-modal-context';
import { glass, radius, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { workoutTitle, type WorkoutSummary } from '../workout-types';

/** A persistent return path above navigation, without shifting the exercise list. */
export function ActiveWorkoutShortcut({ workout, blurTarget, onPress, onLayout }: {
  workout: WorkoutSummary; blurTarget: ModalBlurTarget; onPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const { rawColors, isDark } = useTheme();
  const title = workoutTitle(workout);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Return to active workout, ${title}`}
      onPress={onPress} onLayout={onLayout} className="active:opacity-70"
      style={{ borderRadius: radius.action, borderWidth: 1, borderColor: rawColors.border, overflow: 'hidden' }}>
      <BlurView pointerEvents="none" accessible={false} blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus" intensity={glass.blurIntensity} tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill} />
      <View style={{
        minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[12],
        paddingHorizontal: space[16], paddingVertical: space[12], backgroundColor: `${rawColors.surface}${glass.surfaceAlpha}`,
      }}>
        <View style={{ flex: 1, minWidth: 0, gap: space[4] }}>
          <Text numberOfLines={1} style={{ ...typography.label, fontWeight: '600', color: rawColors.foreground }}>{title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[6] }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: rawColors.primary }} />
            <Text style={{ ...typography.caption, color: rawColors.foregroundSecondary, flexShrink: 1 }}>Active workout</Text>
          </View>
        </View>
        <View style={{ maxWidth: '45%', flexDirection: 'row', alignItems: 'center', gap: space[6] }}>
          <Text style={{ ...typography.label, fontWeight: '600', color: rawColors.primary, flexShrink: 1 }}>Go to workout</Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color={rawColors.primary} />
        </View>
      </View>
    </Pressable>
  );
}
