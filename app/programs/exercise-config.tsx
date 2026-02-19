import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import BaseModal from "../../components/modals/BaseModal";
import DatePickerModal from "../../components/modals/DatePickerModal";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import { useTheme } from "../../lib/theme/ThemeContext";
import {
  getProgramExerciseById,
  updateProgramExercise,
  listProgramExercises,
  type ProgramExercise,
} from "../../lib/db/programExercises";
import {
  listProgressionsForExercise,
  createProgression,
  deleteProgression,
  type Progression,
} from "../../lib/db/progressions";
import { listProgramDays, createProgramDay } from "../../lib/db/programDays";
import { createProgramExercise as createPE } from "../../lib/db/programExercises";
import {
  parseProgramPrescription,
  serializePrescription,
  type ProgramPrescriptionV1,
  type WorkBlock,
  type WarmupBlock,
  type PrescriptionBlock,
  type RepSpec,
  type TargetSpec,
} from "../../lib/programs/prescription";
import {
  EXERCISE_PROGRESSION_TEMPLATES,
  type ExerciseProgressionTemplate,
} from "../../lib/programs/exerciseTemplates";
import {
  formatEditableWeightFromKg,
  getWeightUnitLabel,
  parseWeightInputToKg,
} from "../../lib/utils/units";

// ============================================================================
// Types
// ============================================================================

type PlannedSet = {
  key: string;
  weight: string;
  reps: string;
  rpe: string;
  isWarmup: boolean;
};

type RepeatMode = "none" | "weekly" | "interval";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type IncrementMode = "none" | "per_session" | "per_week" | "template";
type DurationMode = "weeks" | "end_date";

// ============================================================================
// Main Screen
// ============================================================================

