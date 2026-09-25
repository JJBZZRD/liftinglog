import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import SetItem from '@/components/lists/SetItem';
import { WorkoutStatus } from '@/components/workouts/workout-ui';
import { useUnitPreference } from '@/lib/contexts/UnitPreferenceContext';
import type { SetRow } from '@/lib/db/workouts';
import { motion, radius, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { formatWeightFromKg } from '@/lib/utils/units';
import type { WorkoutPBBadges } from '../workout-pb-badges';
import { dateLabel, type WorkoutExercise } from '../workout-types';

export function WorkoutSetRow({ set, index, onPress, pbBadge }: { set: SetRow; index: number; onPress: () => void; pbBadge?: string }) {
  const { unitPreference } = useUnitPreference();
  return (
    <SetItem variant="workout" index={index + 1} weightKg={set.weightKg} reps={set.reps}
      note={set.note} isWarmup={set.isWarmup} pbBadge={pbBadge} onPress={onPress}
      accessibilityLabel={`Set ${index + 1}, ${formatWeightFromKg(set.weightKg, unitPreference)}, ${set.reps ?? 'not recorded'} reps${set.isWarmup ? ', warm-up' : ''}${pbBadge ? `, current personal best, ${pbBadge}` : ''}`} />
  );
}

export function WorkoutExerciseEntry({ entry, index, onPress, onSetPress, pbBadges }: {
  entry: WorkoutExercise; index: number; onPress: () => void; onSetPress: (id: number) => void; pbBadges?: WorkoutPBBadges;
}) {
  const { rawColors } = useTheme();
  const pbSetCount = entry.sets.filter((set) => pbBadges?.has(set.id)).length;
  return (
    <Animated.View entering={FadeInDown.duration(motion.listEnter).delay(Math.min(index, 5) * motion.stagger).reduceMotion(ReduceMotion.System)} layout={LinearTransition.duration(motion.layout).reduceMotion(ReduceMotion.System)}
      style={{ backgroundColor: rawColors.surface, borderWidth: 1, borderColor: rawColors.border, borderRadius: radius.card, overflow: 'hidden' }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${entry.exerciseName}${pbSetCount ? `, ${pbSetCount} current personal best ${pbSetCount === 1 ? 'set' : 'sets'}` : ''}`}
        className="active:opacity-70" style={{ padding: space[18], gap: space[12] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[8] }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <WorkoutStatus active={entry.completedAt === null} />
          </View>
          <Text style={{ ...typography.caption, flex: 1, minWidth: 0, textAlign: 'right', color: rawColors.foregroundMuted }}>
            {entry.performedAt !== null ? dateLabel(new Date(entry.performedAt)) : ''}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[12] }}>
          <Text style={{ ...typography.caption, color: rawColors.foregroundMuted, fontWeight: '600', letterSpacing: 1 }}>{String(index + 1).padStart(2, '0')}</Text>
          <Text style={{ ...typography.section, flex: 1, color: rawColors.foreground, lineHeight: 26 }}>{entry.exerciseName}</Text>
          <MaterialCommunityIcons name="arrow-top-right" size={20} color={rawColors.foregroundMuted} />
        </View>
      </Pressable>
      {!!entry.note?.trim() && <View style={{ paddingHorizontal: space[18], paddingBottom: space[16] }}>
        <Text style={{ color: rawColors.foregroundMuted, fontSize: 10, letterSpacing: 1.2, marginBottom: 5 }}>EXERCISE NOTE</Text>
        <Text selectable style={{ color: rawColors.foregroundSecondary, fontSize: 14, lineHeight: 21 }}>{entry.note}</Text>
      </View>}
      {entry.sets.map((set, setIndex) => <WorkoutSetRow key={set.id} set={set} index={setIndex} pbBadge={pbBadges?.get(set.id)} onPress={() => onSetPress(set.id)} />)}
      {entry.sets.length === 0 && <Text style={{ ...typography.label, color: rawColors.foregroundMuted, paddingHorizontal: space[18], paddingBottom: space[18] }}>No sets logged yet</Text>}
    </Animated.View>
  );
}
