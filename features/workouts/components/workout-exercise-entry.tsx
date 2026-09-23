import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { WorkoutStatus } from '@/components/workouts/workout-ui';
import { useUnitPreference } from '@/lib/contexts/UnitPreferenceContext';
import type { SetRow } from '@/lib/db/workouts';
import { useTheme } from '@/lib/theme/ThemeContext';
import { formatWeightFromKg } from '@/lib/utils/units';
import { dateLabel, type WorkoutExercise } from '../workout-types';

export function WorkoutSetRow({ set, index, onPress }: { set: SetRow; index: number; onPress: () => void }) {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Set ${index + 1}, ${formatWeightFromKg(set.weightKg, unitPreference)}, ${set.reps ?? 0} reps`}
      className="active:opacity-70" style={{ paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderColor: rawColors.borderLight, gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Text style={{ width: 23, color: rawColors.foregroundMuted, fontSize: 13, fontVariant: ['tabular-nums'] }}>{String(index + 1).padStart(2, '0')}</Text>
        <Text selectable style={{ flex: 1, color: rawColors.foreground, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatWeightFromKg(set.weightKg, unitPreference)}</Text>
        <Text selectable style={{ flex: 1, color: rawColors.foreground, fontSize: 15, fontVariant: ['tabular-nums'] }}>{set.reps ?? '—'} reps</Text>
        {set.isWarmup && <Text style={{ color: rawColors.foregroundMuted, fontSize: 11 }}>Warm-up</Text>}
        <MaterialCommunityIcons name="chevron-right" size={16} color={rawColors.foregroundMuted} />
      </View>
      {!!set.note?.trim() && <Text selectable style={{ color: rawColors.foregroundSecondary, fontSize: 13, lineHeight: 19, paddingLeft: 37 }}>{set.note}</Text>}
    </Pressable>
  );
}

export function WorkoutExerciseEntry({ entry, index, onPress, onSetPress }: {
  entry: WorkoutExercise; index: number; onPress: () => void; onSetPress: (id: number) => void;
}) {
  const { rawColors } = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(220).delay(Math.min(index, 5) * 35).reduceMotion(ReduceMotion.System)} layout={LinearTransition.duration(180).reduceMotion(ReduceMotion.System)}
      style={{ backgroundColor: rawColors.surface, borderWidth: 1, borderColor: rawColors.border, borderRadius: 18, overflow: 'hidden' }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${entry.exerciseName}`}
        className="active:opacity-70" style={{ padding: 18, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 12, color: rawColors.foregroundMuted, fontWeight: '600', letterSpacing: 1 }}>{String(index + 1).padStart(2, '0')}</Text>
          <Text style={{ flex: 1, color: rawColors.foreground, fontSize: 19, lineHeight: 26, fontWeight: '600' }}>{entry.exerciseName}</Text>
          <MaterialCommunityIcons name="arrow-top-right" size={20} color={rawColors.foregroundMuted} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <WorkoutStatus active={entry.completedAt === null} />
          {entry.performedAt !== null && <Text style={{ color: rawColors.foregroundMuted, fontSize: 12 }}>{dateLabel(new Date(entry.performedAt))}</Text>}
        </View>
      </Pressable>
      {!!entry.note?.trim() && <View style={{ paddingHorizontal: 18, paddingBottom: 14 }}>
        <Text style={{ color: rawColors.foregroundMuted, fontSize: 10, letterSpacing: 1.2, marginBottom: 5 }}>EXERCISE NOTE</Text>
        <Text selectable style={{ color: rawColors.foregroundSecondary, fontSize: 14, lineHeight: 21 }}>{entry.note}</Text>
      </View>}
      {entry.sets.map((set, setIndex) => <WorkoutSetRow key={set.id} set={set} index={setIndex} onPress={() => onSetPress(set.id)} />)}
      {entry.sets.length === 0 && <Text style={{ color: rawColors.foregroundMuted, fontSize: 14, paddingHorizontal: 18, paddingBottom: 18 }}>No sets logged yet</Text>}
    </Animated.View>
  );
}
