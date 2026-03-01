import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import BaseModal from "../../../components/modals/BaseModal";
import { useTheme } from "../../../lib/theme/ThemeContext";
import { createPslProgram } from "../../../lib/db/pslPrograms";
import { compilePslSource } from "../../../lib/programs/psl/pslService";
import { generatePslFromConfig } from "../../../lib/programs/psl/pslGenerator";
import {
  computeEndDateIso,
  DEFAULT_ACTIVATION_WEEKS,
  getDefaultActivationStartDateIso,
} from "../../../lib/programs/psl/activationDates";
import type { Weekday } from "program-specification-language";

const WEEKDAYS: { key: Weekday; label: string; short: string }[] = [
  { key: "MON", label: "Monday", short: "M" },
  { key: "TUE", label: "Tuesday", short: "T" },
  { key: "WED", label: "Wednesday", short: "W" },
  { key: "THU", label: "Thursday", short: "T" },
  { key: "FRI", label: "Friday", short: "F" },
  { key: "SAT", label: "Saturday", short: "S" },
  { key: "SUN", label: "Sunday", short: "S" },
];

function getAlphabetLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

interface ExerciseSetConfig {
  count: number;
  reps: string;
  intensity: string;
  intensityType: "percent_1rm" | "rpe" | "rir" | "load" | "none";
  role: string;
  progression: string;
}

interface DayExercise {
  exerciseId: number;
  exerciseName: string;
  sets: ExerciseSetConfig[];
}

type DaySchedule = Record<Weekday, DayExercise[]>;

