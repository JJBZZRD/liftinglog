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

export default function RecordTab() {
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
        <Text style={[styles.errorText, { color: rawColors.destructive }]}>Invalid exercise ID</Text>
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
    <View style={[styles.recordContainer, { backgroundColor: rawColors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Date Picker */}
        <View style={styles.dateSection}>
          <Pressable
            style={[styles.dateButton, { backgroundColor: rawColors.primaryLight }]}
            onPress={() => setShowDatePicker(true)}
          >
            <MaterialCommunityIcons name="calendar" size={20} color={rawColors.primary} />
            <Text style={[styles.dateButtonText, { color: rawColors.primary }]}>{formatRelativeDate(selectedDate)}</Text>
            <MaterialCommunityIcons name="chevron-down" size={18} color={rawColors.foregroundSecondary} />
          </Pressable>
        </View>

        {/* Input Section */}
        <View style={styles.inputSection}>
          <Text style={[styles.sectionTitle, { color: rawColors.foreground }]}>Add Set</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: rawColors.foregroundSecondary }]}>Weight (kg)</Text>
              <TextInput
                style={[styles.input, { borderColor: rawColors.border, backgroundColor: rawColors.surface, color: rawColors.foreground }]}
                value={weight}
                onChangeText={setWeight}
                placeholder="0"
                placeholderTextColor={rawColors.foregroundPlaceholder}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: rawColors.foregroundSecondary }]}>Reps</Text>
              <TextInput
                style={[styles.input, { borderColor: rawColors.border, backgroundColor: rawColors.surface, color: rawColors.foreground }]}
                value={reps}
                onChangeText={setReps}
                placeholder="0"
                placeholderTextColor={rawColors.foregroundPlaceholder}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <View style={styles.noteInputGroup}>
            <Text style={[styles.inputLabel, { color: rawColors.foregroundSecondary }]}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.noteInput, { borderColor: rawColors.border, backgroundColor: rawColors.surface, color: rawColors.foreground }]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note..."
              placeholderTextColor={rawColors.foregroundPlaceholder}
              multiline
            />
          </View>
          <Pressable style={[styles.addButton, { backgroundColor: rawColors.primary }]} onPress={handleAddSet}>
            <Text style={[styles.addButtonText, { color: rawColors.surface }]}>Add Set</Text>
          </Pressable>
        </View>

        {/* Sets List */}
        <View style={styles.setsSection}>
          <Text style={[styles.sectionTitle, { color: rawColors.foreground }]}>Recorded Sets</Text>
          {sets.length === 0 ? (
            <Text style={[styles.emptyText, { color: rawColors.foregroundMuted }]}>No sets recorded yet. Add your first set above.</Text>
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
      <View style={[styles.actionButtons, { backgroundColor: rawColors.background, borderTopColor: rawColors.border }]}>
        <Pressable
          style={[
            styles.actionButton,
            styles.timerButton,
            { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.primary },
            currentTimer?.isRunning && { backgroundColor: rawColors.primary },
          ]}
          onPress={handleTimerPress}
          onLongPress={handleTimerLongPress}
          delayLongPress={400}
        >
          <MaterialCommunityIcons
            name={currentTimer?.isRunning ? "pause" : "timer"}
            size={20}
            color={currentTimer?.isRunning ? rawColors.surface : rawColors.primary}
          />
          <Text
            style={[
              styles.actionButtonText,
              { color: rawColors.primary },
              currentTimer?.isRunning && { color: rawColors.surface },
            ]}
          >
            {currentTimer
              ? formatTime(currentTimer.remainingSeconds)
              : formatTime((parseInt(timerMinutes, 10) || 1) * 60 + (parseInt(timerSeconds, 10) || 30))}
          </Text>
        </Pressable>
        <Pressable 
          style={[styles.actionButton, { backgroundColor: rawColors.primary }, sets.length === 0 && { backgroundColor: rawColors.surfaceSecondary }]} 
          onPress={handleCompleteExercise}
          disabled={sets.length === 0}
        >
          <MaterialCommunityIcons name="check-circle" size={20} color={sets.length === 0 ? rawColors.foregroundMuted : rawColors.surface} />
          <Text style={[styles.actionButtonText, { color: rawColors.surface }, sets.length === 0 && { color: rawColors.foregroundMuted }]}>
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

const styles = StyleSheet.create({
  tabContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  errorText: {
    fontSize: 16,
  },
  recordContainer: {
    flex: 1,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: "flex-start",
    gap: 8,
  },
  dateButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  inputSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
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
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  noteInputGroup: {
    marginBottom: 0,
  },
  addButton: {
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  setsSection: {
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
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
    borderTopWidth: 1,
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
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
