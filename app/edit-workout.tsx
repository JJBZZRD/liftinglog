import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import SetItem from "../components/lists/SetItem";
import BaseModal from "../components/modals/BaseModal";
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
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ set: SetRow; displayIndex: number } | null>(null);

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

  const handleEditSetPress = useCallback((set: SetRow) => {
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

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmVisible(false);
    setDeleteTarget(null);
  }, []);

  const handleDeleteSetPress = useCallback((set: SetRow, displayIndex: number) => {
    setDeleteTarget({ set, displayIndex });
    setDeleteConfirmVisible(true);
  }, []);

  const handleConfirmDeleteSet = useCallback(async () => {
    if (!deleteTarget) return;

    await deleteSet(deleteTarget.set.id);
    closeDeleteConfirm();
    await loadWorkout();
  }, [deleteTarget, closeDeleteConfirm, loadWorkout]);

  // Show error only if we don't have valid params (neither direct workoutExerciseId nor legacy exerciseId+workoutId)
  const hasValidParams = workoutExerciseIdParam || (exerciseIdParam && workoutIdParam);
  if (!hasValidParams) {
    return (
      <View className="flex-1 bg-background">
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
                className="px-3 py-1.5"
              >
                <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
              </Pressable>
            ),
          }}
        />
        <Text className="text-base text-center mt-12 text-destructive">Invalid exercise or workout ID</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
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
              className="px-3 py-1.5"
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

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
                returnKeyType="next"
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
                returnKeyType="next"
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
              returnKeyType="done"
            />
          </View>

          {/* Add Set Button */}
          <Pressable 
            className="flex-row items-center justify-center py-3.5 rounded-xl bg-primary"
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            onPress={handleAddSet}
          >
            <MaterialCommunityIcons name="plus" size={20} color={rawColors.primaryForeground} />
            <Text className="text-base font-semibold ml-1.5 text-primary-foreground">Add Set</Text>
          </Pressable>
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
              scrollEnabled={false}
              renderItem={({ item, index }) => (
                <SetItem
                  index={index + 1}
                  weightKg={item.weightKg}
                  reps={item.reps}
                  note={item.note}
                  rightActions={
                    <View className="flex-row items-center gap-2 ml-2">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Edit set ${index + 1}`}
                        hitSlop={8}
                        className="w-7 h-7 rounded-full items-center justify-center bg-background"
                        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                        onPress={() => handleEditSetPress(item)}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={16} color={rawColors.primary} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete set ${index + 1}`}
                        hitSlop={8}
                        className="w-7 h-7 rounded-full items-center justify-center bg-background"
                        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                        onPress={() => handleDeleteSetPress(item, index + 1)}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color={rawColors.destructive} />
                      </Pressable>
                    </View>
                  }
                />
              )}
            />
          )}
        </View>
      </ScrollView>

      {/* Save Edits Footer */}
      <View 
        className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-border bg-background"
        style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 8 }}
      >
        <Pressable 
          className="flex-row items-center justify-center py-4 rounded-xl bg-primary"
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          onPress={handleSaveEdits}
        >
          <MaterialCommunityIcons name="check-circle" size={22} color={rawColors.primaryForeground} />
          <Text className="text-base font-semibold ml-2 text-primary-foreground">Save Edits</Text>
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
        showTimePicker={true}
      />

      {/* Delete Set Confirm Modal */}
      <BaseModal
        visible={deleteConfirmVisible}
        onClose={closeDeleteConfirm}
        maxWidth={380}
      >
        <Text className="text-xl font-bold mb-2 text-foreground">Delete set?</Text>
        <Text className="text-base mb-4 text-foreground-secondary">
          This action cannot be undone.
        </Text>

        {deleteTarget && (
          <View className="rounded-lg p-3 mb-5 bg-surface-secondary border border-border">
            <Text className="text-sm font-semibold text-foreground">
              Set #{deleteTarget.displayIndex}:{" "}
              {deleteTarget.set.weightKg !== null ? `${deleteTarget.set.weightKg} kg` : "—"}{" "}
              × {deleteTarget.set.reps !== null ? `${deleteTarget.set.reps} reps` : "—"}
            </Text>
            {!!deleteTarget.set.note && (
              <Text className="text-sm mt-1 italic text-foreground-secondary" numberOfLines={2}>
                {deleteTarget.set.note}
              </Text>
            )}
          </View>
        )}

        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
            onPress={closeDeleteConfirm}
          >
            <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center p-3.5 rounded-lg gap-1.5 bg-destructive"
            onPress={handleConfirmDeleteSet}
          >
            <MaterialCommunityIcons name="delete" size={20} color={rawColors.surface} />
            <Text className="text-base font-semibold text-primary-foreground">Delete</Text>
          </Pressable>
        </View>
      </BaseModal>
    </View>
  );
}
