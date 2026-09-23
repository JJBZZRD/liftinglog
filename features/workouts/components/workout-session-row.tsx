import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { Metric, WorkoutStatus } from '@/components/workouts/workout-ui';
import { useUnitPreference } from '@/lib/contexts/UnitPreferenceContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { formatVolumeFromKg, getWeightUnitLabel } from '@/lib/utils/units';
import { workoutTitle, type WorkoutSummary } from '../workout-types';

export function WorkoutSessionRow({ workout, index, onPress }: { workout: WorkoutSummary; index: number; onPress: () => void }) {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  return (
    <Animated.View entering={FadeInDown.duration(240).delay(Math.min(index, 5) * 40).reduceMotion(ReduceMotion.System)} layout={LinearTransition.duration(180).reduceMotion(ReduceMotion.System)}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${workoutTitle(workout)}, ${workout.completedAt === null ? 'in progress' : 'completed'}, ${workout.exerciseCount} exercises`} onPress={onPress}
        className="active:opacity-70" style={{ backgroundColor: rawColors.surface, borderWidth: 1, borderColor: rawColors.border, borderRadius: 18, padding: 20, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <WorkoutStatus active={workout.completedAt === null} />
          <Text style={{ fontSize: 12, color: rawColors.foregroundMuted, fontVariant: ['tabular-nums'] }}>
            {new Date(workout.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text numberOfLines={2} style={{ flex: 1, color: rawColors.foreground, fontSize: 23, lineHeight: 29, fontWeight: '600' }}>{workoutTitle(workout)}</Text>
          <MaterialCommunityIcons name="arrow-top-right" size={22} color={rawColors.foregroundMuted} />
        </View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: rawColors.borderLight, paddingTop: 17, gap: 18 }}>
          <Metric label="Exercises" value={String(workout.exerciseCount)} />
          <Metric label="Sets" value={String(workout.setCount)} />
          <Metric label={`Volume · ${getWeightUnitLabel(unitPreference)}`} value={formatVolumeFromKg(workout.volumeKg, unitPreference, { abbreviate: true })} />
        </View>
      </Pressable>
    </Animated.View>
  );
}
