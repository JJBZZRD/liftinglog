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
  getWorkoutExerciseById,
  listSetsForExercise,
  listSetsForWorkoutExercise,
  listWorkoutExercises,
  updateExerciseEntryDate,
  updateSet,
  type SetRow,
  type WorkoutExercise,
} from "../lib/db/workouts";
import { useTheme } from "../lib/theme/ThemeContext";
import { formatRelativeDate } from "../lib/utils/formatters";

export default function EditWorkoutScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ 
    exerciseId?: string; 
    workoutId?: string; 
    exerciseName?: string;
    workoutExerciseId?: string;
  }>();
  
  // Parse params - workoutExerciseId is the direct route, exerciseId+workoutId is the legacy route
  const workoutExerciseIdParam = typeof params.workoutExerciseId === "string" 
    ? parseInt(params.workoutExerciseId, 10) 
    : null;
  const exerciseIdParam = typeof params.exerciseId === "string" ? parseInt(params.exerciseId, 10) : null;
  const workoutIdParam = typeof params.workoutId === "string" ? parseInt(params.workoutId, 10) : null;
  const exerciseNameParam = typeof params.exerciseName === "string" ? params.exerciseName : "Exercise";

  // State for resolved IDs (may be derived from workoutExerciseId lookup)
  const [workoutExerciseId, setWorkoutExerciseId] = useState<number | null>(workoutExerciseIdParam);
  const [exerciseId, setExerciseId] = useState<number | null>(exerciseIdParam);
  const [workoutId, setWorkoutId] = useState<number | null>(workoutIdParam);
  const [exerciseName, setExerciseName] = useState(exerciseNameParam);
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
    let resolvedWorkoutExerciseId = workoutExerciseIdParam;
    let resolvedExerciseId = exerciseIdParam;
    let resolvedWorkoutId = workoutIdParam;
    let currentWorkoutExercise: WorkoutExercise | null = null;

    // Route A: Direct workoutExerciseId provided (from workout day detail page)
    if (workoutExerciseIdParam) {
      const we = await getWorkoutExerciseById(workoutExerciseIdParam);
      if (!we) {
        console.error("Workout exercise not found:", workoutExerciseIdParam);
        return;
      }
      currentWorkoutExercise = we;
      resolvedWorkoutExerciseId = we.id;
      resolvedExerciseId = we.exerciseId;
      resolvedWorkoutId = we.workoutId;
      
      // Update state with resolved IDs
      setWorkoutExerciseId(we.id);
      setExerciseId(we.exerciseId);
      setWorkoutId(we.workoutId);
      
      // Load sets for this specific workout_exercise
      const exerciseSets = await listSetsForWorkoutExercise(we.id);
      setSets(exerciseSets);
      setSetIndex(exerciseSets.length > 0 ? exerciseSets.length + 1 : 1);
      
      // Load date from workout_exercise.performed_at
      if (we.performedAt) {
        setSelectedDate(new Date(we.performedAt));
      } else if (exerciseSets.length > 0 && exerciseSets[0].performedAt) {
        setSelectedDate(new Date(exerciseSets[0].performedAt));
      }
      return;
    }

    // Route B: Legacy route with exerciseId + workoutId
    if (!resolvedExerciseId || !resolvedWorkoutId) return;

    const workoutExercisesList = await listWorkoutExercises(resolvedWorkoutId);
    const existingWorkoutExercise = workoutExercisesList.find((we) => we.exerciseId === resolvedExerciseId);
    
    if (existingWorkoutExercise) {
      setWorkoutExerciseId(existingWorkoutExercise.id);
      currentWorkoutExercise = existingWorkoutExercise;
    } else {
      const newWorkoutExerciseId = await addWorkoutExercise({
        workout_id: resolvedWorkoutId,
        exercise_id: resolvedExerciseId,
      });
      setWorkoutExerciseId(newWorkoutExerciseId);
    }

    const exerciseSets = await listSetsForExercise(resolvedWorkoutId, resolvedExerciseId);
    setSets(exerciseSets);
    setSetIndex(exerciseSets.length > 0 ? exerciseSets.length + 1 : 1);
    
    // Load date from workout_exercise.performed_at, fallback to first set's date
    if (currentWorkoutExercise?.performedAt) {
      setSelectedDate(new Date(currentWorkoutExercise.performedAt));
    } else if (exerciseSets.length > 0 && exerciseSets[0].performedAt) {
      setSelectedDate(new Date(exerciseSets[0].performedAt));
    }
  }, [workoutExerciseIdParam, exerciseIdParam, workoutIdParam]);

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
    // If we came from workout day detail page (direct workoutExerciseId), just go back
    if (workoutExerciseIdParam) {
      router.back();
      return;
    }
    
    // Legacy route: navigate back to exercise page with refresh trigger
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
  }, [workoutExerciseIdParam, exerciseId, exerciseName]);

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

  // Show error only if we don't have valid params (neither direct workoutExerciseId nor legacy exerciseId+workoutId)
  const hasValidParams = workoutExerciseIdParam || (exerciseIdParam && workoutIdParam);
  if (!hasValidParams) {
    return (
      <View style={[styles.container, { backgroundColor: rawColors.background }]}>
        <Stack.Screen
          options={{
            presentation: "modal",
            title: `Edit ${exerciseName}`,
            headerStyle: { backgroundColor: rawColors.background },
            headerTitleStyle: { color: rawColors.foreground },
            headerLeft: () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => router.back()}
                style={styles.headerButton}
              >
                <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
              </Pressable>
            ),
          }}
        />
        <Text style={[styles.errorText, { color: rawColors.destructive }]}>Invalid exercise or workout ID</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: rawColors.background }]}>
      <Stack.Screen
        options={{
          presentation: "modal",
          title: `Edit ${exerciseName}`,
          headerStyle: { backgroundColor: rawColors.background },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={styles.headerButton}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
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
                placeholder="0.0"
                placeholderTextColor={rawColors.foregroundPlaceholder}
                keyboardType="decimal-pad"
                returnKeyType="next"
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
                returnKeyType="next"
              />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: rawColors.foregroundSecondary }]}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.noteInput, { borderColor: rawColors.border, backgroundColor: rawColors.surface, color: rawColors.foreground }]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note..."
              placeholderTextColor={rawColors.foregroundPlaceholder}
              multiline
              returnKeyType="done"
            />
          </View>
          <Pressable style={[styles.addButton, { backgroundColor: rawColors.primary }]} onPress={handleAddSet}>
            <Text style={[styles.addButtonText, { color: rawColors.surface }]}>Add Set</Text>
          </Pressable>
        </View>

        {/* Sets List */}
        <View style={styles.setsSection}>
          <Text style={[styles.sectionTitle, { color: rawColors.foreground }]}>Recorded Sets ({sets.length})</Text>
          {sets.length === 0 ? (
            <Text style={[styles.emptyText, { color: rawColors.foregroundMuted }]}>No sets recorded yet</Text>
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
      <View style={[styles.actionButtons, { backgroundColor: rawColors.background, borderTopColor: rawColors.border }]}>
        <Pressable style={[styles.saveButton, { backgroundColor: rawColors.primary }]} onPress={handleSaveEdits}>
          <MaterialCommunityIcons name="check-circle" size={20} color={rawColors.surface} />
          <Text style={[styles.saveButtonText, { color: rawColors.surface }]}>Save Edits</Text>
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