export default function ExerciseConfigScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const params = useLocalSearchParams<{
    programExerciseId?: string;
    exerciseId?: string;
    exerciseName?: string;
    programId?: string;
    dayKey?: string;
  }>();

  const programExerciseId =
    typeof params.programExerciseId === "string" ? parseInt(params.programExerciseId, 10) : null;
  const exerciseId = typeof params.exerciseId === "string" ? parseInt(params.exerciseId, 10) : null;
  const exerciseName = typeof params.exerciseName === "string" ? params.exerciseName : "Exercise";
  const programId = typeof params.programId === "string" ? parseInt(params.programId, 10) : null;
  const dayKey = typeof params.dayKey === "string" ? params.dayKey : "";

  // Sets state (RecordTab-style)
  const [plannedSets, setPlannedSets] = useState<PlannedSet[]>([]);
  const [weightInput, setWeightInput] = useState("");
  const [repsInput, setRepsInput] = useState("");
  const [rpeInput, setRpeInput] = useState("");
  const [isWarmupInput, setIsWarmupInput] = useState(false);

  // Repeat state
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("none");
  const [selectedWeekdays, setSelectedWeekdays] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const [intervalDays, setIntervalDays] = useState("2");

  // Increment / progression state
  const [incrementMode, setIncrementMode] = useState<IncrementMode>("none");
  const [incrementValue, setIncrementValue] = useState("2.5");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templatePickerVisible, setTemplatePickerVisible] = useState(false);

  // Duration state (how long to run the repeat)
  const [durationMode, setDurationMode] = useState<DurationMode>("weeks");
  const [durationWeeks, setDurationWeeks] = useState("8");
  const [durationEndDate, setDurationEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 56);
    return d;
  });
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  const [saving, setSaving] = useState(false);
  const weightUnitLabel = getWeightUnitLabel(unitPreference);

  // Load existing data
  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        if (!programExerciseId) return;
        const pe = await getProgramExerciseById(programExerciseId);
        if (!pe) return;

        const prescription = parseProgramPrescription(pe.prescriptionJson);
        if (prescription) {
          const sets: PlannedSet[] = [];
          for (const block of prescription.blocks) {
            if (block.kind === "warmup") {
              for (let i = 0; i < block.sets; i++) {
                sets.push({
                  key: `ws_${Date.now()}_${Math.random()}`,
                  weight: "",
                  reps: block.reps?.toString() ?? "",
                  rpe: "",
                  isWarmup: true,
                });
              }
            } else if (block.kind === "work") {
              const repsStr =
                block.reps.type === "fixed"
                  ? String(block.reps.value)
                  : `${block.reps.min}-${block.reps.max}`;
              let weightStr = "";
              let rpeStr = "";
              if (block.target) {
                if (block.target.type === "fixed_weight_kg") {
                  weightStr = formatEditableWeightFromKg(block.target.value, unitPreference);
                }
                else if (block.target.type === "rpe") rpeStr = String(block.target.value);
              }
              for (let i = 0; i < block.sets; i++) {
                sets.push({
                  key: `ws_${Date.now()}_${Math.random()}_${i}`,
                  weight: weightStr,
                  reps: repsStr,
                  rpe: rpeStr,
                  isWarmup: false,
                });
              }
            }
          }
          if (sets.length > 0) setPlannedSets(sets);
        }

        // Load existing progression
        const progs = await listProgressionsForExercise(programExerciseId);
        if (progs.length > 0) {
          const prog = progs[0];
          setIncrementValue(formatEditableWeightFromKg(prog.value, unitPreference));
          if (prog.cadence === "every_session") {
            setIncrementMode("per_session");
          } else if (prog.cadence === "weekly") {
            setIncrementMode("per_week");
          }
        }
      };
      load();
    }, [programExerciseId, unitPreference])
  );

  // ----------------------------------------
  // Add Set (RecordTab-style)
  // ----------------------------------------
  const handleAddSet = useCallback(() => {
    Keyboard.dismiss();
    const newSet: PlannedSet = {
      key: `ps_${Date.now()}_${Math.random()}`,
      weight: weightInput.trim(),
      reps: repsInput.trim(),
      rpe: rpeInput.trim(),
      isWarmup: isWarmupInput,
    };
    setPlannedSets((prev) => [...prev, newSet]);
    // Don't clear inputs - user likely wants to reuse for next set
  }, [weightInput, repsInput, rpeInput, isWarmupInput]);

  const handleRemoveSet = useCallback((key: string) => {
    setPlannedSets((prev) => prev.filter((s) => s.key !== key));
  }, []);

  // ----------------------------------------
  // Weekday toggle
  // ----------------------------------------
  const toggleWeekday = useCallback((index: number) => {
    setSelectedWeekdays((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }, []);

  // ----------------------------------------
  // Save
  // ----------------------------------------
  const handleSave = useCallback(async () => {
    if (!programExerciseId || !exerciseId || !programId || saving) return;
    setSaving(true);

    try {
      // Build prescription from planned sets
      const blocks: PrescriptionBlock[] = [];

      // Group consecutive warmup sets
      let warmupCount = 0;
      let warmupReps: number | undefined;
      const workSets: PlannedSet[] = [];

      for (const s of plannedSets) {
        if (s.isWarmup) {
          warmupCount++;
          if (s.reps) warmupReps = parseInt(s.reps) || undefined;
        } else {
          workSets.push(s);
        }
      }

      if (warmupCount > 0) {
        blocks.push({
          kind: "warmup",
          style: "ramp",
          sets: warmupCount,
          reps: warmupReps,
        });
      }

      // Group work sets by same reps/weight/rpe
      if (workSets.length > 0) {
        // For simplicity, group all work sets together (user can differentiate later)
        const groupMap = new Map<string, PlannedSet[]>();
        for (const s of workSets) {
          const groupKey = `${s.reps}|${s.weight}|${s.rpe}`;
          if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
          groupMap.get(groupKey)!.push(s);
        }

        for (const [, group] of groupMap) {
          const sample = group[0];
          let reps: RepSpec = { type: "fixed", value: 5 };
          if (sample.reps.includes("-")) {
            const [min, max] = sample.reps.split("-").map(Number);
            if (min && max) reps = { type: "range", min, max };
          } else {
            const val = parseInt(sample.reps);
            if (val > 0) reps = { type: "fixed", value: val };
          }

          let target: TargetSpec | undefined;
          if (sample.weight) {
            const w = parseWeightInputToKg(sample.weight, unitPreference);
            if (w !== null && w > 0) target = { type: "fixed_weight_kg", value: w };
          }
          if (sample.rpe) {
            const r = parseFloat(sample.rpe);
            if (r > 0) target = { type: "rpe", value: r };
          }

          blocks.push({
            kind: "work",
            sets: group.length,
            reps,
            target,
          });
        }
      }

      const prescription: ProgramPrescriptionV1 = {
        version: 1,
        blocks,
      };

      await updateProgramExercise(programExerciseId, {
        prescription_json: serializePrescription(prescription),
      });

      // Handle progression
      // First delete existing progressions
      const existingProgs = await listProgressionsForExercise(programExerciseId);
      for (const p of existingProgs) {
        await deleteProgression(p.id);
      }

      if (incrementMode === "per_session" || incrementMode === "per_week") {
        const val = parseWeightInputToKg(incrementValue, unitPreference);
        if (val !== null && val > 0) {
          await createProgression({
            program_exercise_id: programExerciseId,
            type: "kg_per_session",
            value: val,
            cadence: incrementMode === "per_session" ? "every_session" : "weekly",
          });
        }
      }

      // Handle repeating: create program_days + program_exercises on other days
      // Compute the end date from the duration settings
      const computeEndDate = (): Date => {
        if (durationMode === "weeks") {
          const weeks = parseInt(durationWeeks) || 8;
          const startDate = new Date(dayKey + "T00:00:00");
          const end = new Date(startDate);
          end.setDate(end.getDate() + weeks * 7);
          return end;
        }
        return durationEndDate;
      };

      // Build a prescription with incremented weights for a given occurrence number.
      // occurrence 0 = the original, 1 = the first repeat, etc.
      const buildIncrementedPrescription = (
        basePrescription: ProgramPrescriptionV1,
        occurrenceIndex: number
      ): string => {
        if (occurrenceIndex === 0 || incrementMode === "none" || incrementMode === "template") {
          return serializePrescription(basePrescription);
        }

        const incVal = parseWeightInputToKg(incrementValue, unitPreference) || 0;
        if (incVal <= 0) return serializePrescription(basePrescription);

        // For per_week: increment once per week occurrence
        // For per_session: increment once per session occurrence
        const totalIncrement = incVal * occurrenceIndex;

        // Deep clone and modify work block targets
        const modified: ProgramPrescriptionV1 = {
          ...basePrescription,
          blocks: basePrescription.blocks.map((block) => {
            if (block.kind !== "work" || !block.target) return block;
            if (block.target.type === "fixed_weight_kg") {
              return {
                ...block,
                target: {
                  type: "fixed_weight_kg" as const,
                  value: Math.round((block.target.value + totalIncrement) * 4) / 4,
                },
              };
            }
            return block;
          }),
        };
        return serializePrescription(modified);
      };

      // Helper to create an exercise on a day with full prescription + progression
      const addExerciseToDay = async (
        dayId: number,
        orderIndex: number,
        prescriptionJson: string
      ): Promise<void> => {
        const newPeId = await createPE({
          program_day_id: dayId,
          exercise_id: exerciseId,
          order_index: orderIndex,
          prescription_json: prescriptionJson,
        });
        // Propagate the same progression to the new exercise
        if (incrementMode === "per_session" || incrementMode === "per_week") {
          const val = parseWeightInputToKg(incrementValue, unitPreference);
          if (val !== null && val > 0) {
            await createProgression({
              program_exercise_id: newPeId,
              type: "kg_per_session",
              value: val,
              cadence: incrementMode === "per_session" ? "every_session" : "weekly",
            });
          }
        }
      };

      if (repeatMode === "weekly" || repeatMode === "interval") {
        const existingDays = await listProgramDays(programId);
        const existingDayKeys = new Set(existingDays.map((d) => d.note));
        const endDate = computeEndDate();

        // Start from the dayKey date (the date the exercise was added), not today
        const startDate = new Date(dayKey + "T00:00:00");
        startDate.setHours(0, 0, 0, 0);

        // Collect all target dayKeys in chronological order to compute occurrence indices
        const targetDayKeys: string[] = [];

        if (repeatMode === "weekly") {
          const dayAfterStart = new Date(startDate);
          dayAfterStart.setDate(dayAfterStart.getDate() + 1);
          for (let d = new Date(dayAfterStart); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay();
            if (!selectedWeekdays[dow]) continue;
            const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            if (dk !== dayKey) targetDayKeys.push(dk);
          }
        } else if (repeatMode === "interval") {
          const gap = parseInt(intervalDays) || 2;
          let nextDate = new Date(startDate);
          nextDate.setDate(nextDate.getDate() + gap);
          while (nextDate <= endDate) {
            const dk = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;
            targetDayKeys.push(dk);
            nextDate.setDate(nextDate.getDate() + gap);
          }
        }

        // Determine occurrence grouping for per_week vs per_session
        // per_session: every occurrence gets +1 increment
        // per_week: occurrences in the same week share the same increment
        let sessionCounter = 0;
        let lastWeekNumber = -1;
        let weekCounter = 0;

        for (const dk of targetDayKeys) {
          sessionCounter++;

          // Compute which week number this date falls in relative to startDate
          const dkDate = new Date(dk + "T00:00:00");
          const diffDays = Math.round((dkDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          const weekNum = Math.floor(diffDays / 7);

          if (weekNum > lastWeekNumber) {
            weekCounter++;
            lastWeekNumber = weekNum;
          }

          const occurrenceIdx = incrementMode === "per_week" ? weekCounter : sessionCounter;
          const prescriptionForDay = buildIncrementedPrescription(prescription, occurrenceIdx);

          if (existingDayKeys.has(dk)) {
            const existingDay = existingDays.find((dd) => dd.note === dk);
            if (existingDay) {
              const existingPEs = await listProgramExercises(existingDay.id);
              const alreadyHas = existingPEs.some((pe) => pe.exerciseId === exerciseId);
              if (!alreadyHas) {
                await addExerciseToDay(existingDay.id, existingPEs.length, prescriptionForDay);
              }
            }
          } else {
            const newDayId = await createProgramDay({
              program_id: programId,
              schedule: repeatMode === "weekly" ? "weekly" : "interval",
              day_of_week: null,
              interval_days: repeatMode === "interval" ? (parseInt(intervalDays) || 2) : null,
              note: dk,
            });
            await addExerciseToDay(newDayId, 0, prescriptionForDay);
            existingDayKeys.add(dk);
          }
        }
      }

      router.back();
    } catch (error) {
      console.error("Error saving exercise config:", error);
      Alert.alert("Error", "Failed to save exercise configuration.");
    } finally {
      setSaving(false);
    }
  }, [
    programExerciseId,
    exerciseId,
    programId,
    dayKey,
    plannedSets,
    repeatMode,
    selectedWeekdays,
    intervalDays,
    incrementMode,
    incrementValue,
    unitPreference,
    selectedTemplateId,
    durationMode,
    durationWeeks,
    durationEndDate,
    saving,
  ]);

  const selectedTemplate = selectedTemplateId
    ? EXERCISE_PROGRESSION_TEMPLATES.find((t) => t.id === selectedTemplateId) ?? null
    : null;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: exerciseName,
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
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
        {/* ================================================================ */}
        {/* SECTION 1: Sets (RecordTab-style)                                */}
        {/* ================================================================ */}
        <View
          className="rounded-2xl p-5 mb-4 bg-surface"
          style={{
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-semibold text-foreground">Planned Sets</Text>
            <View className="flex-row items-center px-3 py-1.5 rounded-full bg-primary-light">
              <Text className="text-sm font-medium text-primary">
                {plannedSets.length} set{plannedSets.length !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>

          {/* Input row */}
          <View className="flex-row gap-2 mb-3">
            <View className="flex-1">
              <Text className="text-[11px] uppercase text-foreground-muted mb-1">
                Weight ({weightUnitLabel})
              </Text>
              <TextInput
                className="border border-border rounded-xl p-3 text-base bg-surface-secondary text-foreground"
                value={weightInput}
                onChangeText={setWeightInput}
                placeholder="0"
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1">
              <Text className="text-[11px] uppercase text-foreground-muted mb-1">Reps</Text>
              <TextInput
                className="border border-border rounded-xl p-3 text-base bg-surface-secondary text-foreground"
                value={repsInput}
                onChangeText={setRepsInput}
                placeholder="5"
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="default"
              />
            </View>
            <View style={{ width: 70 }}>
              <Text className="text-[11px] uppercase text-foreground-muted mb-1">RPE</Text>
              <TextInput
                className="border border-border rounded-xl p-3 text-base bg-surface-secondary text-foreground"
                value={rpeInput}
                onChangeText={setRpeInput}
                placeholder="—"
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Warmup toggle + Add button */}
          <View className="flex-row gap-3 items-center">
            <Pressable
              onPress={() => setIsWarmupInput(!isWarmupInput)}
              className={`flex-row items-center px-3 h-[48px] rounded-xl border ${
                isWarmupInput ? "border-warning bg-warning/10" : "border-border bg-surface-secondary"
              }`}
            >
              <MaterialCommunityIcons
                name={isWarmupInput ? "fire" : "fire"}
                size={18}
                color={isWarmupInput ? rawColors.warning : rawColors.foregroundMuted}
              />
              <Text
                className={`text-sm font-medium ml-1.5 ${
                  isWarmupInput ? "text-warning" : "text-foreground-muted"
                }`}
              >
                Warmup
              </Text>
            </Pressable>

            <Pressable
              className="flex-1 flex-row items-center justify-center h-[48px] rounded-xl bg-primary"
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              onPress={handleAddSet}
            >
              <MaterialCommunityIcons name="plus" size={20} color={rawColors.primaryForeground} />
              <Text className="text-base font-semibold ml-1.5 text-primary-foreground">Add Set</Text>
            </Pressable>
          </View>

          {/* Set list */}
          {plannedSets.length > 0 && (
            <View className="mt-4">
              {plannedSets.map((s, idx) => (
                <View
                  key={s.key}
                  className={`flex-row items-center p-3 rounded-xl mb-1.5 ${
                    s.isWarmup ? "bg-warning/10" : "bg-surface-secondary"
                  }`}
                >
                  <View className="w-7 h-7 rounded-full items-center justify-center bg-primary mr-2.5">
                    <Text className="text-[11px] font-bold text-primary-foreground">{idx + 1}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-foreground">
                      {s.weight ? `${s.weight} ${weightUnitLabel}` : `-- ${weightUnitLabel}`} x {s.reps || "--"} reps
                      {s.rpe ? ` @RPE ${s.rpe}` : ""}
                    </Text>
                    {s.isWarmup && (
                      <Text className="text-[10px] text-warning font-semibold mt-0.5">WARMUP</Text>
                    )}
                  </View>
                  <Pressable onPress={() => handleRemoveSet(s.key)} hitSlop={8} className="p-1">
                    <MaterialCommunityIcons
                      name="close-circle-outline"
                      size={18}
                      color={rawColors.destructive}
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ================================================================ */}
        {/* SECTION 2: Repeat Pattern                                        */}
        {/* ================================================================ */}
        <View
          className="rounded-2xl p-5 mb-4 bg-surface"
          style={{
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <Text className="text-lg font-semibold mb-3 text-foreground">Repeat</Text>
          <Text className="text-xs text-foreground-secondary mb-3">
            Choose how this exercise repeats on other days in the program.
          </Text>

          {/* Repeat mode pills */}
          <View className="flex-row gap-2 mb-3">
            {(
              [
                { mode: "none" as RepeatMode, label: "Don't Repeat", icon: "close-circle-outline" },
                { mode: "weekly" as RepeatMode, label: "Weekly", icon: "calendar-week" },
                { mode: "interval" as RepeatMode, label: "Every N Days", icon: "repeat" },
              ] as const
            ).map(({ mode, label, icon }) => (
              <Pressable
                key={mode}
                onPress={() => setRepeatMode(mode)}
                className={`flex-1 items-center py-2.5 rounded-xl border ${
                  repeatMode === mode ? "border-primary bg-primary-light" : "border-border bg-surface-secondary"
                }`}
              >
                <MaterialCommunityIcons
                  name={icon as any}
                  size={18}
                  color={repeatMode === mode ? rawColors.primary : rawColors.foregroundMuted}
                />
                <Text
                  className={`text-[11px] font-medium mt-1 ${
                    repeatMode === mode ? "text-primary" : "text-foreground-muted"
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Weekly: day-of-week picker */}
          {repeatMode === "weekly" && (
            <View className="mt-2">
              <Text className="text-xs text-foreground-secondary mb-2">Select days:</Text>
              <View className="flex-row gap-1.5">
                {WEEKDAY_LABELS.map((label, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => toggleWeekday(idx)}
                    className={`flex-1 items-center py-2.5 rounded-lg ${
                      selectedWeekdays[idx] ? "bg-primary" : "bg-surface-secondary"
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-semibold ${
                        selectedWeekdays[idx] ? "text-primary-foreground" : "text-foreground-muted"
                      }`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Interval: number input */}
          {repeatMode === "interval" && (
            <View className="mt-2 flex-row items-center">
              <Text className="text-sm text-foreground-secondary mr-2">Every</Text>
              <TextInput
                className="border border-border rounded-lg p-2.5 text-base w-16 text-center bg-surface-secondary text-foreground"
                value={intervalDays}
                onChangeText={setIntervalDays}
                keyboardType="number-pad"
              />
              <Text className="text-sm text-foreground-secondary ml-2">days</Text>
            </View>
          )}

          {/* Duration sub-section (only when repeating) */}
          {repeatMode !== "none" && (
            <View className="mt-4 pt-4 border-t border-border">
              <Text className="text-sm font-semibold mb-2 text-foreground">Duration</Text>
              <Text className="text-xs text-foreground-secondary mb-3">
                How long should this exercise repeat?
              </Text>

              <View className="flex-row gap-2 mb-3">
                <Pressable
                  onPress={() => setDurationMode("weeks")}
                  className={`flex-1 items-center py-2.5 rounded-xl border ${
                    durationMode === "weeks"
                      ? "border-primary bg-primary-light"
                      : "border-border bg-surface-secondary"
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      durationMode === "weeks" ? "text-primary" : "text-foreground-muted"
                    }`}
                  >
                    Number of Weeks
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setDurationMode("end_date")}
                  className={`flex-1 items-center py-2.5 rounded-xl border ${
                    durationMode === "end_date"
                      ? "border-primary bg-primary-light"
                      : "border-border bg-surface-secondary"
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      durationMode === "end_date" ? "text-primary" : "text-foreground-muted"
                    }`}
                  >
                    End Date
                  </Text>
                </Pressable>
              </View>

              {durationMode === "weeks" ? (
                <View className="flex-row items-center">
                  <Text className="text-sm text-foreground-secondary mr-2">Run for</Text>
                  <TextInput
                    className="border border-border rounded-lg p-2.5 text-base w-16 text-center bg-surface-secondary text-foreground"
                    value={durationWeeks}
                    onChangeText={setDurationWeeks}
                    keyboardType="number-pad"
                  />
                  <Text className="text-sm text-foreground-secondary ml-2">weeks</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowEndDatePicker(true)}
                  className="flex-row items-center justify-between p-3 rounded-xl border border-border bg-surface-secondary"
                >
                  <View className="flex-row items-center">
                    <MaterialCommunityIcons name="calendar" size={18} color={rawColors.primary} />
                    <Text className="text-sm text-foreground ml-2">
                      {durationEndDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-down" size={18} color={rawColors.foregroundSecondary} />
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* ================================================================ */}
        {/* SECTION 3: Progression / Increment                               */}
        {/* ================================================================ */}
        <View
          className="rounded-2xl p-5 mb-4 bg-surface"
          style={{
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <Text className="text-lg font-semibold mb-3 text-foreground">Progression</Text>
          <Text className="text-xs text-foreground-secondary mb-3">
            How should the weight increase over time?
          </Text>

          {/* Increment mode pills */}
          <View className="flex-row gap-2 mb-3 flex-wrap">
            {(
              [
                { mode: "none" as IncrementMode, label: "None" },
                { mode: "per_session" as IncrementMode, label: "Per Session" },
                { mode: "per_week" as IncrementMode, label: "Per Week" },
                { mode: "template" as IncrementMode, label: "Template" },
              ] as const
            ).map(({ mode, label }) => (
              <Pressable
                key={mode}
                onPress={() => setIncrementMode(mode)}
                className={`px-4 py-2.5 rounded-xl border ${
                  incrementMode === mode ? "border-primary bg-primary-light" : "border-border bg-surface-secondary"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    incrementMode === mode ? "text-primary" : "text-foreground-muted"
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Custom increment value */}
          {(incrementMode === "per_session" || incrementMode === "per_week") && (
            <View className="flex-row items-center mt-2">
              <Text className="text-sm text-foreground-secondary mr-2">Increase by</Text>
              <TextInput
                className="border border-border rounded-lg p-2.5 text-base w-20 text-center bg-surface-secondary text-foreground"
                value={incrementValue}
                onChangeText={setIncrementValue}
                keyboardType="decimal-pad"
              />
              <Text className="text-sm text-foreground-secondary ml-2">
                {weightUnitLabel} / {incrementMode === "per_session" ? "session" : "week"}
              </Text>
            </View>
          )}

          {/* Template picker */}
          {incrementMode === "template" && (
            <View className="mt-2">
              <Pressable
                onPress={() => setTemplatePickerVisible(true)}
                className="flex-row items-center justify-between p-3.5 rounded-xl border border-border bg-surface-secondary"
              >
                <Text className="text-sm text-foreground">
                  {selectedTemplate ? selectedTemplate.name : "Select a progression template..."}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={20}
                  color={rawColors.foregroundSecondary}
                />
              </Pressable>
              {selectedTemplate && (
                <View className="mt-2 p-3 rounded-lg bg-surface-secondary">
                  <Text className="text-xs text-foreground-secondary mb-1">{selectedTemplate.description}</Text>
                  <Text className="text-xs text-foreground-muted">
                    {selectedTemplate.cycleSessions} sessions per cycle
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Save button */}
      <View
        className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-border bg-background"
        style={{
          shadowColor: rawColors.shadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 8,
        }}
      >
        <Pressable
          className="flex-row items-center justify-center py-4 rounded-xl bg-primary"
          style={({ pressed }) => ({ opacity: pressed || saving ? 0.7 : 1 })}
          onPress={handleSave}
          disabled={saving}
        >
          <MaterialCommunityIcons name="check" size={20} color={rawColors.primaryForeground} />
          <Text className="text-base font-semibold ml-2 text-primary-foreground">
            {saving ? "Saving..." : "Save Exercise"}
          </Text>
        </Pressable>
      </View>

      {/* Template Picker Modal */}
      <BaseModal
        visible={templatePickerVisible}
        onClose={() => setTemplatePickerVisible(false)}
        maxWidth={420}
        contentStyle={{ padding: 0, maxHeight: "70%" }}
      >
        <View className="p-4 border-b border-border">
          <Text className="text-lg font-bold text-foreground">Progression Templates</Text>
          <Text className="text-sm text-foreground-secondary mt-1">
            Select a structured progression scheme for this exercise.
          </Text>
        </View>
        <FlatList
          data={EXERCISE_PROGRESSION_TEMPLATES}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 16 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                setSelectedTemplateId(item.id);
                setTemplatePickerVisible(false);
              }}
              className={`px-4 py-3 border-b border-border ${
                selectedTemplateId === item.id ? "bg-primary-light" : ""
              }`}
            >
              <Text className="text-base font-semibold text-foreground">{item.name}</Text>
              <Text className="text-xs text-foreground-secondary mt-0.5">{item.description}</Text>
              <Text className="text-[10px] text-foreground-muted mt-1">
                {item.cycleSessions} sessions per cycle
              </Text>
            </Pressable>
          )}
        />
      </BaseModal>

      {/* End Date Picker Modal */}
      <DatePickerModal
        visible={showEndDatePicker}
        onClose={() => setShowEndDatePicker(false)}
        value={durationEndDate}
        onChange={(date) => {
          setDurationEndDate(date);
          setShowEndDatePicker(false);
        }}
        minimumDate={new Date(dayKey + "T00:00:00")}
        title="Exercise End Date"
      />
    </View>
  );
}

