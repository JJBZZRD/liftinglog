import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { listWorkoutSessionsForDate } from '@/lib/db/workoutSessions';
import AppModal from '@/components/modals/BaseModal';
import { useWorkoutTheme } from '@/components/workouts/workout-theme';

type WorkoutChoice = Awaited<ReturnType<typeof listWorkoutSessionsForDate>>[number];
type Props = {
  visible: boolean;
  date: Date;
  workoutId: number | null;
  onClose: () => void;
  onSelect: (workout: WorkoutChoice) => Promise<void>;
};

function calendarDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** A calendar narrows the list; only choosing a workout changes ownership. */
export default function WorkoutPickerModal({ visible, date, workoutId, onClose, onSelect }: Props) {
  const { rawColors } = useWorkoutTheme();
  const [day, setDay] = useState(calendarDay(date));
  const [workouts, setWorkouts] = useState<WorkoutChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (visible) {
      setDay(calendarDay(date));
      setError(null);
    }
  }, [date, visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setWorkouts([]);
    void listWorkoutSessionsForDate(new Date(`${day}T12:00:00`).getTime())
      .then(rows => { if (!cancelled) setWorkouts(rows); })
      .catch(() => { if (!cancelled) setError('Could not load workouts. Try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [day, visible, attempt]);

  const choose = useCallback(async (workout: WorkoutChoice) => {
    if (saving != null) return;
    setSaving(workout.id);
    setError(null);
    try {
      await onSelect(workout);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not change workout. Try again.');
    } finally {
      setSaving(null);
    }
  }, [onClose, onSelect, saving]);

  return (
    <AppModal visible={visible} onClose={saving == null ? onClose : () => { }} maxWidth={480}>
      <Text className="text-xl font-bold text-foreground">Choose workout</Text>
      <Text className="mt-1 mb-4 text-sm text-foreground-secondary">Choose a day, then the workout this exercise belongs to.</Text>
      <Calendar
        current={day}
        onDayPress={({ dateString }) => { setDay(dateString); setError(null); }}
        markedDates={{ [day]: { selected: true, selectedColor: rawColors.primary } }}
        theme={{
          calendarBackground: rawColors.surface, textSectionTitleColor: rawColors.foregroundSecondary,
          dayTextColor: rawColors.foreground, monthTextColor: rawColors.foreground, textDisabledColor: rawColors.foregroundMuted,
          arrowColor: rawColors.primary, todayTextColor: rawColors.primary
        }}
      />
      <ScrollView style={{ maxHeight: 230 }} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
        {loading ? <ActivityIndicator accessibilityLabel="Loading workouts" color={rawColors.primary} /> : workouts.map(workout => (
          <Pressable
            key={workout.id}
            accessibilityRole="button"
            accessibilityLabel={`Select ${workout.name || 'Workout'} ${workout.id}`}
            accessibilityState={{ selected: workout.id === workoutId, disabled: saving != null }}
            disabled={saving != null}
            onPress={() => void choose(workout)}
            className="flex-row items-center gap-3 p-3.5 rounded-xl bg-surface-secondary"
          >
            <MaterialCommunityIcons name={workout.id === workoutId ? 'check-circle' : 'dumbbell'} size={22} color={rawColors.primary} />
            <View className="flex-1">
              <Text className="text-base font-semibold text-foreground">{workout.name || 'Workout'}</Text>
              <Text className="text-sm text-foreground-secondary">
                {new Date(workout.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' · '}{workout.exerciseCount} exercises{' · '}{workout.completedAt == null ? 'Active' : 'Completed'}
              </Text>
            </View>
            {saving === workout.id && <ActivityIndicator color={rawColors.primary} />}
          </Pressable>
        ))}
        {!loading && workouts.length === 0 && <Text className="py-3 text-center text-foreground-secondary">No workouts on this day.</Text>}
      </ScrollView>
      {error && <View className="mb-3"><Text accessibilityRole="alert" className="text-sm text-destructive">{error}</Text>
        <Pressable onPress={() => { setError(null); setAttempt(value => value + 1); }}><Text className="mt-2 text-primary">Retry</Text></Pressable></View>}
      <View className="flex-row gap-3">
        <Pressable onPress={onClose} disabled={saving != null} className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary">
          <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
        </Pressable>
        <Pressable onPress={() => { onClose(); router.dismissTo('/(tabs)'); }} disabled={saving != null} className="flex-1 items-center justify-center p-3.5 rounded-lg bg-primary">
          <Text className="text-base font-semibold text-primary-foreground">Workouts</Text>
        </Pressable>
      </View>
    </AppModal>
  );
}
