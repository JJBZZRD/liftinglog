import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import TimerModal from "../../../components/TimerModal";
import {
    addSet,
    addWorkoutExercise,
    completeWorkout,
    deleteSet,
    getOrCreateActiveWorkout,
    listSetsForExercise,
    listWorkoutExercises,
    updateSet,
    type SetRow,
} from "../../../lib/db/workouts";
import { timerStore, type Timer } from "../../../lib/timerStore";

export default function RecordTab() {
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const exerciseId = typeof params.id === "string" ? parseInt(params.id, 10) : null;
  const exerciseName = typeof params.name === "string" ? params.name : "Exercise";

  const [workoutId, setWorkoutId] = useState<number | null>(null);
  const [workoutExerciseId, setWorkoutExerciseId] = useState<number | null>(null);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [note, setNote] = useState("");
  const [setIndex, setSetIndex] = useState(1);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedSet, setSelectedSet] = useState<SetRow | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editReps, setEditReps] = useState("");
  const [editNote, setEditNote] = useState("");

  // Timer state with real-time updates
  const [timerModalVisible, setTimerModalVisible] = useState(false);
  const [currentTimer, setCurrentTimer] = useState<Timer | null>(null);
  const [timerMinutes, setTimerMinutes] = useState("1");
  const [timerSeconds, setTimerSeconds] = useState("30");

  const loadWorkout = useCallback(async () => {
    if (!exerciseId) return;

    const activeWorkoutId = await getOrCreateActiveWorkout();
    setWorkoutId(activeWorkoutId);

    const workoutExercisesList = await listWorkoutExercises(activeWorkoutId);
    const existingWorkoutExercise = workoutExercisesList.find(
      (we) => we.exerciseId === exerciseId
    );

    if (existingWorkoutExercise) {
      setWorkoutExerciseId(existingWorkoutExercise.id);
    } else {
      const newWorkoutExerciseId = await addWorkoutExercise({
        workout_id: activeWorkoutId,
        exercise_id: exerciseId,
      });
      setWorkoutExerciseId(newWorkoutExerciseId);
    }

    const exerciseSets = await listSetsForExercise(activeWorkoutId, exerciseId);
    setSets(exerciseSets);
    setSetIndex(exerciseSets.length > 0 ? exerciseSets.length + 1 : 1);
  }, [exerciseId]);

  useEffect(() => {
    loadWorkout();
  }, [loadWorkout]);

  // Subscribe to timer updates for real-time countdown display
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

    await addSet({
      workout_id: workoutId,
      exercise_id: exerciseId,
      workout_exercise_id: workoutExerciseId,
      weight_kg: weightValue,
      reps: repsValue,
      note: noteValue,
      set_index: setIndex,
    });

    setNote("");
    await loadWorkout();
  }, [workoutId, exerciseId, workoutExerciseId, weight, reps, note, setIndex, loadWorkout]);

  const handleCompleteWorkout = useCallback(async () => {
    if (!workoutId) return;
    await completeWorkout(workoutId);
    router.back();
  }, [workoutId]);

  // Timer button handlers
  const handleTimerPress = useCallback(async () => {
    if (!exerciseId) return;

    if (currentTimer) {
      // Toggle start/stop
      if (currentTimer.isRunning) {
        await timerStore.stopTimer(currentTimer.id);
      } else {
        await timerStore.startTimer(currentTimer.id);
      }
    } else {
      // No timer exists - create one with default 90 seconds and start it
      const mins = parseInt(timerMinutes, 10) || 1;
      const secs = parseInt(timerSeconds, 10) || 30;
      const totalSeconds = mins * 60 + secs;

      const id = timerStore.createTimer(exerciseId, exerciseName, totalSeconds);
      await timerStore.startTimer(id);
    }
  }, [exerciseId, exerciseName, currentTimer, timerMinutes, timerSeconds]);

  const handleTimerLongPress = useCallback(() => {
    // Pre-fill with current timer duration if exists
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
    setEditWeight(set.weightKg !== null ? String(set.weightKg) : "");
    setEditReps(set.reps !== null ? String(set.reps) : "");
    setEditNote(set.note || "");
    setEditModalVisible(true);
  }, []);

  const handleUpdateSet = useCallback(async () => {
    if (!selectedSet) return;

    const weightValue = editWeight.trim() ? parseFloat(editWeight) : null;
    const repsValue = editReps.trim() ? parseInt(editReps, 10) : null;
    const noteValue = editNote.trim() || null;

    if (!weightValue || weightValue === 0 || !repsValue || repsValue === 0) {
      return;
    }

    await updateSet(selectedSet.id, {
      weight_kg: weightValue,
      reps: repsValue,
      note: noteValue,
    });

    setEditModalVisible(false);
    setSelectedSet(null);
    await loadWorkout();
  }, [selectedSet, editWeight, editReps, editNote, loadWorkout]);

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

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const renderSetItem = ({ item, index }: { item: SetRow; index: number }) => (
    <Pressable onLongPress={() => handleLongPressSet(item)} delayLongPress={400}>
      <View style={styles.setItem}>
        <View style={styles.setNumber}>
          <Text style={styles.setNumberText}>{index + 1}</Text>
        </View>
        <View style={styles.setDetails}>
          <View style={styles.setInfoRow}>
            <Text style={styles.setInfo}>
              {item.weightKg !== null ? `${item.weightKg} kg` : "—"}
            </Text>
            <Text style={styles.setInfo}>
              {item.reps !== null ? `${item.reps} reps` : "—"}
            </Text>
          </View>
          {item.note && <Text style={styles.setNote}>{item.note}</Text>}
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.recordContainer}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Input Section */}
        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>Add Set</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Weight (kg)</Text>
              <TextInput
                style={styles.input}
                value={weight}
                onChangeText={setWeight}
                placeholder="0"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Reps</Text>
              <TextInput
                style={styles.input}
                value={reps}
                onChangeText={setReps}
                placeholder="0"
                keyboardType="number-pad"
              />
            </View>
          </View>
          <View style={styles.noteInputGroup}>
            <Text style={styles.inputLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note..."
              multiline
            />
          </View>
          <Pressable style={styles.addButton} onPress={handleAddSet}>
            <Text style={styles.addButtonText}>Add Set</Text>
          </Pressable>
        </View>

        {/* Sets List */}
        <View style={styles.setsSection}>
          <Text style={styles.sectionTitle}>Recorded Sets</Text>
          {sets.length === 0 ? (
            <Text style={styles.emptyText}>No sets recorded yet. Add your first set above.</Text>
          ) : (
            <FlatList
              data={sets}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderSetItem}
              scrollEnabled={false}
              bounces
              alwaysBounceVertical
              overScrollMode="always"
              decelerationRate="fast"
              scrollEventThrottle={16}
              nestedScrollEnabled
            />
          )}
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <Pressable
          style={[
            styles.actionButton,
            styles.timerButton,
            currentTimer?.isRunning && styles.timerButtonActive,
          ]}
          onPress={handleTimerPress}
          onLongPress={handleTimerLongPress}
          delayLongPress={400}
        >
          <MaterialCommunityIcons
            name={currentTimer?.isRunning ? "pause" : "timer"}
            size={20}
            color={currentTimer?.isRunning ? "#fff" : "#007AFF"}
          />
          <Text
            style={[
              styles.actionButtonText,
              styles.timerButtonText,
              currentTimer?.isRunning && styles.timerButtonTextActive,
            ]}
          >
            {currentTimer
              ? formatTime(currentTimer.remainingSeconds)
              : "Rest Timer"}
          </Text>
        </Pressable>
        <Pressable style={[styles.actionButton, styles.completeButton]} onPress={handleCompleteWorkout}>
          <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
          <Text style={[styles.actionButtonText, styles.completeButtonText]}>Complete Workout</Text>
        </Pressable>
      </View>

      {/* Edit Set Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => {
          setEditModalVisible(false);
          setSelectedSet(null);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setEditModalVisible(false);
            setSelectedSet(null);
          }}
        >
          <ScrollView
            style={styles.modalContent}
            contentContainerStyle={styles.modalContentContainer}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalTitle}>Edit Set</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Weight (kg)</Text>
                <TextInput
                  style={styles.input}
                  value={editWeight}
                  onChangeText={setEditWeight}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Reps</Text>
                <TextInput
                  style={styles.input}
                  value={editReps}
                  onChangeText={setEditReps}
                  placeholder="0"
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <View style={styles.noteInputGroup}>
              <Text style={styles.inputLabel}>Note (optional)</Text>
              <TextInput
                style={[styles.input, styles.noteInput]}
                value={editNote}
                onChangeText={setEditNote}
                placeholder="Add a note..."
                multiline
              />
            </View>
            <View style={styles.modalButtonsContainer}>
              <Pressable style={[styles.modalButton, styles.deleteButton]} onPress={handleDeleteSet}>
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setEditModalVisible(false);
                  setSelectedSet(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, styles.saveButton]} onPress={handleUpdateSet}>
                <Text style={styles.saveButtonText}>Save</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Modal>

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
    color: "#ff3b30",
  },
  recordContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  inputSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    color: "#000",
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  inputGroup: {
    flex: 1,
    marginBottom: 0,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e5ea",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  noteInputGroup: {
    marginBottom: 0,
  },
  addButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  setsSection: {
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    paddingVertical: 24,
  },
  setItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    marginBottom: 8,
  },
  setNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  setNumberText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  setDetails: {
    flex: 1,
  },
  setInfoRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  setInfo: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  setNote: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
  },
  actionButtons: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e5ea",
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
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  timerButtonActive: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  timerButtonText: {
    color: "#007AFF",
    fontSize: 16,
    fontWeight: "600",
  },
  timerButtonTextActive: {
    color: "#fff",
  },
  completeButton: {
    backgroundColor: "#007AFF",
  },
  completeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "100%",
    maxWidth: 400,
    maxHeight: "45%",
  },
  modalContentContainer: {
    padding: 24,
    flexDirection: "column",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 20,
    color: "#000",
  },
  modalButtonsContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    width: "100%",
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButton: {
    backgroundColor: "#ff3b30",
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#e5e5ea",
  },
  cancelButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: "#007AFF",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
