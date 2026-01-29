import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Keyboard, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import SetItem from "../../../components/lists/SetItem";
import DatePickerModal from "../../../components/modals/DatePickerModal";
import EditSetModal from "../../../components/modals/EditSetModal";
import TimerModal from "../../../components/TimerModal";
import { getLastRestSeconds, setLastRestSeconds } from "../../../lib/db/exercises";
import {
  addSet,
  addWorkoutExercise,
  completeExerciseEntry,
  deleteSet,
  getOpenWorkoutExercise,
  getOrCreateActiveWorkout,
  listSetsForWorkoutExercise,
  updateExerciseEntryDate,
  updateSet,
  updateWorkoutExerciseInputs,
  type SetRow,
} from "../../../lib/db/workouts";
import { detectAndRecordPRs } from "../../../lib/pr/detection";
import { useTheme } from "../../../lib/theme/ThemeContext";
import { timerStore, type Timer } from "../../../lib/timerStore";
import { formatRelativeDate, formatTime } from "../../../lib/utils/formatters";

type RecordTabProps = {
  onHistoryRefresh?: () => void;
};

export default function RecordTab({ onHistoryRefresh }: RecordTabProps) {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const exerciseId = typeof params.id === "string" ? parseInt(params.id, 10) : null;
  const exerciseName = typeof params.name === "string" ? params.name : "Exercise";

  const [workoutId, setWorkoutId] = useState<number | null>(null);
  const [workoutExerciseId, setWorkoutExerciseId] = useState<number | null>(null);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [weight, setWeightState] = useState("");
  const [reps, setRepsState] = useState("");
  const [note, setNote] = useState("");
  const [setIndex, setSetIndex] = useState(1);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedSet, setSelectedSet] = useState<SetRow | null>(null);

  // Timer state with real-time updates
  const [timerModalVisible, setTimerModalVisible] = useState(false);
  const [currentTimer, setCurrentTimer] = useState<Timer | null>(null);
  const [timerMinutes, setTimerMinutes] = useState("1");
  const [timerSeconds, setTimerSeconds] = useState("30");

  // Date picker state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Handler for date change - updates state immediately, syncs to DB
  const handleDateChange = useCallback((date: Date) => {
    setSelectedDate(date);
    setShowDatePicker(false);
    
    // Update exercise entry date in background
    if (workoutExerciseId) {
      updateExerciseEntryDate(workoutExerciseId, date.getTime());
    }
  }, [workoutExerciseId]);

  const loadWorkout = useCallback(async () => {
    if (!exerciseId) return;

    const activeWorkoutId = await getOrCreateActiveWorkout();
    setWorkoutId(activeWorkoutId);

    // Find an OPEN (not completed) workout_exercise entry for this exercise
    const openWorkoutExercise = await getOpenWorkoutExercise(activeWorkoutId, exerciseId);

    let weId: number;
    if (openWorkoutExercise) {
      // Reuse existing open entry
      weId = openWorkoutExercise.id;
      setWorkoutExerciseId(weId);
      
      if (openWorkoutExercise.currentWeight !== null) {
        setWeightState(String(openWorkoutExercise.currentWeight));
      }
      if (openWorkoutExercise.currentReps !== null) {
        setRepsState(String(openWorkoutExercise.currentReps));
      }
    } else {
      // No open entry exists - create a new one
      weId = await addWorkoutExercise({
        workout_id: activeWorkoutId,
        exercise_id: exerciseId,
        performed_at: selectedDate.getTime(),
      });
      setWorkoutExerciseId(weId);
      // Reset input fields for new entry
      setWeightState("");
      setRepsState("");
    }

    // List sets for THIS workout_exercise entry only (not all sets for the exercise)
    const exerciseSets = await listSetsForWorkoutExercise(weId);
    setSets(exerciseSets);
    setSetIndex(exerciseSets.length > 0 ? exerciseSets.length + 1 : 1);

    const lastRest = await getLastRestSeconds(exerciseId);
    if (lastRest !== null && lastRest > 0) {
      const mins = Math.floor(lastRest / 60);
      const secs = lastRest % 60;
      setTimerMinutes(String(mins));
      setTimerSeconds(String(secs));
    }
  }, [exerciseId]);

  useEffect(() => {
    loadWorkout();
  }, [loadWorkout]);

  const setWeight = useCallback((value: string) => {
    setWeightState(value);
    if (workoutExerciseId) {
      const numValue = value.trim() ? parseFloat(value) : null;
      updateWorkoutExerciseInputs(workoutExerciseId, { currentWeight: numValue });
    }
  }, [workoutExerciseId]);

  const setReps = useCallback((value: string) => {
    setRepsState(value);
    if (workoutExerciseId) {
      const numValue = value.trim() ? parseInt(value, 10) : null;
      updateWorkoutExerciseInputs(workoutExerciseId, { currentReps: numValue });
    }
  }, [workoutExerciseId]);

  useEffect(() => {
    const unsubscribe = timerStore.subscribe((timersByExercise, _tick) => {
      if (exerciseId) {
        const timer = timersByExercise.get(exerciseId);
        setCurrentTimer(timer ?? null);
      }
    });
    return unsubscribe;
  }, [exerciseId]);

  const handleAddSet = useCallback(async () => {
    Keyboard.dismiss();
    if (!workoutId || !exerciseId || !workoutExerciseId) return;

    const weightValue = weight.trim() ? parseFloat(weight) : null;
    const repsValue = reps.trim() ? parseInt(reps, 10) : null;
    const noteValue = note.trim() || null;

    if (!weightValue || weightValue === 0 || !repsValue || repsValue === 0) {
      return;
    }

    const newSetId = await addSet({
      workout_id: workoutId,
      exercise_id: exerciseId,
      workout_exercise_id: workoutExerciseId,
      weight_kg: weightValue,
      reps: repsValue,
      note: noteValue,
      set_index: setIndex,
      performed_at: selectedDate.getTime(),
    });

    // Detect and record PRs for the newly added set
    if (newSetId) {
      await detectAndRecordPRs(newSetId, exerciseId, weightValue, repsValue, selectedDate.getTime());
    }

    setNote("");
    await loadWorkout();
    onHistoryRefresh?.();
  }, [workoutId, exerciseId, workoutExerciseId, weight, reps, note, setIndex, selectedDate, loadWorkout, onHistoryRefresh]);

  const handleCompleteExercise = useCallback(async () => {
    if (!workoutExerciseId) return;
    
    if (currentTimer) {
      await timerStore.deleteTimer(currentTimer.id);
    }
    
    // Complete exercise entry with the selected date
    await completeExerciseEntry(workoutExerciseId, selectedDate.getTime());
    router.back();
  }, [workoutExerciseId, currentTimer, selectedDate]);

  const handleTimerPress = useCallback(async () => {
    if (!exerciseId) return;

    if (currentTimer) {
      if (currentTimer.isRunning) {
        await timerStore.stopTimer(currentTimer.id);
      } else {
        await timerStore.startTimer(currentTimer.id);
      }
    } else {
      const mins = parseInt(timerMinutes, 10) || 1;
      const secs = parseInt(timerSeconds, 10) || 30;
      const totalSeconds = mins * 60 + secs;

      await setLastRestSeconds(exerciseId, totalSeconds);

      const id = timerStore.createTimer(exerciseId, exerciseName, totalSeconds);
      await timerStore.startTimer(id);
    }
  }, [exerciseId, exerciseName, currentTimer, timerMinutes, timerSeconds]);

  const handleSaveRestTime = useCallback(async (seconds: number) => {
    if (!exerciseId) return;
    await setLastRestSeconds(exerciseId, seconds);
  }, [exerciseId]);

  const handleTimerLongPress = useCallback(() => {
    if (currentTimer) {
      const mins = Math.floor(currentTimer.durationSeconds / 60);
      const secs = currentTimer.durationSeconds % 60;
      setTimerMinutes(String(mins));
      setTimerSeconds(String(secs));
    }
    setTimerModalVisible(true);
  }, [currentTimer]);

  const handleLongPressSet = useCallback((set: SetRow) => {
    setSelectedSet(set);
    setEditModalVisible(true);
  }, []);

  const handleUpdateSet = useCallback(async (updates: { weight_kg: number; reps: number; note: string | null }) => {
    if (!selectedSet) return;

    await updateSet(selectedSet.id, {
      weight_kg: updates.weight_kg,
      reps: updates.reps,
      note: updates.note,
    });

    setEditModalVisible(false);
    setSelectedSet(null);
    await loadWorkout();
    onHistoryRefresh?.();
  }, [selectedSet, loadWorkout, onHistoryRefresh]);

  const handleDeleteSet = useCallback(async () => {
    if (!selectedSet) return;

    await deleteSet(selectedSet.id);
    setEditModalVisible(false);
    setSelectedSet(null);
    await loadWorkout();
    onHistoryRefresh?.();
  }, [selectedSet, loadWorkout, onHistoryRefresh]);

  if (!exerciseId) {
    return (
      <View className="flex-1 items-center justify-center p-4 bg-background">
        <Text className="text-base text-destructive">Invalid exercise ID</Text>
      </View>
    );
  }

  const renderSetItem = ({ item, index }: { item: SetRow; index: number }) => (
    <SetItem
      index={index + 1}
      weightKg={item.weightKg}
      reps={item.reps}
      note={item.note}
      onLongPress={() => handleLongPressSet(item)}
    />
  );

  const timerDisplayText = currentTimer
    ? formatTime(currentTimer.remainingSeconds)
    : formatTime((parseInt(timerMinutes, 10) || 1) * 60 + (parseInt(timerSeconds, 10) || 30));

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Date Selector - Pill style */}
        <View className="flex-row justify-center mb-4">
          <Pressable
            className="flex-row items-center px-4 py-2.5 rounded-full border border-border bg-surface"
            style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 }}
            onPress={() => setShowDatePicker(true)}
          >
            <MaterialCommunityIcons name="calendar" size={18} color={rawColors.primary} />
            <Text className="text-[15px] font-semibold mx-2 text-primary">{formatRelativeDate(selectedDate)}</Text>
            <MaterialCommunityIcons name="chevron-down" size={16} color={rawColors.foregroundSecondary} />
          </Pressable>
        </View>

        {/* Add Set Card */}
        <View
          className="rounded-2xl p-5 mb-4 bg-surface"
          style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-semibold text-foreground">Add Set</Text>
            <View className="flex-row items-center px-3 py-1.5 rounded-full bg-primary-light">
              <Text className="text-sm font-medium text-primary">Set #{setIndex}</Text>
            </View>
          </View>

          {/* Weight and Reps Inputs - Side by side */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-sm font-medium mb-2 text-foreground-secondary">Weight (kg)</Text>
              <TextInput
                className="border border-border rounded-xl p-3.5 text-base bg-surface-secondary text-foreground"
                value={weight}
                onChangeText={setWeight}
                placeholder="0"
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium mb-2 text-foreground-secondary">Reps</Text>
              <TextInput
                className="border border-border rounded-xl p-3.5 text-base bg-surface-secondary text-foreground"
                value={reps}
                onChangeText={setReps}
                placeholder="0"
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="number-pad"
              />
            </View>
          </View>

          {/* Note Input */}
          <View className="mb-4">
            <Text className="text-sm font-medium mb-2 text-foreground-secondary">Note (optional)</Text>
            <TextInput
              className="border border-border rounded-xl p-3.5 text-base min-h-[70px] bg-surface-secondary text-foreground"
              style={{ textAlignVertical: "top" }}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note..."
              placeholderTextColor={rawColors.foregroundMuted}
              multiline
            />
          </View>

          {/* Timer and Add Button Row */}
          <View className="flex-row gap-3">
            {/* Timer Button */}
            <Pressable
              className={`flex-row items-center justify-center px-4 py-3.5 rounded-xl border ${
                currentTimer?.isRunning 
                  ? "bg-primary border-primary" 
                  : "bg-surface-secondary border-border"
              }`}
              onPress={handleTimerPress}
              onLongPress={handleTimerLongPress}
              delayLongPress={400}
            >
              <MaterialCommunityIcons
                name={currentTimer?.isRunning ? "pause" : "timer-outline"}
                size={20}
                color={currentTimer?.isRunning ? rawColors.primaryForeground : rawColors.primary}
              />
              <Text
                className={`text-base font-semibold ml-2 ${
                  currentTimer?.isRunning ? "text-primary-foreground" : "text-primary"
                }`}
              >
                {timerDisplayText}
              </Text>
            </Pressable>

            {/* Add Set Button */}
            <Pressable 
              className="flex-1 flex-row items-center justify-center py-3.5 rounded-xl bg-primary"
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              onPress={handleAddSet}
            >
              <MaterialCommunityIcons name="plus" size={20} color={rawColors.primaryForeground} />
              <Text className="text-base font-semibold ml-1.5 text-primary-foreground">Add Set</Text>
            </Pressable>
          </View>
        </View>

        {/* Recorded Sets Card */}
        <View
          className="rounded-2xl p-5 bg-surface"
          style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-semibold text-foreground">Recorded Sets</Text>
            {sets.length > 0 && (
              <View className="flex-row items-center px-3 py-1.5 rounded-full bg-surface-secondary">
                <MaterialCommunityIcons name="dumbbell" size={14} color={rawColors.foregroundSecondary} />
                <Text className="text-sm font-medium ml-1.5 text-foreground-secondary">{sets.length} {sets.length === 1 ? "set" : "sets"}</Text>
              </View>
            )}
          </View>

          {sets.length === 0 ? (
            <View className="items-center py-8">
              <View className="w-16 h-16 rounded-full items-center justify-center mb-4 bg-surface-secondary">
                <MaterialCommunityIcons name="clipboard-outline" size={28} color={rawColors.foregroundMuted} />
              </View>
              <Text className="text-base font-medium text-foreground-secondary">No sets recorded yet</Text>
              <Text className="text-sm text-center mt-1 text-foreground-muted">Add your first set using the form above</Text>
            </View>
          ) : (
            <FlatList
              data={sets}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderSetItem}
              scrollEnabled={false}
              nestedScrollEnabled
            />
          )}
        </View>
      </ScrollView>

      {/* Complete Exercise Footer */}
      <View 
        className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-border bg-background"
        style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 8 }}
      >
        <Pressable 
          className={`flex-row items-center justify-center py-4 rounded-xl ${
            sets.length === 0 ? "bg-surface-secondary" : "bg-primary"
          }`}
          style={({ pressed }) => ({ opacity: pressed && sets.length > 0 ? 0.8 : 1 })}
          onPress={handleCompleteExercise}
          disabled={sets.length === 0}
        >
          <MaterialCommunityIcons 
            name="check-circle" 
            size={22} 
            color={sets.length === 0 ? rawColors.foregroundMuted : rawColors.primaryForeground} 
          />
          <Text 
            className={`text-base font-semibold ml-2 ${
              sets.length === 0 ? "text-foreground-muted" : "text-primary-foreground"
            }`}
          >
            Complete Exercise
          </Text>
        </Pressable>
      </View>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        value={selectedDate}
        onChange={handleDateChange}
      />

      {/* Edit Set Modal */}
      <EditSetModal
        visible={editModalVisible}
        onClose={() => {
          setEditModalVisible(false);
          setSelectedSet(null);
        }}
        set={selectedSet}
        onSave={handleUpdateSet}
        onDelete={handleDeleteSet}
        showDatePicker={false}
      />

      {/* Timer Modal */}
      <TimerModal
        visible={timerModalVisible}
        onClose={() => setTimerModalVisible(false)}
        exerciseId={exerciseId}
        exerciseName={exerciseName}
        currentTimer={currentTimer}
        minutes={timerMinutes}
        seconds={timerSeconds}
        onMinutesChange={setTimerMinutes}
        onSecondsChange={setTimerSeconds}
        onSaveRestTime={handleSaveRestTime}
      />
    </View>
  );
}
