import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import SetItem from "../components/lists/SetItem";
import DatePickerModal from "../components/modals/DatePickerModal";
import EditSetModal from "../components/modals/EditSetModal";
import {
  addSet,
  addWorkoutExercise,
  deleteSet,
  listSetsForExercise,
  listWorkoutExercises,
  updateExerciseEntryDate,
  updateSet,
  type SetRow,
  type WorkoutExercise,
} from "../lib/db/workouts";
import { useTheme } from "../lib/theme/ThemeContext";
import { formatRelativeDate } from "../lib/utils/formatters";

export default function EditWorkoutScreen() {
  const { themeColors } = useTheme();
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

  // Date picker state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Handler for date change - updates state immediately, syncs to DB
  const handleDateChange = useCallback((date: Date) => {
    setSelectedDate(date);
    setShowDatePicker(false);
    
    // Update exercise entry date and sets in background
    if (workoutExerciseId) {
      updateExerciseEntryDate(workoutExerciseId, date.getTime());
      sets.forEach((set) => {
        updateSet(set.id, { performed_at: date.getTime() });
      });
    }
  }, [workoutExerciseId, sets]);

  const loadWorkout = useCallback(async () => {
    if (!exerciseId || !workoutId) return;

    const workoutExercisesList = await listWorkoutExercises(workoutId);
    const existingWorkoutExercise = workoutExercisesList.find((we) => we.exerciseId === exerciseId);
    let currentWorkoutExercise: WorkoutExercise | null = null;
    
    if (existingWorkoutExercise) {
      setWorkoutExerciseId(existingWorkoutExercise.id);
      currentWorkoutExercise = existingWorkoutExercise;
    } else {
      const newWorkoutExerciseId = await addWorkoutExercise({
        workout_id: workoutId,
        exercise_id: exerciseId,
      });
      setWorkoutExerciseId(newWorkoutExerciseId);
    }

    const exerciseSets = await listSetsForExercise(workoutId, exerciseId);
    setSets(exerciseSets);
    setSetIndex(exerciseSets.length > 0 ? exerciseSets.length + 1 : 1);
    
    // Load date from workout_exercise.performed_at, fallback to first set's date
    if (currentWorkoutExercise?.performedAt) {
      setSelectedDate(new Date(currentWorkoutExercise.performedAt));
    } else if (exerciseSets.length > 0 && exerciseSets[0].performedAt) {
      setSelectedDate(new Date(exerciseSets[0].performedAt));
    }
  }, [exerciseId, workoutId]);

  useEffect(() => {
    loadWorkout();
  }, [loadWorkout]);

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
      performed_at: selectedDate.getTime(),
    });

    setNote("");
    await loadWorkout();
  }, [workoutId, exerciseId, workoutExerciseId, weight, reps, note, setIndex, selectedDate, loadWorkout]);

  const handleSaveEdits = useCallback(() => {
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
    setEditModalVisible(true);
  }, []);

  const handleUpdateSet = useCallback(async (updates: { weight_kg: number; reps: number; note: string | null; performed_at?: number }) => {
    if (!selectedSet) return;

    await updateSet(selectedSet.id, {
      weight_kg: updates.weight_kg,
      reps: updates.reps,
      note: updates.note,
      performed_at: updates.performed_at,
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

  if (!exerciseId || !workoutId) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.surface }]}>
        <Text style={[styles.errorText, { color: themeColors.error }]}>Invalid exercise or workout ID</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.surface }]}>
      <Stack.Screen
        options={{
          presentation: "modal",
          title: `Edit ${exerciseName}`,
          headerStyle: { backgroundColor: themeColors.surface },
          headerTitleStyle: { color: themeColors.text },
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={styles.headerButton}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={themeColors.text} />
            </Pressable>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
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
                placeholder="0.0"
                placeholderTextColor={themeColors.textPlaceholder}
                keyboardType="decimal-pad"
                returnKeyType="next"
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
                returnKeyType="next"
              />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.noteInput, { borderColor: themeColors.border, backgroundColor: themeColors.surface, color: themeColors.text }]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note..."
              placeholderTextColor={themeColors.textPlaceholder}
              multiline
              returnKeyType="done"
            />
          </View>
          <Pressable style={[styles.addButton, { backgroundColor: themeColors.primary }]} onPress={handleAddSet}>
            <Text style={[styles.addButtonText, { color: themeColors.surface }]}>Add Set</Text>
          </Pressable>
        </View>

        {/* Sets List */}
        <View style={styles.setsSection}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Recorded Sets ({sets.length})</Text>
          {sets.length === 0 ? (
            <Text style={[styles.emptyText, { color: themeColors.textTertiary }]}>No sets recorded yet</Text>
          ) : (
            <FlatList
              data={sets}
              keyExtractor={(item) => String(item.id)}
              scrollEnabled={false}
              renderItem={({ item, index }) => (
                <SetItem
                  index={index + 1}
                  weightKg={item.weightKg}
                  reps={item.reps}
                  note={item.note}
                  onLongPress={() => handleLongPressSet(item)}
                />
              )}
            />
          )}
        </View>
      </ScrollView>

      {/* Action Button */}
      <View style={[styles.actionButtons, { backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
        <Pressable style={[styles.saveButton, { backgroundColor: themeColors.primary }]} onPress={handleSaveEdits}>
          <MaterialCommunityIcons name="check-circle" size={20} color={themeColors.surface} />
          <Text style={[styles.saveButtonText, { color: themeColors.surface }]}>Save Edits</Text>
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
        showDatePicker={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 50,
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
    marginBottom: 16,
  },
  addButton: {
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
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
    padding: 16,
    borderTopWidth: 1,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 8,
    gap: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