export default function ProgramScheduleScreen() {
	const { rawColors } = useTheme();
	const params = useLocalSearchParams<{
	    name?: string;
	    description?: string;
	    units?: string;
	}>();

	const programName = params.name ?? "Program";
	const programDesc = params.description ?? "";
	const programUnits = (params.units as "kg" | "lb") ?? "kg";

  const [selectedDay, setSelectedDay] = useState<Weekday>("MON");
  const [daySchedule, setDaySchedule] = useState<DaySchedule>({
    MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [],
  });
  const [exerciseConfigVisible, setExerciseConfigVisible] = useState(false);
  const [configTarget, setConfigTarget] = useState<{ day: Weekday; index: number } | null>(null);
  const [activateNow, setActivateNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Register global callback for the exercise picker page
  useEffect(() => {
    (globalThis as any).__exercisePickerCallback = (
      exercises: { id: number; name: string }[],
      day: string
    ) => {
      const weekday = day as Weekday;
      const newExercises: DayExercise[] = exercises.map((ex) => ({
        exerciseId: ex.id,
        exerciseName: ex.name,
        sets: [{ count: 3, reps: "5", intensity: "", intensityType: "none", role: "work", progression: "" }],
      }));
      setDaySchedule((prev) => ({
        ...prev,
        [weekday]: [...prev[weekday], ...newExercises],
      }));
    };
    return () => {
      delete (globalThis as any).__exercisePickerCallback;
    };
  }, []);

  const currentDayExercises = daySchedule[selectedDay];
  const totalExercises = Object.values(daySchedule).reduce((sum, exs) => sum + exs.length, 0);
  const daysWithExercises = Object.entries(daySchedule).filter(([, exs]) => exs.length > 0).length;

  const handleOpenExercisePicker = useCallback(() => {
    const existingIds = currentDayExercises.map((e) => e.exerciseId).join(",");
    const dayLabel = WEEKDAYS.find((w) => w.key === selectedDay)?.label ?? selectedDay;
    router.push({
      pathname: "/programs/create/exercise-picker",
      params: { day: selectedDay, dayLabel, existingIds },
    });
  }, [selectedDay, currentDayExercises]);

  const handleRemoveExercise = useCallback((day: Weekday, index: number) => {
    setDaySchedule((prev) => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== index),
    }));
  }, []);

  const handleOpenConfig = useCallback((day: Weekday, index: number) => {
    setConfigTarget({ day, index });
    setExerciseConfigVisible(true);
  }, []);

  const handleUpdateExerciseConfig = useCallback(
    (sets: ExerciseSetConfig[]) => {
      if (!configTarget) return;
      setDaySchedule((prev) => {
        const dayExs = [...prev[configTarget.day]];
        dayExs[configTarget.index] = { ...dayExs[configTarget.index], sets };
        return { ...prev, [configTarget.day]: dayExs };
      });
      setExerciseConfigVisible(false);
      setConfigTarget(null);
    },
    [configTarget]
  );

	  const buildPslAndSave = useCallback(async () => {
	    setSaving(true);
	    setErrorMessage("");

	    try {
	      const config = {
	        name: programName,
	        description: programDesc || undefined,
	        units: programUnits,
	        days: WEEKDAYS
	          .filter((wd) => daySchedule[wd.key].length > 0)
	          .map((wd) => ({
	            day: wd.key,
            exercises: daySchedule[wd.key].map((ex) => ({
              exerciseName: ex.exerciseName,
              sets: ex.sets.map((s) => {
                const setConfig: any = {
                  count: s.count,
                  reps: s.reps.includes("-")
                    ? { min: parseInt(s.reps.split("-")[0]), max: parseInt(s.reps.split("-")[1]) }
                    : parseInt(s.reps) || 5,
                };

                if (s.intensity && s.intensityType !== "none") {
                  const val = parseFloat(s.intensity);
                  if (!isNaN(val)) {
                    switch (s.intensityType) {
                      case "percent_1rm":
                        setConfig.intensity = { type: "percent_1rm", value: val };
                        break;
                      case "rpe":
                        setConfig.intensity = { type: "rpe", value: val };
                        break;
                      case "rir":
                        setConfig.intensity = { type: "rir", value: val };
                        break;
                      case "load":
                        setConfig.intensity = { type: "load", value: val, unit: programUnits };
                        break;
                    }
                  }
                }

                if (s.role && s.role !== "work") {
                  setConfig.role = s.role;
                }

                if (s.progression) {
                  setConfig.progression = {
                    type: "increment" as const,
                    by: parseFloat(s.progression) || 2.5,
                    unit: programUnits,
                    cadence: "every session" as const,
                    condition: "if success" as const,
                  };
                }

                return setConfig;
              }),
            })),
          })),
      };

	      const pslSource = generatePslFromConfig(config);

	      // Validate the generated PSL
	      const previewStartIso = getDefaultActivationStartDateIso();
	      const override = {
	        start_date: previewStartIso,
	        end_date: computeEndDateIso(previewStartIso, DEFAULT_ACTIVATION_WEEKS),
	      };
	      const result = compilePslSource(pslSource, { calendarOverride: override });
	      if (!result.valid) {
	        const errors = result.diagnostics
	          .filter((d) => d.severity === "error")
	          .map((d) => d.message)
          .join("\n");
        setErrorMessage(errors || "Invalid program configuration");
        setSaving(false);
        return;
      }

	      // Save to database
	      const program = await createPslProgram({
	        name: programName,
	        description: programDesc || undefined,
	        pslSource,
	        units: programUnits,
	        isActive: false,
	      });

	      router.dismissAll();
	      if (activateNow) {
	        router.replace({
	          pathname: "/programs/manage",
	          params: { activateProgramId: String(program.id) },
	        });
	      } else {
	        router.replace("/programs/manage");
	      }
	    } catch (error) {
	      console.error("Error saving program:", error);
	      setErrorMessage(error instanceof Error ? error.message : "Failed to save program");
	    } finally {
	      setSaving(false);
	    }
	  }, [programName, programDesc, programUnits, daySchedule, activateNow]);

  const configExercise = configTarget
    ? daySchedule[configTarget.day][configTarget.index]
    : null;

  return (
    <View style={styles.container} className="bg-background">
      <Stack.Screen
        options={{
          title: "Schedule",
          headerStyle: { backgroundColor: rawColors.background },
          headerTintColor: rawColors.foreground,
        }}
      />

      {/* Weekday Bar */}
      <View style={[styles.weekdayBar, { borderBottomColor: rawColors.borderLight }]}>
        {WEEKDAYS.map((wd) => {
          const isSelected = selectedDay === wd.key;
          const hasExercises = daySchedule[wd.key].length > 0;
          return (
            <Pressable
              key={wd.key}
              onPress={() => setSelectedDay(wd.key)}
              style={[
                styles.weekdayButton,
                {
                  backgroundColor: isSelected
                    ? rawColors.primary
                    : hasExercises
                    ? rawColors.primary + "20"
                    : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.weekdayText,
                  {
                    color: isSelected
                      ? rawColors.primaryForeground
                      : hasExercises
                      ? rawColors.primary
                      : rawColors.foregroundSecondary,
                  },
                ]}
              >
                {wd.short}
              </Text>
              {hasExercises && !isSelected && (
                <View style={[styles.weekdayDot, { backgroundColor: rawColors.primary }]} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Day Name */}
      <View style={styles.dayHeader}>
        <Text style={[styles.dayName, { color: rawColors.foreground }]}>
          {WEEKDAYS.find((w) => w.key === selectedDay)?.label}
        </Text>
        <Text style={[styles.exerciseCount, { color: rawColors.foregroundSecondary }]}>
          {currentDayExercises.length} exercise{currentDayExercises.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* Exercise List for Day */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {currentDayExercises.length === 0 ? (
          <View style={styles.emptyDay}>
            <MaterialCommunityIcons
              name="dumbbell"
              size={48}
              color={rawColors.foregroundMuted}
            />
            <Text style={[styles.emptyText, { color: rawColors.foregroundMuted }]}>
              No exercises for this day
            </Text>
          </View>
        ) : (
          currentDayExercises.map((ex, index) => (
            <Pressable
              key={`${ex.exerciseId}-${index}`}
              onPress={() => handleOpenConfig(selectedDay, index)}
              style={[
                styles.exerciseItem,
                { backgroundColor: rawColors.surface, borderColor: rawColors.borderLight },
              ]}
            >
              <View style={[styles.alphabetCircle, { backgroundColor: rawColors.primary }]}>
                <Text style={[styles.alphabetText, { color: rawColors.primaryForeground }]}>
                  {getAlphabetLetter(index)}
                </Text>
              </View>
              <View style={styles.exerciseItemInfo}>
                <Text
                  style={[styles.exerciseItemName, { color: rawColors.foreground }]}
                  numberOfLines={1}
                >
                  {ex.exerciseName}
                </Text>
                <Text style={[styles.exerciseItemSets, { color: rawColors.foregroundSecondary }]}>
                  {ex.sets.map((s) => {
                    let str = `${s.count}x${s.reps}`;
                    if (s.intensity && s.intensityType !== "none") {
                      const prefix =
                        s.intensityType === "percent_1rm" ? "@"
                        : s.intensityType === "rpe" ? "@RPE"
                        : s.intensityType === "rir" ? "@RIR"
                        : "@";
                      const suffix = s.intensityType === "percent_1rm" ? "%" : s.intensityType === "load" ? programUnits : "";
                      str += ` ${prefix}${s.intensity}${suffix}`;
                    }
                    return str;
                  }).join(", ")}
                </Text>
              </View>
              <Pressable
                onPress={() => handleRemoveExercise(selectedDay, index)}
                hitSlop={8}
              >
                <MaterialCommunityIcons name="close" size={20} color={rawColors.foregroundMuted} />
              </Pressable>
            </Pressable>
          ))
        )}

        {/* Add Exercise Button */}
        <Pressable
          onPress={handleOpenExercisePicker}
          style={[styles.addExerciseButton, { borderColor: rawColors.primary }]}
        >
          <MaterialCommunityIcons name="plus" size={20} color={rawColors.primary} />
          <Text style={[styles.addExerciseText, { color: rawColors.primary }]}>
            Add Exercises
          </Text>
        </Pressable>

        {/* Save Section */}
	        {totalExercises > 0 && (
	          <View style={styles.saveSection}>
	            <View style={[styles.toggleRow, { borderColor: rawColors.borderLight }]}>
	              <View style={{ flex: 1 }}>
	                <Text style={[styles.toggleTitle, { color: rawColors.foreground }]}>
	                  Activate after saving
	                </Text>
	                <Text style={[styles.toggleDesc, { color: rawColors.foregroundMuted }]}>
	                  {"You'll choose activation dates next."}
	                </Text>
	              </View>
	              <Switch
	                value={activateNow}
	                onValueChange={setActivateNow}
	                trackColor={{ false: rawColors.borderLight, true: rawColors.primary + "60" }}
	                thumbColor={activateNow ? rawColors.primary : rawColors.foregroundMuted}
	              />
	            </View>

            {errorMessage ? (
              <Text style={[styles.errorText, { color: rawColors.destructive }]}>
                {errorMessage}
              </Text>
            ) : null}

            <Pressable
              onPress={buildPslAndSave}
              disabled={saving}
              className="items-center justify-center py-4 rounded-xl border border-primary bg-primary"
              style={({ pressed }) => ({ opacity: pressed || saving ? 0.7 : 1 })}
            >
              <Text className="text-base font-semibold text-primary-foreground">
                {saving ? "Saving..." : "Save Program"}
              </Text>
            </Pressable>

            <Text style={[styles.summaryText, { color: rawColors.foregroundMuted }]}>
              {daysWithExercises} day{daysWithExercises !== 1 ? "s" : ""} / week - {totalExercises} total exercise{totalExercises !== 1 ? "s" : ""}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Exercise Config Modal */}
      <BaseModal
        visible={exerciseConfigVisible}
        onClose={() => { setExerciseConfigVisible(false); setConfigTarget(null); }}
      >
        {configExercise && (
          <ExerciseConfigEditor
            exercise={configExercise}
            units={programUnits}
            rawColors={rawColors}
            onSave={handleUpdateExerciseConfig}
          />
        )}
      </BaseModal>
    </View>
  );
}

// Inline Exercise Config Editor

interface ExerciseConfigEditorProps {
  exercise: DayExercise;
  units: "kg" | "lb";
  rawColors: any;
  onSave: (sets: ExerciseSetConfig[]) => void;
}

function ExerciseConfigEditor({ exercise, units, rawColors, onSave }: ExerciseConfigEditorProps) {
  const [sets, setSets] = useState<ExerciseSetConfig[]>(exercise.sets);

  const handleUpdateSet = (index: number, field: keyof ExerciseSetConfig, value: any) => {
    setSets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddSet = () => {
    setSets((prev) => [
      ...prev,
      { count: 3, reps: "5", intensity: "", intensityType: "none", role: "work", progression: "" },
    ]);
  };

  const handleRemoveSet = (index: number) => {
    if (sets.length <= 1) return;
    setSets((prev) => prev.filter((_, i) => i !== index));
  };

  const INTENSITY_TYPES: { key: ExerciseSetConfig["intensityType"]; label: string }[] = [
    { key: "none", label: "None" },
    { key: "percent_1rm", label: "% 1RM" },
    { key: "rpe", label: "RPE" },
    { key: "rir", label: "RIR" },
    { key: "load", label: units },
  ];

  const ROLES: { key: string; label: string }[] = [
    { key: "work", label: "Work" },
    { key: "warmup", label: "Warmup" },
    { key: "top", label: "Top" },
    { key: "backoff", label: "Backoff" },
  ];

  return (
    <ScrollView style={configStyles.container}>
      <Text style={[configStyles.title, { color: rawColors.foreground }]}>
        {exercise.exerciseName}
      </Text>

      {sets.map((set, index) => (
        <View key={index} style={[configStyles.setCard, { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight }]}>
          <View style={configStyles.setHeader}>
            <Text style={[configStyles.setLabel, { color: rawColors.foregroundSecondary }]}>
              Set Group {index + 1}
            </Text>
            {sets.length > 1 && (
              <Pressable onPress={() => handleRemoveSet(index)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={18} color={rawColors.foregroundMuted} />
              </Pressable>
            )}
          </View>

          <View style={configStyles.row}>
            <View style={configStyles.fieldSmall}>
              <Text style={[configStyles.fieldLabel, { color: rawColors.foregroundSecondary }]}>Sets</Text>
              <TextInput
                style={[configStyles.fieldInput, { backgroundColor: rawColors.surface, borderColor: rawColors.borderLight, color: rawColors.foreground }]}
                value={String(set.count)}
                onChangeText={(v) => handleUpdateSet(index, "count", parseInt(v) || 1)}
                keyboardType="number-pad"
              />
            </View>
            <View style={configStyles.fieldSmall}>
              <Text style={[configStyles.fieldLabel, { color: rawColors.foregroundSecondary }]}>Reps</Text>
              <TextInput
                style={[configStyles.fieldInput, { backgroundColor: rawColors.surface, borderColor: rawColors.borderLight, color: rawColors.foreground }]}
                value={set.reps}
                onChangeText={(v) => handleUpdateSet(index, "reps", v)}
                placeholder="5 or 8-12"
                placeholderTextColor={rawColors.foregroundMuted}
              />
            </View>
          </View>

          {/* Intensity Type */}
          <Text style={[configStyles.fieldLabel, { color: rawColors.foregroundSecondary, marginTop: 8 }]}>Intensity</Text>
          <View style={configStyles.chipRow}>
            {INTENSITY_TYPES.map((it) => (
              <Pressable
                key={it.key}
                onPress={() => handleUpdateSet(index, "intensityType", it.key)}
                style={[
                  configStyles.chip,
                  {
                    backgroundColor: set.intensityType === it.key ? rawColors.primary : rawColors.surface,
                    borderColor: set.intensityType === it.key ? rawColors.primary : rawColors.borderLight,
                  },
                ]}
              >
                <Text
                  style={[
                    configStyles.chipText,
                    { color: set.intensityType === it.key ? rawColors.primaryForeground : rawColors.foreground },
                  ]}
                >
                  {it.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {set.intensityType !== "none" && (
            <TextInput
              style={[configStyles.fieldInput, { backgroundColor: rawColors.surface, borderColor: rawColors.borderLight, color: rawColors.foreground, marginTop: 8 }]}
              value={set.intensity}
              onChangeText={(v) => handleUpdateSet(index, "intensity", v)}
              placeholder={
                set.intensityType === "percent_1rm" ? "e.g. 75"
                : set.intensityType === "rpe" ? "e.g. 8"
                : set.intensityType === "rir" ? "e.g. 2"
                : `e.g. 100`
              }
              placeholderTextColor={rawColors.foregroundMuted}
              keyboardType="decimal-pad"
            />
          )}

          {/* Role */}
          <Text style={[configStyles.fieldLabel, { color: rawColors.foregroundSecondary, marginTop: 8 }]}>Role</Text>
          <View style={configStyles.chipRow}>
            {ROLES.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => handleUpdateSet(index, "role", r.key)}
                style={[
                  configStyles.chip,
                  {
                    backgroundColor: set.role === r.key ? rawColors.primary : rawColors.surface,
                    borderColor: set.role === r.key ? rawColors.primary : rawColors.borderLight,
                  },
                ]}
              >
                <Text
                  style={[
                    configStyles.chipText,
                    { color: set.role === r.key ? rawColors.primaryForeground : rawColors.foreground },
                  ]}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Progression */}
          <Text style={[configStyles.fieldLabel, { color: rawColors.foregroundSecondary, marginTop: 8 }]}>
            Progression ({units}/session)
          </Text>
          <TextInput
            style={[configStyles.fieldInput, { backgroundColor: rawColors.surface, borderColor: rawColors.borderLight, color: rawColors.foreground }]}
            value={set.progression}
            onChangeText={(v) => handleUpdateSet(index, "progression", v)}
            placeholder="e.g. 2.5 (leave empty for none)"
            placeholderTextColor={rawColors.foregroundMuted}
            keyboardType="decimal-pad"
          />
        </View>
      ))}

      <Pressable
        onPress={handleAddSet}
        style={[configStyles.addSetGroupBtn, { borderColor: rawColors.primary }]}
      >
        <MaterialCommunityIcons name="plus" size={18} color={rawColors.primary} />
        <Text style={[configStyles.addSetGroupText, { color: rawColors.primary }]}>
          Add Set Group
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onSave(sets)}
        style={[configStyles.saveBtn, { backgroundColor: rawColors.primary }]}
      >
        <Text style={[configStyles.saveBtnText, { color: rawColors.primaryForeground }]}>
          Save Configuration
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const configStyles = StyleSheet.create({
  container: { maxHeight: 500 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  setCard: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
  setHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  setLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
  row: { flexDirection: "row", gap: 10 },
  fieldSmall: { flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: "500", marginBottom: 4 },
  fieldInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, fontWeight: "600" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: "600" },
  addSetGroupBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", marginBottom: 16, gap: 6 },
  addSetGroupText: { fontSize: 14, fontWeight: "600" },
  saveBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginBottom: 16 },
  saveBtnText: { fontSize: 15, fontWeight: "700" },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  weekdayBar: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  weekdayButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
  },
  weekdayText: {
    fontSize: 14,
    fontWeight: "700",
  },
  weekdayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
  dayHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dayName: {
    fontSize: 18,
    fontWeight: "700",
  },
  exerciseCount: {
    fontSize: 13,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  emptyDay: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
  exerciseItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  alphabetCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  alphabetText: {
    fontSize: 14,
    fontWeight: "600",
  },
  exerciseItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  exerciseItemName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  exerciseItemSets: {
    fontSize: 13,
  },
  addExerciseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    marginTop: 4,
    marginBottom: 20,
    gap: 6,
  },
  addExerciseText: {
    fontSize: 15,
    fontWeight: "600",
  },
  saveSection: {
    marginTop: 16,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    marginBottom: 12,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  toggleDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  errorText: {
    fontSize: 13,
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
  },
});
