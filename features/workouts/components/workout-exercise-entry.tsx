import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import SetItem from '@/components/lists/SetItem';
import { StatusPill } from '@/components/design-system/status-pill';
import { useUnitPreference } from '@/lib/contexts/UnitPreferenceContext';
import type { SetRow } from '@/lib/db/workouts';
import { motion, radius, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { formatWeightFromKg } from '@/lib/utils/units';
import type { WorkoutPBBadges } from '../workout-pb-badges';
import { selectWorkoutSetHighlights } from '../workout-set-highlights';
import { dateLabel, type WorkoutExercise } from '../workout-types';

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

export function WorkoutExerciseEntry({ entry, index, onPress, onSetPress, pbBadges }: {
  entry: WorkoutExercise; index: number; onPress: () => void; onSetPress: (id: number) => void; pbBadges?: WorkoutPBBadges;
}) {
  const { rawColors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const { bestSetId, highlightedSetIds } = selectWorkoutSetHighlights(entry.sets, pbBadges ?? new Map());
  const hasHiddenSets = entry.sets.some((set) => !highlightedSetIds.has(set.id));
  const pbSetCount = entry.sets.filter((set) => pbBadges?.has(set.id)).length;
  // Let native text determine expanded height; an animated height can clip the
  // final control when newly mounted notes/warm-up labels finish measuring.
  return (
    <Animated.View entering={FadeInDown.duration(motion.listEnter).delay(Math.min(index, 5) * motion.stagger).reduceMotion(ReduceMotion.System)}
      style={{ backgroundColor: rawColors.surface, borderWidth: 1, borderColor: rawColors.border, borderRadius: radius.card, overflow: 'hidden' }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${entry.exerciseName}${pbSetCount ? `, ${pbSetCount} personal best ${pbSetCount === 1 ? 'set' : 'sets'} achieved` : ''}`}
        className="active:opacity-70" style={{ padding: space[18], gap: space[12] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[8] }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <StatusPill status={entry.completedAt === null ? 'live' : 'completed'} />
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
      {entry.sets.map((set, setIndex) => (expanded || highlightedSetIds.has(set.id)) &&
        <WorkoutSetRow key={set.id} set={set} index={setIndex} pbBadge={pbBadges?.get(set.id)}
          isBestSet={set.id === bestSetId} onPress={() => onSetPress(set.id)} />)}
      {hasHiddenSets && <Pressable onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button" accessibilityState={{ expanded }}
        accessibilityLabel={`${expanded ? 'Show highlights' : `Show all ${entry.sets.length} sets`} for ${entry.exerciseName}`}
        className="active:opacity-70" style={{
          minHeight: 44, paddingHorizontal: space[18], paddingVertical: space[12], gap: space[12],
          flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: rawColors.borderLight,
        }}>
        <Text style={{ ...typography.label, color: rawColors.primary, fontWeight: '600', flex: 1 }}>
          {expanded ? 'Show highlights' : `Show all ${entry.sets.length} sets`}
        </Text>
        <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={rawColors.primary} />
      </Pressable>}
      {entry.sets.length === 0 && <Text style={{ ...typography.label, color: rawColors.foregroundMuted, paddingHorizontal: space[18], paddingBottom: space[18] }}>No sets logged yet</Text>}
    </Animated.View>
  );
}
