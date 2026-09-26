import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import SetItem from '@/components/lists/SetItem';
import { Icon } from '@/components/design-system/icon';
import { StatusPill } from '@/components/design-system/status-pill';
import { useUnitPreference } from '@/lib/contexts/UnitPreferenceContext';
import type { SetRow } from '@/lib/db/workouts';
import { motion, radius, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { formatWeightFromKg } from '@/lib/utils/units';
import type { WorkoutPBBadges } from '../workout-pb-badges';
import { selectWorkoutSetHighlights } from '../workout-set-highlights';
import { dateLabel, timeLabel, type WorkoutExercise } from '../workout-types';

export function WorkoutSetRow({ set, index, onPress, pbBadge, isBestSet }: {
  set: SetRow; index: number; onPress: () => void; pbBadge?: string; isBestSet?: boolean;
}) {
  const { unitPreference } = useUnitPreference();
  return (
    <SetItem variant="workout" index={index + 1} weightKg={set.weightKg} reps={set.reps}
      note={set.note} isWarmup={set.isWarmup} pbBadge={pbBadge} isBestSet={isBestSet} onPress={onPress}
      accessibilityLabel={`Set ${index + 1}, ${formatWeightFromKg(set.weightKg, unitPreference)}, ${set.reps ?? 'not recorded'} reps${set.isWarmup ? ', warm-up' : ''}${isBestSet ? ', best set in this entry' : ''}${pbBadge ? `, personal best achieved, ${pbBadge}` : ''}`} />
  );
}

/** A workout-detail exercise card, as drawn in the mockups. Tapping the header opens the exercise. */
export function WorkoutExerciseEntry({ entry, index, workoutStartedAt, onPress, onSetPress, pbBadges }: {
  entry: WorkoutExercise; index: number; workoutStartedAt?: number; onPress: () => void; onSetPress: (id: number) => void; pbBadges?: WorkoutPBBadges;
}) {
  const { rawColors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const { bestSetId, highlightedSetIds } = selectWorkoutSetHighlights(entry.sets, pbBadges ?? new Map());
  const hasHiddenSets = entry.sets.some((set) => !highlightedSetIds.has(set.id));
  const pbSetCount = entry.sets.filter((set) => pbBadges?.has(set.id)).length;
  const performedAt = entry.performedAt ?? entry.completedAt;
  // Show the time; fall back to the day for legacy entries logged on another day.
  const when = performedAt === null ? null
    : workoutStartedAt === undefined || new Date(performedAt).toDateString() === new Date(workoutStartedAt).toDateString() ? timeLabel(performedAt) : dateLabel(new Date(performedAt));
  // Let native text determine expanded height; an animated height can clip the
  // final control when newly mounted notes/warm-up labels finish measuring.
  return (
    <Animated.View entering={FadeInDown.duration(motion.listEnter).delay(Math.min(index, 5) * motion.stagger).reduceMotion(ReduceMotion.System)}
      style={{ backgroundColor: rawColors.surface, borderWidth: 1, borderColor: rawColors.border, borderRadius: radius.card, paddingHorizontal: space[16], paddingVertical: entry.sets.length ? space[16] : space[12], gap: space[6] }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${entry.exerciseName}, ${entry.completedAt === null ? 'in progress' : 'completed'}${pbSetCount ? `, ${pbSetCount} personal best ${pbSetCount === 1 ? 'set' : 'sets'} achieved` : ''}`}
        className="active:opacity-70" style={{ gap: space[6] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[8] }}>
          <StatusPill status={entry.completedAt === null ? 'live' : 'completed'} />
          {when && <Text style={{ ...typography.caption, color: rawColors.foregroundMuted, fontVariant: ['tabular-nums'] }}>{when}</Text>}
        </View>
        <Text style={{ fontSize: 18, fontWeight: '600', color: rawColors.foreground }}>{entry.exerciseName}</Text>
      </Pressable>
      {!!entry.note?.trim() && <Text selectable style={{ color: rawColors.foregroundSecondary, fontSize: 14, lineHeight: 21, paddingBottom: space[4] }}>{entry.note}</Text>}
      {entry.sets.length > 0 && <View>
        {entry.sets.map((set, setIndex) => (expanded || highlightedSetIds.has(set.id)) &&
          <WorkoutSetRow key={set.id} set={set} index={setIndex} pbBadge={pbBadges?.get(set.id)}
            isBestSet={set.id === bestSetId} onPress={() => onSetPress(set.id)} />)}
        {hasHiddenSets && <Pressable onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button" accessibilityState={{ expanded }}
          accessibilityLabel={`${expanded ? 'Show highlights' : `Show all ${entry.sets.length} sets`} for ${entry.exerciseName}`}
          className="active:opacity-70" style={{
            minHeight: 40, paddingTop: space[8], gap: space[6],
            flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: rawColors.borderLight,
          }}>
          <Text style={{ fontSize: 13, color: rawColors.foregroundSecondary, fontWeight: '600', flex: 1 }}>
            {expanded ? 'Show highlights' : `Show all ${entry.sets.length} sets`}
          </Text>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={rawColors.foregroundMuted} />
        </Pressable>}
      </View>}
    </Animated.View>
  );
}
