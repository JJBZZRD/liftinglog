import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import SetItem from "../../../components/lists/SetItem";
import DatePickerModal from "../../../components/modals/DatePickerModal";
import EditSetModal from "../../../components/modals/EditSetModal";
import TimerModal from "../../../components/TimerModal";
import { getLastRestSeconds, setLastRestSeconds } from "../../../lib/db/exercises";
import {
  addSet,
  addWorkoutExercise,
  completeWorkout,
  deleteSet,
  getOrCreateActiveWorkout,
  listSetsForExercise,
  listWorkoutExercises,
  updateSet,
  updateWorkoutDate,
  updateWorkoutExerciseInputs,
  type SetRow,
} from "../../../lib/db/workouts";
import { detectAndRecordPRs } from "../../../lib/pr/detection";
import { colors } from "../../../lib/theme/colors";
import { useTheme } from "../../../lib/theme/ThemeContext";
import { formatRelativeDate, formatTime } from "../../../lib/utils/formatters";
import { timerStore, type Timer } from "../../../lib/timerStore";

export default function RecordTab() {
  const { themeColors } = useTheme();
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
    
    // Update workout date in background
    if (workoutId) {
      updateWorkoutDate(workoutId, date.getTime());
    }
  }, [workoutId]);

  const loadWorkout = useCallback(async () => {
    if (!exerciseId) return;

    const activeWorkoutId = await getOrCreateActiveWorkout();
    setWorkoutId(activeWorkoutId);

    const workoutExercisesList = await listWorkoutExercises(activeWorkoutId);
    const existingWorkoutExercise = workoutExercisesList.find(
      (we) => we.exerciseId === exerciseId
    );

    let weId: number;
    if (existingWorkoutExercise) {
      weId = existingWorkoutExercise.id;
      setWorkoutExerciseId(weId);
      
      if (existingWorkoutExercise.currentWeight !== null) {
        setWeightState(String(existingWorkoutExercise.currentWeight));
      }
      if (existingWorkoutExercise.currentReps !== null) {
        setRepsState(String(existingWorkoutExercise.currentReps));
      }
    } else {
      weId = await addWorkoutExercise({
        workout_id: activeWorkoutId,
        exercise_id: exerciseId,
      });
      setWorkoutExerciseId(weId);
    }

    const exerciseSets = await listSetsForExercise(activeWorkoutId, exerciseId);
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
  }, [workoutId, exerciseId, workoutExerciseId, weight, reps, note, setIndex, selectedDate, loadWorkout]);

  const handleCompleteWorkout = useCallback(async () => {
    if (!workoutId) return;
    
    if (currentTimer) {
      await timerStore.deleteTimer(currentTimer.id);
    }
    
    // Complete workout with the selected date
    await completeWorkout(workoutId, selectedDate.getTime());
    router.back();
  }, [workoutId, currentTimer, selectedDate]);

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
  }, [selectedSet, loadWorkout]);

  const handleDeleteSet = useCallback(async () => {
    if (!selectedSet) return;

    await deleteSet(selectedSet.id);
    setEditModalVisible(false);
    setSelectedSet(null);
    await loadWorkout();
  }, [selectedSet, loadWorkout]);

  if (!exerciseId) {
    return (
      <View style={styles.tabContainer}>
        <Text style={styles.errorText}>Invalid exercise ID</Text>
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

  return (
    <View style={[styles.recordContainer, { backgroundColor: themeColors.surface }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Date Picker */}
        <View style={styles.dateSection}>
          <Pressable
            style={[styles.dateButton, { backgroundColor: themeColors.primaryLight }]}
            onPress={() => setShowDatePicker(true)}
          >
            <MaterialCommunityIcons name="calendar" size={20} color={themeColors.primary} />
            <Text style={[styles.dateButtonText, { color: themeColors.primary }]}>{formatRelativeDate(selectedDate)}</Text>
            <MaterialCommunityIcons name="chevron-down" size={18} color={themeColors.textSecondary} />
          </Pressable>
        </View>

        {/* Input Section */}
        <View style={styles.inputSection}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Add Set</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Weight (kg)</Text>
              <TextInput
                style={[styles.input, { borderColor: themeColors.border, backgroundColor: themeColors.surface, color: themeColors.text }]}
                value={weight}
                onChangeText={setWeight}
                placeholder="0"
                placeholderTextColor={themeColors.textPlaceholder}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Reps</Text>
              <TextInput
                style={[styles.input, { borderColor: themeColors.border, backgroundColor: themeColors.surface, color: themeColors.text }]}
                value={reps}
                onChangeText={setReps}
                placeholder="0"
                placeholderTextColor={themeColors.textPlaceholder}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <View style={styles.noteInputGroup}>
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.noteInput, { borderColor: themeColors.border, backgroundColor: themeColors.surface, color: themeColors.text }]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note..."
              placeholderTextColor={themeColors.textPlaceholder}
              multiline
            />
          </View>
          <Pressable style={[styles.addButton, { backgroundColor: themeColors.primary }]} onPress={handleAddSet}>
            <Text style={[styles.addButtonText, { color: themeColors.surface }]}>Add Set</Text>
          </Pressable>
        </View>

        {/* Sets List */}
        <View style={styles.setsSection}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Recorded Sets</Text>
          {sets.length === 0 ? (
            <Text style={[styles.emptyText, { color: themeColors.textTertiary }]}>No sets recorded yet. Add your first set above.</Text>
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

      {/* Action Buttons */}
      <View style={[styles.actionButtons, { backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
        <Pressable
          style={[
            styles.actionButton,
            styles.timerButton,
            { backgroundColor: themeColors.surfaceSecondary },
            currentTimer?.isRunning && { backgroundColor: themeColors.primary },
          ]}
          onPress={handleTimerPress}
          onLongPress={handleTimerLongPress}
          delayLongPress={400}
        >
          <MaterialCommunityIcons
            name={currentTimer?.isRunning ? "pause" : "timer"}
            size={20}
            color={currentTimer?.isRunning ? themeColors.surface : themeColors.primary}
          />
          <Text
            style={[
              styles.actionButtonText,
              { color: themeColors.primary },
              currentTimer?.isRunning && { color: themeColors.surface },
            ]}
          >
            {currentTimer
              ? formatTime(currentTimer.remainingSeconds)
              : formatTime((parseInt(timerMinutes, 10) || 1) * 60 + (parseInt(timerSeconds, 10) || 30))}
          </Text>
        </Pressable>
        <Pressable 
          style={[styles.actionButton, { backgroundColor: themeColors.primary }, sets.length === 0 && { backgroundColor: themeColors.surfaceSecondary }]} 
          onPress={handleCompleteWorkout}
          disabled={sets.length === 0}
        >
          <MaterialCommunityIcons name="check-circle" size={20} color={sets.length === 0 ? themeColors.textTertiary : themeColors.surface} />
          <Text style={[styles.actionButtonText, { color: themeColors.surface }, sets.length === 0 && { color: themeColors.textTertiary }]}>
            Complete Workout
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

const styles = StyleSheet.create({
  tabContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  errorText: {
    fontSize: 16,
    color: colors.error,
  },
  recordContainer: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  dateSection: {
    marginBottom: 20,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: "flex-start",
    gap: 8,
  },
  dateButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
  },
  inputSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    color: colors.text,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  noteInputGroup: {
    marginBottom: 0,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  addButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "600",
  },
  setsSection: {
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: "center",
    paddingVertical: 24,
  },
  actionButtons: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 8,
    gap: 8,
  },
  timerButton: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  timerButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timerButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  timerButtonTextActive: {
    color: colors.surface,
  },
  completeButton: {
    backgroundColor: colors.primary,
  },
  completeButtonDisabled: {
    backgroundColor: colors.border,
  },
  completeButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "600",
  },
  completeButtonTextDisabled: {
    color: colors.textTertiary,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
