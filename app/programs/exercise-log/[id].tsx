import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import BaseModal from "../../../components/modals/BaseModal";
import { useTheme } from "../../../lib/theme/ThemeContext";
import { useUnitPreference } from "../../../lib/contexts/UnitPreferenceContext";
import {
  getCalendarExerciseById,
  getSetsForCalendarExercise,
  updateSetActuals,
  addUserSet,
  deleteUserSet,
  updateExerciseStatus,
  computeExerciseStatus,
  type ProgramCalendarSetRow,
} from "../../../lib/db/programCalendar";
import {
  getOrCreateActiveWorkout,
  addWorkoutExercise,
  addSet,
} from "../../../lib/db/workouts";
import { getExerciseByName } from "../../../lib/db/exercises";
import {
  formatIntensity,
  formatReps,
  getIntensityInputMode,
  getIntensityDefaultValue,
  getIntensityUnit,
} from "../../../lib/programs/psl/pslMapper";
import {
  formatWeightFromKg,
  parseWeightInputToKg,
  getWeightUnitLabel,
  formatEditableWeightFromKg,
} from "../../../lib/utils/units";

export default function ProgramExerciseLogScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const params = useLocalSearchParams<{ id: string; dateIso?: string }>();
  const calendarExerciseId = parseInt(params.id, 10);
  const dateIso = params.dateIso;

  const [exerciseName, setExerciseName] = useState("");
  const [prescribedSets, setPrescribedSets] = useState<ProgramCalendarSetRow[]>([]);
  const [userSets, setUserSets] = useState<ProgramCalendarSetRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-set input state: keyed by set id
  const [weightInputs, setWeightInputs] = useState<Record<number, string>>({});
  const [repsInputs, setRepsInputs] = useState<Record<number, string>>({});

  // Add Set card expanded state
  const addSetExpanded = useSharedValue(0);
  const [isAddSetExpanded, setIsAddSetExpanded] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const [newReps, setNewReps] = useState("");

  // Modal state
  const [completeModalVisible, setCompleteModalVisible] = useState(false);

  const ADD_SET_FULL_HEIGHT = 180;

  const addSetBodyStyle = useAnimatedStyle(() => ({
    height: withTiming(addSetExpanded.value === 1 ? ADD_SET_FULL_HEIGHT : 0, {
      duration: 250,
    }),
    opacity: withTiming(addSetExpanded.value === 1 ? 1 : 0, { duration: 200 }),
    overflow: "hidden" as const,
  }));

  const toggleAddSet = useCallback(() => {
    const next = isAddSetExpanded ? 0 : 1;
    addSetExpanded.value = next;
    setIsAddSetExpanded(!isAddSetExpanded);
  }, [isAddSetExpanded, addSetExpanded]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const calEx = await getCalendarExerciseById(calendarExerciseId);
      if (!calEx) return;

      setExerciseName(calEx.exerciseName);

      const allSets = await getSetsForCalendarExercise(calendarExerciseId);
      const prescribed = allSets.filter((s) => !s.isUserAdded);
      const user = allSets.filter((s) => s.isUserAdded);

      setPrescribedSets(prescribed);
      setUserSets(user);

      // Populate input defaults from prescribed values or actuals
      const wInputs: Record<number, string> = {};
      const rInputs: Record<number, string> = {};

      for (const set of allSets) {
        if (set.isLogged && set.actualWeight != null) {
          wInputs[set.id] = formatEditableWeightFromKg(set.actualWeight, unitPreference);
        } else if (set.prescribedIntensityJson) {
          try {
            const intensity = JSON.parse(set.prescribedIntensityJson);
            wInputs[set.id] = getIntensityDefaultValue(intensity);
          } catch {}
        }

        if (set.isLogged && set.actualReps != null) {
          rInputs[set.id] = String(set.actualReps);
        } else if (set.prescribedReps) {
          const repStr = set.prescribedReps;
          if (repStr.includes("-")) {
            rInputs[set.id] = repStr.split("-")[0];
          } else {
            rInputs[set.id] = repStr;
          }
        }
      }

      setWeightInputs(wInputs);
      setRepsInputs(rInputs);
    } catch (error) {
      console.error("Error loading exercise data:", error);
    } finally {
      setLoading(false);
    }
  }, [calendarExerciseId, unitPreference]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleWeightChange = useCallback((setId: number, value: string) => {
    setWeightInputs((prev) => ({ ...prev, [setId]: value }));
  }, []);

  const handleRepsChange = useCallback((setId: number, value: string) => {
    setRepsInputs((prev) => ({ ...prev, [setId]: value }));
  }, []);

  const handleSetBlur = useCallback(
    async (setId: number) => {
      const wStr = weightInputs[setId] ?? "";
      const rStr = repsInputs[setId] ?? "";
      const weight = parseFloat(wStr) || null;
      const repsVal = parseInt(rStr) || null;

      const isComplete = weight != null && repsVal != null;

      const weightKg = weight != null ? parseWeightInputToKg(wStr, unitPreference) : null;

      await updateSetActuals(setId, {
        actualWeight: weightKg,
        actualReps: repsVal,
        isLogged: isComplete,
      });

      // Recompute exercise status
      const status = await computeExerciseStatus(calendarExerciseId);
      await updateExerciseStatus(calendarExerciseId, status);
    },
    [weightInputs, repsInputs, calendarExerciseId, unitPreference]
  );

  const handleAddUserSet = useCallback(async () => {
    if (!newWeight && !newReps) return;
    Keyboard.dismiss();

    const allSets = [...prescribedSets, ...userSets];
    const nextIndex = allSets.length;

    const newSet = await addUserSet(calendarExerciseId, nextIndex);

    const weightKg = newWeight ? parseWeightInputToKg(newWeight, unitPreference) : null;
    const repsVal = newReps ? parseInt(newReps) : null;

    if (weightKg != null || repsVal != null) {
      await updateSetActuals(newSet.id, {
        actualWeight: weightKg,
        actualReps: repsVal,
        isLogged: weightKg != null && repsVal != null,
      });
    }

    setNewWeight("");
    setNewReps("");
    await loadData();
  }, [newWeight, newReps, prescribedSets, userSets, calendarExerciseId, unitPreference, loadData]);

  const handleDeleteUserSet = useCallback(
    async (setId: number) => {
      await deleteUserSet(setId);
      await loadData();
    },
    [loadData]
  );

  const allPrescribedComplete = useMemo(
    () => prescribedSets.length > 0 && prescribedSets.every((s) => s.isLogged),
    [prescribedSets]
  );

  const handleCompleteExercise = useCallback(async () => {
    setCompleteModalVisible(false);
    Keyboard.dismiss();

    // Log any filled-in but not-yet-logged sets
    for (const set of [...prescribedSets, ...userSets]) {
      const wStr = weightInputs[set.id] ?? "";
      const rStr = repsInputs[set.id] ?? "";
      const weight = parseFloat(wStr) || null;
      const repsVal = parseInt(rStr) || null;

      if (weight != null && repsVal != null && !set.isLogged) {
        const weightKg = parseWeightInputToKg(wStr, unitPreference);
        await updateSetActuals(set.id, {
          actualWeight: weightKg,
          actualReps: repsVal,
          isLogged: true,
        });
      }
    }

    // Also log user-added sets that are complete
    for (const set of userSets) {
      const wStr = weightInputs[set.id] ?? "";
      const rStr = repsInputs[set.id] ?? "";
      const weight = parseFloat(wStr) || null;
      const repsVal = parseInt(rStr) || null;

      if (weight != null && repsVal != null && !set.isLogged) {
        const weightKg = parseWeightInputToKg(wStr, unitPreference);
        await updateSetActuals(set.id, {
          actualWeight: weightKg,
          actualReps: repsVal,
          isLogged: true,
        });
      }
    }

    // Create actual workout records for exercise history tracking
    try {
      const exercise = await getExerciseByName(exerciseName);
      if (exercise) {
        const performedAt = dateIso ? new Date(dateIso + "T12:00:00").getTime() : Date.now();
        const workout = await getOrCreateActiveWorkout();
        const weId = await addWorkoutExercise({
          workout_id: workout.id,
          exercise_id: exercise.id,
          order_index: 0,
          performed_at: performedAt,
        });

        const allSets = [...prescribedSets, ...userSets];
        for (let i = 0; i < allSets.length; i++) {
          const set = allSets[i];
          if (set.isLogged || (weightInputs[set.id] && repsInputs[set.id])) {
            const wKg = set.actualWeight ?? parseWeightInputToKg(weightInputs[set.id] ?? "0", unitPreference);
            const r = set.actualReps ?? parseInt(repsInputs[set.id] ?? "0");
            if (wKg && r) {
              const setId = await addSet({
                workout_id: workout.id,
                exercise_id: exercise.id,
                workout_exercise_id: weId,
                set_index: i,
                weight_kg: wKg,
                reps: r,
                performed_at: performedAt,
              });
              await updateSetActuals(set.id, { setId_fk: setId });
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to create workout records:", e);
    }

    await updateExerciseStatus(calendarExerciseId, "complete");
    router.back();
  }, [
    prescribedSets,
    userSets,
    weightInputs,
    repsInputs,
    calendarExerciseId,
    exerciseName,
    dateIso,
    unitPreference,
  ]);

  const weightUnitLabel = getWeightUnitLabel(unitPreference);

  const renderPrescribedSet = useCallback(
    (set: ProgramCalendarSetRow, index: number) => {
      const wVal = weightInputs[set.id] ?? "";
      const rVal = repsInputs[set.id] ?? "";
      const isFilled = wVal.length > 0 && rVal.length > 0;
      const isLogged = set.isLogged;

      let intensityLabel = "";
      let intensityUnit = "";
      if (set.prescribedIntensityJson) {
        try {
          const intensity = JSON.parse(set.prescribedIntensityJson);
          intensityUnit = getIntensityUnit(intensity);
        } catch {}
      }

      const roleLabel = set.prescribedRole && set.prescribedRole !== "work"
        ? set.prescribedRole.charAt(0).toUpperCase() + set.prescribedRole.slice(1)
        : null;

      return (
        <View
          key={set.id}
          style={[
            styles.setRow,
            {
              backgroundColor: isLogged
                ? rawColors.success + "18"
                : isFilled
                ? rawColors.primary + "12"
                : rawColors.surfaceSecondary,
              borderColor: isLogged
                ? rawColors.success + "40"
                : isFilled
                ? rawColors.primary + "30"
                : rawColors.borderLight,
            },
          ]}
        >
          <View
            style={[
              styles.setNumber,
              {
                backgroundColor: isLogged
                  ? rawColors.success
                  : rawColors.primary,
              },
            ]}
          >
            {isLogged ? (
              <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
            ) : (
              <Text style={styles.setNumberText}>{index + 1}</Text>
            )}
          </View>

          <View style={styles.setInputs}>
            <View style={styles.inputGroup}>
              <TextInput
                style={[
                  styles.setInput,
                  {
                    backgroundColor: rawColors.surface,
                    borderColor: rawColors.borderLight,
                    color: rawColors.foreground,
                  },
                ]}
                value={wVal}
                onChangeText={(v) => handleWeightChange(set.id, v)}
                onBlur={() => handleSetBlur(set.id)}
                placeholder={intensityUnit === "RPE" || intensityUnit === "RIR" ? "Wt" : "Wt"}
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
              <Text style={[styles.unitLabel, { color: rawColors.foregroundSecondary }]}>
                {weightUnitLabel}
              </Text>
            </View>
            <View style={styles.inputGroup}>
              <TextInput
                style={[
                  styles.setInput,
                  {
                    backgroundColor: rawColors.surface,
                    borderColor: rawColors.borderLight,
                    color: rawColors.foreground,
                  },
                ]}
                value={rVal}
                onChangeText={(v) => handleRepsChange(set.id, v)}
                onBlur={() => handleSetBlur(set.id)}
                placeholder="Reps"
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="number-pad"
                selectTextOnFocus
              />
              <Text style={[styles.unitLabel, { color: rawColors.foregroundSecondary }]}>
                reps
              </Text>
            </View>
          </View>

          {roleLabel && (
            <View
              style={[styles.roleBadge, { backgroundColor: rawColors.primary + "20" }]}
            >
              <Text style={[styles.roleBadgeText, { color: rawColors.primary }]}>
                {roleLabel}
              </Text>
            </View>
          )}
        </View>
      );
    },
    [
      weightInputs,
      repsInputs,
      rawColors,
      weightUnitLabel,
      handleWeightChange,
      handleRepsChange,
      handleSetBlur,
    ]
  );

  const renderUserSet = useCallback(
    (set: ProgramCalendarSetRow, index: number) => {
      const wVal = weightInputs[set.id] ?? "";
      const rVal = repsInputs[set.id] ?? "";

      return (
        <View
          key={set.id}
          style={[
            styles.setRow,
            {
              backgroundColor: rawColors.surfaceSecondary,
              borderColor: rawColors.borderLight,
            },
          ]}
        >
          <View style={[styles.setNumber, { backgroundColor: rawColors.foregroundSecondary }]}>
            <Text style={styles.setNumberText}>+{index + 1}</Text>
          </View>

          <View style={styles.setInputs}>
            <View style={styles.inputGroup}>
              <TextInput
                style={[
                  styles.setInput,
                  {
                    backgroundColor: rawColors.surface,
                    borderColor: rawColors.borderLight,
                    color: rawColors.foreground,
                  },
                ]}
                value={wVal}
                onChangeText={(v) => handleWeightChange(set.id, v)}
                onBlur={() => handleSetBlur(set.id)}
                placeholder="Wt"
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
              <Text style={[styles.unitLabel, { color: rawColors.foregroundSecondary }]}>
                {weightUnitLabel}
              </Text>
            </View>
            <View style={styles.inputGroup}>
              <TextInput
                style={[
                  styles.setInput,
                  {
                    backgroundColor: rawColors.surface,
                    borderColor: rawColors.borderLight,
                    color: rawColors.foreground,
                  },
                ]}
                value={rVal}
                onChangeText={(v) => handleRepsChange(set.id, v)}
                onBlur={() => handleSetBlur(set.id)}
                placeholder="Reps"
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="number-pad"
                selectTextOnFocus
              />
              <Text style={[styles.unitLabel, { color: rawColors.foregroundSecondary }]}>
                reps
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => handleDeleteUserSet(set.id)}
            hitSlop={8}
            style={styles.deleteSetButton}
          >
            <MaterialCommunityIcons name="close-circle" size={20} color={rawColors.destructive} />
          </Pressable>
        </View>
      );
    },
    [
      weightInputs,
      repsInputs,
      rawColors,
      weightUnitLabel,
      handleWeightChange,
      handleRepsChange,
      handleSetBlur,
      handleDeleteUserSet,
    ]
  );

  return (
    <View style={styles.container} className="bg-background">
      <Stack.Screen
        options={{
          title: exerciseName || "Exercise",
          headerStyle: { backgroundColor: rawColors.background },
          headerTintColor: rawColors.foreground,
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Add Set Card (collapsible) */}
        <Pressable
          onPress={toggleAddSet}
          style={[styles.addSetHeader, { backgroundColor: rawColors.surface, borderColor: rawColors.borderLight }]}
        >
          <Text style={[styles.addSetTitle, { color: rawColors.foreground }]}>
            Add Extra Set
          </Text>
          <MaterialCommunityIcons
            name={isAddSetExpanded ? "chevron-up" : "chevron-down"}
            size={22}
            color={rawColors.foregroundSecondary}
          />
        </Pressable>

        <Animated.View style={[addSetBodyStyle, { overflow: "hidden" }]}>
          <View style={[styles.addSetBody, { backgroundColor: rawColors.surface, borderColor: rawColors.borderLight }]}>
            <View style={styles.addSetInputRow}>
              <View style={styles.addSetInputGroup}>
                <Text style={[styles.addSetLabel, { color: rawColors.foregroundSecondary }]}>
                  Weight ({weightUnitLabel})
                </Text>
                <TextInput
                  style={[
                    styles.addSetInput,
                    {
                      backgroundColor: rawColors.surfaceSecondary,
                      borderColor: rawColors.borderLight,
                      color: rawColors.foreground,
                    },
                  ]}
                  value={newWeight}
                  onChangeText={setNewWeight}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={rawColors.foregroundMuted}
                />
              </View>
              <View style={styles.addSetInputGroup}>
                <Text style={[styles.addSetLabel, { color: rawColors.foregroundSecondary }]}>
                  Reps
                </Text>
                <TextInput
                  style={[
                    styles.addSetInput,
                    {
                      backgroundColor: rawColors.surfaceSecondary,
                      borderColor: rawColors.borderLight,
                      color: rawColors.foreground,
                    },
                  ]}
                  value={newReps}
                  onChangeText={setNewReps}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={rawColors.foregroundMuted}
                />
              </View>
            </View>
            <Pressable
              onPress={handleAddUserSet}
              style={[styles.addSetButton, { backgroundColor: rawColors.primary }]}
            >
              <Text style={[styles.addSetButtonText, { color: rawColors.primaryForeground }]}>
                Add Set
              </Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* User-Added Sets */}
        {userSets.length > 0 && (
          <View style={styles.userSetsSection}>
            <Text style={[styles.sectionLabel, { color: rawColors.foregroundSecondary }]}>
              Extra Sets
            </Text>
            {userSets.map((set, i) => renderUserSet(set, i))}
          </View>
        )}

        {/* Programmed Sets Card */}
        <View style={[styles.card, { backgroundColor: rawColors.surface, borderColor: rawColors.borderLight }]}>
          <Text style={[styles.cardTitle, { color: rawColors.foreground }]}>
            Programmed Sets
          </Text>
          {prescribedSets.map((set, i) => renderPrescribedSet(set, i))}
        </View>
      </ScrollView>

      {/* Complete Exercise Footer */}
      <View style={[styles.footer, { backgroundColor: rawColors.background }]}>
        {allPrescribedComplete ? (
          <View
            style={[styles.footerButton, { backgroundColor: rawColors.surfaceSecondary }]}
          >
            <MaterialCommunityIcons name="check-circle" size={22} color={rawColors.success} />
            <Text style={[styles.footerButtonText, { color: rawColors.foregroundSecondary }]}>
              Exercise Complete
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => setCompleteModalVisible(true)}
            style={({ pressed }) => [
              styles.footerButton,
              {
                backgroundColor: rawColors.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons name="check" size={22} color={rawColors.primaryForeground} />
            <Text style={[styles.footerButtonText, { color: rawColors.primaryForeground }]}>
              Complete Exercise
            </Text>
          </Pressable>
        )}
      </View>

      {/* Confirmation Modal */}
      <BaseModal visible={completeModalVisible} onClose={() => setCompleteModalVisible(false)}>
        <Text style={[styles.modalTitle, { color: rawColors.foreground }]}>
          Complete Exercise?
        </Text>
        <Text style={[styles.modalBody, { color: rawColors.foregroundSecondary }]}>
          Some programmed sets haven't been filled in yet. Are you sure you want to log this exercise as complete?
        </Text>
        <View style={styles.modalButtons}>
          <Pressable
            onPress={() => setCompleteModalVisible(false)}
            style={[styles.modalButton, { backgroundColor: rawColors.surfaceSecondary }]}
          >
            <Text style={[styles.modalButtonText, { color: rawColors.foreground }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleCompleteExercise}
            style={[styles.modalButton, { backgroundColor: rawColors.primary }]}
          >
            <Text style={[styles.modalButtonText, { color: rawColors.primaryForeground }]}>
              Complete
            </Text>
          </Pressable>
        </View>
      </BaseModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  addSetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 2,
  },
  addSetTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  addSetBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 0,
  },
  addSetInputRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  addSetInputGroup: {
    flex: 1,
  },
  addSetLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
  },
  addSetInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: "600",
  },
  addSetButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  addSetButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  userSetsSection: {
    marginTop: 12,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  card: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 14,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  setNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  setNumberText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  setInputs: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
  },
  inputGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  setInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  unitLabel: {
    fontSize: 11,
    fontWeight: "500",
    width: 28,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 6,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  deleteSetButton: {
    marginLeft: 8,
    padding: 2,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
  },
  footerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  footerButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
