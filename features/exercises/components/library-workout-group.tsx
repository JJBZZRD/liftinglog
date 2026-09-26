import { Pressable, Text, View } from 'react-native';
import { GroupedList, GroupLabel, ListRow } from '@/components/design-system/grouped-list';
import { Icon } from '@/components/design-system/icon';
import { LiveDot, StatusPill } from '@/components/design-system/status-pill';
import { radius, space } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { workoutTitle, type WorkoutDetail, type WorkoutExercise } from '@/features/workouts/workout-types';

/** The pill in the group heading that returns to the active workout. */
function ReturnPill({ title, onPress }: { title: string; onPress: () => void }) {
  const { rawColors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Return to ${title}`} onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }} className="active:opacity-70"
      style={{
        flexShrink: 1, minWidth: 0, height: 32, flexDirection: 'row', alignItems: 'center', gap: space[6],
        paddingLeft: 10, paddingRight: space[8], borderRadius: radius.pill, backgroundColor: rawColors.liveSoft,
      }}>
      <LiveDot />
      <Text numberOfLines={1} style={{ flexShrink: 1, color: rawColors.liveInk, fontSize: 13, fontWeight: '700' }}>{title}</Text>
      <Icon name="arrow-right" size={16} color={rawColors.liveInk} />
    </Pressable>
  );
}

/**
 * "In this workout": the active workout's in-progress exercises at the top of the
 * library, with a return pill in the heading. Replaces the floating shortcut.
 */
export function LibraryWorkoutGroup({ workout, onReturn, onOpenEntry }: {
  workout: WorkoutDetail; onReturn: () => void; onOpenEntry: (entry: WorkoutExercise) => void;
}) {
  const entries = workout.exercises.filter((entry) => entry.completedAt === null && entry.sets.length > 0);
  const title = workoutTitle(workout);
  return (
    <View style={{ gap: space[8] }}>
      <GroupLabel title="In this workout" accessory={<ReturnPill title={title} onPress={onReturn} />} />
      <GroupedList>
        {entries.length === 0 && <ListRow title="Nothing logged yet" subtitle="Choose an exercise below to start" />}
        {entries.map((entry) => {
          const sets = `${entry.sets.length} ${entry.sets.length === 1 ? 'set' : 'sets'} logged`;
          return <ListRow key={entry.id} title={entry.exerciseName} subtitle={sets}
            accessibilityLabel={`${entry.exerciseName}, ${sets}, in progress`}
            trailing={<StatusPill status="live" />} onPress={() => onOpenEntry(entry)} />;
        })}
      </GroupedList>
    </View>
  );
}
