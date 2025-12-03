import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  addSet,
  addWorkoutExercise,
  deleteSet,
  listSetsForExercise,
  listWorkoutExercises,
  updateSet,
  type SetRow,
} from "../lib/db/workouts";

export default function EditWorkoutScreen() {
  const params = useLocalSearchParams<{ exerciseId?: string; workoutId?: string; exerciseName?: string }>();
  const exerciseId = typeof params.exerciseId === "string" ? parseInt(params.exerciseId, 10) : null;
  const workoutId = typeof params.workoutId === "string" ? parseInt(params.workoutId, 10) : null;
  const exerciseName = typeof params.exerciseName === "string" ? params.exerciseName : "Exercise";

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

  const loadWorkout = useCallback(async () => {
    if (!exerciseId || !workoutId) return;

    // Check if workout exercise exists
    const workoutExercises = await listWorkoutExercises(workoutId);
    const existingWorkoutExercise = workoutExercises.find((we) => we.exerciseId === exerciseId);
    if (existingWorkoutExercise) {
      setWorkoutExerciseId(existingWorkoutExercise.id);
    } else {
      // Create workout exercise
      const newWorkoutExerciseId = await addWorkoutExercise({
        workout_id: workoutId,
        exercise_id: exerciseId,
      });
      setWorkoutExerciseId(newWorkoutExerciseId);
    }

    // Load sets
    const exerciseSets = await listSetsForExercise(workoutId, exerciseId);
    setSets(exerciseSets);
    setSetIndex(exerciseSets.length > 0 ? exerciseSets.length + 1 : 1);
  }, [exerciseId, workoutId]);

  useEffect(() => {
    loadWorkout();
  }, [loadWorkout]);

  const handleAddSet = useCallback(async () => {
    if (!workoutId || !exerciseId || !workoutExerciseId) return;

    const weightValue = weight.trim() ? parseFloat(weight) : null;
    const repsValue = reps.trim() ? parseInt(reps, 10) : null;
    const noteValue = note.trim() || null;

    // Validate: weight and reps cannot be zero or null
    if (!weightValue || weightValue === 0 || !repsValue || repsValue === 0) {
      return; // Don't add set if weight or reps is zero or missing
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

    // Only clear note field, keep weight and reps for quick entry
    setNote("");
    await loadWorkout();
  }, [workoutId, exerciseId, workoutExerciseId, weight, reps, note, setIndex, loadWorkout]);

  const handleSaveEdits = useCallback(() => {
    // Sets are already saved when added/updated
    // Navigate back to exercise page with refresh param to trigger history reload and switch to history tab
    if (exerciseId) {
      router.replace({
        pathname: "/exercise/[id]",
        params: {
          id: String(exerciseId),
          name: exerciseName,
          refreshHistory: Date.now().toString(),
        },
      });
    } else {
      router.back();
    }
  }, [exerciseId, exerciseName]);

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

    // Validate: weight and reps cannot be zero or null
    if (!weightValue || weightValue === 0 || !repsValue || repsValue === 0) {
      return; // Don't update set if weight or reps is zero or missing
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

  if (!exerciseId || !workoutId) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Invalid exercise or workout ID</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          presentation: "modal",
          title: `Edit ${exerciseName}`,
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} />
            </Pressable>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
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
                placeholder="0.0"
                keyboardType="decimal-pad"
                returnKeyType="next"
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
                returnKeyType="next"
              />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note..."
              multiline
              returnKeyType="done"
            />
          </View>
          <Pressable style={styles.addButton} onPress={handleAddSet}>
            <Text style={styles.addButtonText}>Add Set</Text>
          </Pressable>
        </View>

        {/* Sets List */}
        <View style={styles.setsSection}>
          <Text style={styles.sectionTitle}>Recorded Sets ({sets.length})</Text>
          {sets.length === 0 ? (
            <Text style={styles.emptyText}>No sets recorded yet</Text>
          ) : (
            <FlatList
              data={sets}
              keyExtractor={(item) => String(item.id)}
              scrollEnabled={false}
              renderItem={({ item, index: setListIndex }) => (
                <Pressable
                  onLongPress={() => handleLongPressSet(item)}
                  style={styles.setItem}
                >
                  <View style={styles.setNumber}>
                    <Text style={styles.setNumberText}>{setListIndex + 1}</Text>
                  </View>
                  <View style={styles.setDetails}>
                    <View style={styles.setInfoRow}>
                      {item.weightKg !== null && (
                        <Text style={styles.setInfo}>{item.weightKg} kg</Text>
                      )}
                      {item.reps !== null && (
                        <Text style={styles.setInfo}>{item.reps} reps</Text>
                      )}
                    </View>
                    {item.note && (
                      <Text style={styles.setNote}>{item.note}</Text>
                    )}
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>
      </ScrollView>

      {/* Action Button */}
      <View style={styles.actionButtons}>
        <Pressable style={[styles.actionButton, styles.saveButton]} onPress={handleSaveEdits}>
          <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
          <Text style={[styles.actionButtonText, styles.saveButtonText]}>Save Edits</Text>
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
                  placeholder="0.0"
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
            <View style={[styles.inputGroup, styles.noteInputGroup]}>
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
              <Pressable
                style={[styles.modalButton, styles.deleteButton]}
                onPress={handleDeleteSet}
              >
                <MaterialCommunityIcons name="delete" size={20} color="#fff" />
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
              <Pressable
                style={[styles.modalButton, styles.saveButtonModal]}
                onPress={handleUpdateSet}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  errorText: {
    fontSize: 16,
    color: "#ff3b30",
    textAlign: "center",
    marginTop: 50,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100, // Space for action buttons
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
  saveButton: {
    backgroundColor: "#007AFF",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "100%",
    maxWidth: 400,
    maxHeight: "45%",
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  modalContentContainer: {
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 24,
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
    marginBottom: 0,
    width: "100%",
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
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
  saveButtonModal: {
    backgroundColor: "#007AFF",
  },
});

