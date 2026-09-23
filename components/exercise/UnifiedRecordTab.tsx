import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { WorkoutThemeBoundary } from '@/components/workouts/workout-theme';
import { formatRelativeDate } from '@/lib/utils/formatters';
import ManualSetForm from './recording/manual-set-form';
import RecordedSetsPanel from './recording/recorded-sets-panel';
import RecordingModals from './recording/recording-modals';
import WorkoutPickerModal from './recording/workout-picker-modal';
import { useRecordingController } from './recording/use-recording-controller';

type Props = { onHistoryRefresh?: () => void };

export default function UnifiedRecordTab(props: Props) {
  return <WorkoutThemeBoundary><RecordingView {...props} /></WorkoutThemeBoundary>;
}

function RecordingView({ onHistoryRefresh }: Props) {
  const recording = useRecordingController(onHistoryRefresh);
  const { rawColors, exerciseStatus, isExerciseAvailable, recordLoadError, exerciseId, retryExerciseLoad,
    goBackToExercises, workout, workoutId, workoutExerciseId, selectedDate, inProgramMode,
    showDatePicker, setShowDatePicker, selectWorkout, legacyEntryNote, hasConfirmedSets,
    entryCompletedAt, startAnotherEntry, canCompleteProgramExercise, handleProgramCompletePress, handleCompleteManualExercise } = recording;

  if (!isExerciseAvailable || recordLoadError) {
    const message = recordLoadError ?? (exerciseStatus === 'loading' ? 'Loading exercise…'
      : exerciseStatus === 'error' ? 'We couldn’t load this exercise.'
        : exerciseId ? 'This exercise is no longer available.' : 'This exercise link is invalid.');
    return <View className="flex-1 items-center justify-center gap-4 p-6 bg-background">
      <Text className="text-base text-foreground-secondary text-center" selectable>{message}</Text>
      <View className="flex-row gap-3">
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBackToExercises}
          className="items-center justify-center p-3.5 rounded-lg bg-surface-secondary">
          <Text className="text-base font-semibold text-foreground-secondary">Go back</Text>
        </Pressable>
        {(exerciseStatus === 'error' || recordLoadError) && <Pressable accessibilityRole="button"
          accessibilityLabel="Retry loading exercise" onPress={retryExerciseLoad}
          className="items-center justify-center p-3.5 rounded-lg bg-primary">
          <Text className="text-base font-semibold text-primary-foreground">Retry</Text>
        </Pressable>}
      </View>
    </View>;
  }

  const completedWorkout = workout?.completedAt != null;
  const completedEntry = !inProgramMode && entryCompletedAt != null;
  const canRecord = !completedEntry && !completedWorkout && workoutId != null;
  const canComplete = workoutId != null && !completedWorkout && !completedEntry && (inProgramMode ? canCompleteProgramExercise : hasConfirmedSets);

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel="Choose workout"
          disabled={inProgramMode && !workoutExerciseId}
          onPress={() => setShowDatePicker(true)}
          className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-4">
          <View className="w-11 h-11 rounded-xl items-center justify-center bg-primary-light">
            <MaterialCommunityIcons name="dumbbell" size={22} color={rawColors.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-semibold uppercase tracking-widest text-foreground-muted">Workout</Text>
            <Text className="text-base font-semibold mt-1 text-foreground" numberOfLines={1}>
              {workout?.name || (inProgramMode ? recording.activeProgramEntry?.calendar.sessionName : workoutId ? 'Current workout' : 'Choose a workout')}
            </Text>
            <Text className="text-sm mt-1 text-foreground-secondary">
              {formatRelativeDate(selectedDate)}{workout ? ` · ${completedWorkout ? 'Completed' : 'Active'}` : ''}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-down" size={20} color={rawColors.foregroundMuted} />
        </Pressable>

        {canRecord ? <ManualSetForm {...recording} /> : (
          <View className="rounded-2xl border border-border p-6 bg-surface">
            <Text className="text-xl font-semibold text-foreground">{completedWorkout ? 'This workout is complete' : completedEntry ? 'Exercise complete' : 'Start with a workout'}</Text>
            <Text className="mt-2 mb-5 text-base text-foreground-secondary">
              {completedWorkout ? 'Resume this workout before adding more sets.' : completedEntry ? 'Your sets are saved. Add another entry to record this exercise again in the same workout.' : 'Create or select a workout in Workouts, then record your sets here.'}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={completedEntry && !completedWorkout ? "Add another entry" : "Open Workouts"} onPress={completedEntry && !completedWorkout ? startAnotherEntry : () => {
              if (completedWorkout && workoutId) router.replace({ pathname: '/workout-session/[id]', params: { id: String(workoutId) } });
              else router.dismissTo('/(tabs)');
            }}
              className="items-center justify-center p-3.5 rounded-lg bg-primary">
              <Text className="text-base font-semibold text-primary-foreground">{completedEntry && !completedWorkout ? "Add another entry" : completedWorkout ? "Open workout" : "Open Workouts"}</Text>
            </Pressable>
          </View>
        )}
        <RecordedSetsPanel {...recording} />
        {!!legacyEntryNote && <View className="rounded-2xl p-4 bg-surface-secondary">
          <Text className="text-xs font-semibold uppercase tracking-widest text-foreground-muted">Historical exercise note</Text>
          <Text className="mt-2 text-base text-foreground-secondary" selectable>{legacyEntryNote}</Text>
        </View>}
      </ScrollView>
      <View className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-background">
        <Pressable accessibilityRole="button" accessibilityLabel="Complete Exercise" disabled={!canComplete}
          onPress={inProgramMode ? handleProgramCompletePress : handleCompleteManualExercise}
          className={`flex-row items-center justify-center gap-2 py-4 rounded-2xl ${canComplete ? 'bg-primary' : 'bg-surface-secondary'}`}>
          <MaterialCommunityIcons name="check-circle-outline" size={22} color={canComplete ? rawColors.primaryForeground : rawColors.foregroundMuted} />
          <Text className={`text-base font-semibold ${canComplete ? 'text-primary-foreground' : 'text-foreground-muted'}`}>Complete Exercise</Text>
        </Pressable>
      </View>
      <WorkoutPickerModal visible={showDatePicker} onClose={() => setShowDatePicker(false)} date={selectedDate}
        workoutId={workoutId} onSelect={selectWorkout} />
      <RecordingModals {...recording} />
    </View>
  );
}
