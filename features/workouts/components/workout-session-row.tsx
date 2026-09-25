import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { Metric, WorkoutStatus } from '@/components/workouts/workout-ui';
import { useUnitPreference } from '@/lib/contexts/UnitPreferenceContext';
import { radius, space, typography } from '@/lib/design-system/tokens';
import { useResponsiveLayout } from '@/lib/design-system/use-responsive-layout';
import { useTheme } from '@/lib/theme/ThemeContext';
import { formatVolumeFromKg, getWeightUnitLabel } from '@/lib/utils/units';
import { workoutTitle, type WorkoutSummary } from '../workout-types';

export function WorkoutSessionRow({ workout, index, onPress }: { workout: WorkoutSummary; index: number; onPress: () => void }) {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const { cardPadding, itemGap } = useResponsiveLayout();
  // Android wrapped text can report its final height after a layout transition
  // captures the row. Keep native height updates immediate to avoid overlapping cards.
  return (
    <Animated.View entering={FadeInDown.duration(240).delay(Math.min(index, 5) * 40).reduceMotion(ReduceMotion.System)}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${workoutTitle(workout)}, ${workout.completedAt === null ? 'in progress' : 'completed'}, ${workout.exerciseCount} exercises`} onPress={onPress}
        className="active:opacity-70" style={{ minWidth: 0, backgroundColor: rawColors.surface, borderWidth: 1, borderColor: rawColors.border, borderRadius: radius.card, padding: cardPadding, gap: itemGap }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: space[12], rowGap: space[8], alignItems: 'center' }}>
          <WorkoutStatus active={workout.completedAt === null} />
          <Text style={{ flexShrink: 1, ...typography.caption, color: rawColors.foregroundMuted, fontVariant: ['tabular-nums'] }}>
            {new Date(workout.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[12] }}>
          <Text numberOfLines={2} style={{ flex: 1, minWidth: 0, color: rawColors.foreground, ...typography.cardTitle }}>{workoutTitle(workout)}</Text>
          <MaterialCommunityIcons name="arrow-top-right" size={22} color={rawColors.foregroundMuted} style={{ flexShrink: 0 }} />
        </View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: rawColors.borderLight, paddingTop: itemGap, gap: itemGap }}>
          <Metric label="Exercises" value={String(workout.exerciseCount)} />
          <Metric label="Sets" value={String(workout.setCount)} />
          <Metric label={`Volume · ${getWeightUnitLabel(unitPreference)}`} value={formatVolumeFromKg(workout.volumeKg, unitPreference, { abbreviate: true })} />
        </View>
      </Pressable>
    </Animated.View>
  );
}
