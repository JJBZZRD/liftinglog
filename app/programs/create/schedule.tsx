import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Weekday } from "program-specification-language";
import BaseModal from "../../../components/modals/BaseModal";
import {
  createPslProgram,
  getPslProgramById,
  updatePslProgram,
  type PslProgramRow,
} from "../../../lib/db/pslPrograms";
import {
  deleteCalendarForProgram,
  insertCalendarEntries,
} from "../../../lib/db/programCalendar";
import {
  computeEndDateIso,
  dateToIsoLocal,
  DEFAULT_ACTIVATION_WEEKS,
  getDefaultActivationStartDateIso,
  isoToDateLocal,
} from "../../../lib/programs/psl/activationDates";
import { getPslCompatibilityWarnings } from "../../../lib/programs/psl/pslCompatibility";
import { deserializeFlatProgramDraftFromPsl } from "../../../lib/programs/psl/pslDraftMapper";
import {
  createDefaultFlatProgramDraft,
  createDefaultSessionDraft,
  serializeFlatProgramDraftToPsl,
  type ExerciseConfig,
  type FlatProgramDraft,
  type FlatProgramTimingMode,
  type SetConfig,
  type SessionDraft,
} from "../../../lib/programs/psl/pslGenerator";
import { introspectPslSource } from "../../../lib/programs/psl/pslIntrospection";
import {
  compilePslSource,
  extractCalendarEntries,
} from "../../../lib/programs/psl/pslService";
import { useTheme } from "../../../lib/theme/ThemeContext";

const WEEKDAY_OPTIONS: { key: Weekday; short: string; label: string }[] = [
  { key: "MON", short: "M", label: "Monday" },
  { key: "TUE", short: "T", label: "Tuesday" },
  { key: "WED", short: "W", label: "Wednesday" },
  { key: "THU", short: "T", label: "Thursday" },
  { key: "FRI", short: "F", label: "Friday" },
  { key: "SAT", short: "S", label: "Saturday" },
  { key: "SUN", short: "S", label: "Sunday" },
];

const TIMING_MODE_META: Record<
  FlatProgramTimingMode,
  { title: string; description: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  sequence: {
    title: "Ordered split / sequence",
    description: "Define the session order and required rest between program days.",
    icon: "playlist-play",
  },
  weekdays: {
    title: "Weekdays",
    description: "Assign each session to one or more weekdays.",
    icon: "calendar-week",
  },
  fixed_day: {
    title: "Fixed program days",
    description: "Anchor sessions to numbered program days instead of weekdays.",
    icon: "calendar-range",
  },
  interval_days: {
    title: "Every N days",
    description: "Repeat sessions on an interval with optional offsets.",
    icon: "calendar-refresh",
  },
};

type EditableSetConfig = {
  count: string;
  reps: string;
  intensityType: "none" | "percent_1rm" | "rpe" | "rir" | "load";
  intensityValue: string;
  role: string;
  progression: string;
};

function normalizeTimingMode(value: string | undefined): FlatProgramTimingMode {
  if (
    value === "sequence" ||
    value === "weekdays" ||
    value === "fixed_day" ||
    value === "interval_days"
  ) {
    return value;
  }
  return "sequence";
}

function derivePreviewWeeks(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return DEFAULT_ACTIVATION_WEEKS;
  const startUtc = new Date(`${startDate}T00:00:00Z`);
  const endUtc = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(startUtc.getTime()) || Number.isNaN(endUtc.getTime())) {
    return DEFAULT_ACTIVATION_WEEKS;
  }
  const diffDays = Math.floor((endUtc.getTime() - startUtc.getTime()) / 86400000) + 1;
  if (diffDays < 1) return DEFAULT_ACTIVATION_WEEKS;
  return Math.max(1, Math.ceil(diffDays / 7));
}

function defaultExerciseSets(): SetConfig[] {
  return [{ count: 3, reps: 5 }];
}

function createExerciseDraft(exerciseId: number, exerciseName: string): ExerciseConfig {
  return {
    exerciseId,
    exerciseName,
    sets: defaultExerciseSets(),
  };
}

function getAlphabetLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

function formatReps(reps: SetConfig["reps"]): string {
  if (typeof reps === "number") return String(reps);
  return `${reps.min}-${reps.max}`;
}

function getIntensityDisplay(set: SetConfig): string {
  if (!set.intensity) return "";
  switch (set.intensity.type) {
    case "percent_1rm":
      return ` @${set.intensity.value}%`;
    case "rpe":
      return ` @RPE${set.intensity.value}`;
    case "rir":
      return ` @RIR${set.intensity.value}`;
    case "load":
      return ` @${set.intensity.value}${set.intensity.unit}`;
    default:
      return "";
  }
}

function formatSetSummary(set: SetConfig): string {
  const parts = [`${set.count}x${formatReps(set.reps)}${getIntensityDisplay(set)}`];
  if (set.role) {
    parts.push(`role ${set.role}`);
  }
  if (set.progression?.by) {
    const sign = set.progression.by >= 0 ? "+" : "";
    parts.push(`${sign}${set.progression.by}${set.progression.unit}`);
  }
  return parts.join(" ");
}

function parseRepsInput(value: string): SetConfig["reps"] {
  const trimmed = value.trim();
  const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    return { min: Math.max(1, min), max: Math.max(min, max) };
  }
  const count = Number.parseInt(trimmed, 10);
  return Number.isFinite(count) && count > 0 ? count : 5;
}

function editableSetFromConfig(set: SetConfig): EditableSetConfig {
  let intensityType: EditableSetConfig["intensityType"] = "none";
  let intensityValue = "";

  if (set.intensity) {
    switch (set.intensity.type) {
      case "percent_1rm":
        intensityType = "percent_1rm";
        intensityValue = String(set.intensity.value);
        break;
      case "rpe":
        intensityType = "rpe";
        intensityValue = String(set.intensity.value);
        break;
      case "rir":
        intensityType = "rir";
        intensityValue = String(set.intensity.value);
        break;
      case "load":
        intensityType = "load";
        intensityValue = String(set.intensity.value);
        break;
    }
  }

  return {
    count: String(set.count),
    reps: formatReps(set.reps),
    intensityType,
    intensityValue,
    role: set.role ?? "work",
    progression: set.progression?.by ? String(set.progression.by) : "",
  };
}

function setConfigFromEditable(editable: EditableSetConfig, units: "kg" | "lb"): SetConfig {
  const count = Number.parseInt(editable.count, 10);
  const set: SetConfig = {
    count: Number.isFinite(count) && count > 0 ? count : 1,
    reps: parseRepsInput(editable.reps),
  };

  if (editable.role && editable.role !== "work") {
    set.role = editable.role;
  }

  const intensityValue = Number.parseFloat(editable.intensityValue);
  if (editable.intensityType !== "none" && Number.isFinite(intensityValue)) {
    if (editable.intensityType === "percent_1rm") {
      set.intensity = { type: "percent_1rm", value: intensityValue };
    } else if (editable.intensityType === "rpe") {
      set.intensity = { type: "rpe", value: intensityValue };
    } else if (editable.intensityType === "rir") {
      set.intensity = { type: "rir", value: intensityValue };
    } else {
      set.intensity = { type: "load", value: intensityValue, unit: units };
    }
  }

  const progression = Number.parseFloat(editable.progression);
  if (Number.isFinite(progression) && progression !== 0) {
    set.progression = {
      type: "increment",
      by: progression,
      unit: units,
      cadence: "every session",
      condition: "if success",
    };
  }

  return set;
}

function sequenceRestLabel(index: number, total: number, repeats: boolean): string {
  if (repeats || index < total - 1) return "Rest after (days)";
  return "Rest after (not used)";
}

interface SessionCardProps {
  session: SessionDraft;
  index: number;
  total: number;
  timingMode: FlatProgramTimingMode;
  sequenceRepeat: boolean;
  units: "kg" | "lb";
  rawColors: ReturnType<typeof useTheme>["rawColors"];
  onNameChange: (value: string) => void;
  onUpdate: (patch: Partial<SessionDraft>) => void;
  onToggleWeekday: (day: Weekday) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onOpenExercisePicker: () => void;
  onOpenExerciseConfig: (exerciseIndex: number) => void;
  onRemoveExercise: (exerciseIndex: number) => void;
}

function SessionCard({
  session,
  index,
  total,
  timingMode,
  sequenceRepeat,
  units,
  rawColors,
  onNameChange,
  onUpdate,
  onToggleWeekday,
  onMove,
  onRemove,
  onOpenExercisePicker,
  onOpenExerciseConfig,
  onRemoveExercise,
}: SessionCardProps) {
  return (
    <View
      style={[
        styles.sessionCard,
        { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight },
      ]}
    >
      <View style={styles.sessionCardHeader}>
        <View style={styles.sessionCardHeaderLeft}>
          <View style={[styles.orderBadge, { backgroundColor: rawColors.primary + "20" }]}>
            <Text style={[styles.orderBadgeText, { color: rawColors.primary }]}>
              {index + 1}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sessionLabel, { color: rawColors.foregroundSecondary }]}>
              Session
            </Text>
            <TextInput
              value={session.name}
              onChangeText={onNameChange}
              placeholder={`Session ${getAlphabetLetter(index)}`}
              placeholderTextColor={rawColors.foregroundMuted}
              style={[
                styles.sessionNameInput,
                {
                  backgroundColor: rawColors.surface,
                  borderColor: rawColors.borderLight,
                  color: rawColors.foreground,
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.sessionCardHeaderActions}>
          {timingMode === "sequence" ? (
            <>
              <Pressable
                onPress={() => onMove(-1)}
                hitSlop={8}
                disabled={index === 0}
                style={{ opacity: index === 0 ? 0.35 : 1 }}
              >
                <MaterialCommunityIcons
                  name="arrow-up"
                  size={20}
                  color={rawColors.foregroundSecondary}
                />
              </Pressable>
              <Pressable
                onPress={() => onMove(1)}
                hitSlop={8}
                disabled={index === total - 1}
                style={{ opacity: index === total - 1 ? 0.35 : 1 }}
              >
                <MaterialCommunityIcons
                  name="arrow-down"
                  size={20}
                  color={rawColors.foregroundSecondary}
                />
              </Pressable>
            </>
          ) : null}
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            disabled={total <= 1}
            style={{ opacity: total <= 1 ? 0.35 : 1 }}
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={20}
              color={rawColors.foregroundSecondary}
            />
          </Pressable>
        </View>
      </View>

      {timingMode === "sequence" ? (
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
            {sequenceRestLabel(index, total, sequenceRepeat)}
          </Text>
          <TextInput
            value={String(session.restAfterDays)}
            onChangeText={(value) =>
              onUpdate({ restAfterDays: Math.max(0, Number.parseInt(value, 10) || 0) })
            }
            editable={sequenceRepeat || index < total - 1}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={rawColors.foregroundMuted}
            style={[
              styles.input,
              {
                backgroundColor: rawColors.surface,
                borderColor: rawColors.borderLight,
                color: rawColors.foreground,
                opacity: sequenceRepeat || index < total - 1 ? 1 : 0.65,
              },
            ]}
          />
        </View>
      ) : null}

      {timingMode === "weekdays" ? (
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
            Weekdays
          </Text>
          <View style={styles.weekdayChipRow}>
            {WEEKDAY_OPTIONS.map((day) => {
              const selected = session.weekdays.includes(day.key);
              return (
                <Pressable
                  key={day.key}
                  onPress={() => onToggleWeekday(day.key)}
                  style={[
                    styles.weekdayChip,
                    {
                      backgroundColor: selected ? rawColors.primary : rawColors.surface,
                      borderColor: selected ? rawColors.primary : rawColors.borderLight,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.weekdayChipText,
                      {
                        color: selected
                          ? rawColors.primaryForeground
                          : rawColors.foregroundSecondary,
                      },
                    ]}
                  >
                    {day.short}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {timingMode === "fixed_day" ? (
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
            Program day
          </Text>
          <TextInput
            value={String(session.fixedDay)}
            onChangeText={(value) =>
              onUpdate({ fixedDay: Math.max(1, Number.parseInt(value, 10) || 1) })
            }
            keyboardType="number-pad"
            placeholder="1"
            placeholderTextColor={rawColors.foregroundMuted}
            style={[
              styles.input,
              {
                backgroundColor: rawColors.surface,
                borderColor: rawColors.borderLight,
                color: rawColors.foreground,
              },
            ]}
          />
        </View>
      ) : null}

      {timingMode === "interval_days" ? (
        <View style={styles.intervalRow}>
          <View style={styles.intervalField}>
            <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
              Every
            </Text>
            <TextInput
              value={String(session.intervalEvery)}
              onChangeText={(value) =>
                onUpdate({ intervalEvery: Math.max(1, Number.parseInt(value, 10) || 1) })
              }
              keyboardType="number-pad"
              placeholder="2"
              placeholderTextColor={rawColors.foregroundMuted}
              style={[
                styles.input,
                {
                  backgroundColor: rawColors.surface,
                  borderColor: rawColors.borderLight,
                  color: rawColors.foreground,
                },
              ]}
            />
          </View>
          <View style={styles.intervalField}>
            <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
              Start offset
            </Text>
            <TextInput
              value={String(session.intervalStartOffsetDays)}
              onChangeText={(value) =>
                onUpdate({
                  intervalStartOffsetDays: Math.max(0, Number.parseInt(value, 10) || 0),
                })
              }
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={rawColors.foregroundMuted}
              style={[
                styles.input,
                {
                  backgroundColor: rawColors.surface,
                  borderColor: rawColors.borderLight,
                  color: rawColors.foreground,
                },
              ]}
            />
          </View>
          <View style={styles.intervalField}>
            <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
              End offset
            </Text>
            <TextInput
              value={
                session.intervalEndOffsetDays === null
                  ? ""
                  : String(session.intervalEndOffsetDays)
              }
              onChangeText={(value) =>
                onUpdate({
                  intervalEndOffsetDays:
                    value.trim() === ""
                      ? null
                      : Math.max(0, Number.parseInt(value, 10) || 0),
                })
              }
              keyboardType="number-pad"
              placeholder="Optional"
              placeholderTextColor={rawColors.foregroundMuted}
              style={[
                styles.input,
                {
                  backgroundColor: rawColors.surface,
                  borderColor: rawColors.borderLight,
                  color: rawColors.foreground,
                },
              ]}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.exerciseSectionHeader}>
        <Text style={[styles.exerciseSectionTitle, { color: rawColors.foreground }]}>
          Exercises
        </Text>
        <Text style={[styles.exerciseSectionCount, { color: rawColors.foregroundMuted }]}>
          {session.exercises.length} item{session.exercises.length === 1 ? "" : "s"}
        </Text>
      </View>

      {session.exercises.length === 0 ? (
        <Text style={[styles.emptyExerciseText, { color: rawColors.foregroundMuted }]}>
          Add exercises to define this session.
        </Text>
      ) : (
        session.exercises.map((exercise, exerciseIndex) => (
          <Pressable
            key={`${exercise.exerciseId}-${exerciseIndex}`}
            onPress={() => onOpenExerciseConfig(exerciseIndex)}
            style={[
              styles.exerciseRow,
              { backgroundColor: rawColors.surface, borderColor: rawColors.borderLight },
            ]}
          >
            <View style={[styles.exerciseBadge, { backgroundColor: rawColors.primary }]}>
              <Text style={[styles.exerciseBadgeText, { color: rawColors.primaryForeground }]}>
                {getAlphabetLetter(exerciseIndex)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.exerciseName, { color: rawColors.foreground }]}
                numberOfLines={1}
              >
                {exercise.exerciseName}
              </Text>
              <Text
                style={[styles.exerciseSummary, { color: rawColors.foregroundSecondary }]}
                numberOfLines={2}
              >
                {exercise.sets.map(formatSetSummary).join(", ") || `3x5 ${units}`}
              </Text>
            </View>
            <Pressable onPress={() => onRemoveExercise(exerciseIndex)} hitSlop={8}>
              <MaterialCommunityIcons name="close" size={20} color={rawColors.foregroundMuted} />
            </Pressable>
          </Pressable>
        ))
      )}

      <Pressable
        onPress={onOpenExercisePicker}
        style={[styles.addExerciseButton, { borderColor: rawColors.primary }]}
      >
        <MaterialCommunityIcons name="plus" size={18} color={rawColors.primary} />
        <Text style={[styles.addExerciseButtonText, { color: rawColors.primary }]}>
          Add exercises
        </Text>
      </Pressable>
    </View>
  );
}

interface ExerciseConfigEditorProps {
  exercise: ExerciseConfig;
  units: "kg" | "lb";
  rawColors: ReturnType<typeof useTheme>["rawColors"];
  onSave: (exercise: ExerciseConfig) => void;
}

function ExerciseConfigEditor({
  exercise,
  units,
  rawColors,
  onSave,
}: ExerciseConfigEditorProps) {
  const [sets, setSets] = useState<EditableSetConfig[]>(
    exercise.sets.length > 0
      ? exercise.sets.map(editableSetFromConfig)
      : [editableSetFromConfig(defaultExerciseSets()[0])]
  );

  const handleSetChange = useCallback(
    (index: number, patch: Partial<EditableSetConfig>) => {
      setSets((prev) =>
        prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
      );
    },
    []
  );

  const handleAddSet = useCallback(() => {
    setSets((prev) => [
      ...prev,
      {
        count: "3",
        reps: "5",
        intensityType: "none",
        intensityValue: "",
        role: "work",
        progression: "",
      },
    ]);
  }, []);

  const handleRemoveSet = useCallback((index: number) => {
    setSets((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)
    );
  }, []);

  const handleSave = useCallback(() => {
    onSave({
      ...exercise,
      sets: sets.map((set) => setConfigFromEditable(set, units)),
    });
  }, [exercise, onSave, sets, units]);

  return (
    <ScrollView style={{ maxHeight: 540 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.modalTitle, { color: rawColors.foreground }]}>
        {exercise.exerciseName}
      </Text>

      {sets.map((set, index) => (
        <View
          key={index}
          style={[
            styles.setCard,
            { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight },
          ]}
        >
          <View style={styles.setCardHeader}>
            <Text style={[styles.setCardTitle, { color: rawColors.foregroundSecondary }]}>
              Set group {index + 1}
            </Text>
            {sets.length > 1 ? (
              <Pressable onPress={() => handleRemoveSet(index)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={18} color={rawColors.foregroundMuted} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.setRow}>
            <View style={styles.setFieldSmall}>
              <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
                Sets
              </Text>
              <TextInput
                value={set.count}
                onChangeText={(value) => handleSetChange(index, { count: value })}
                keyboardType="number-pad"
                style={[
                  styles.input,
                  {
                    backgroundColor: rawColors.surface,
                    borderColor: rawColors.borderLight,
                    color: rawColors.foreground,
                  },
                ]}
              />
            </View>

            <View style={styles.setFieldSmall}>
              <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
                Reps
              </Text>
              <TextInput
                value={set.reps}
                onChangeText={(value) => handleSetChange(index, { reps: value })}
                placeholder="5 or 8-12"
                placeholderTextColor={rawColors.foregroundMuted}
                style={[
                  styles.input,
                  {
                    backgroundColor: rawColors.surface,
                    borderColor: rawColors.borderLight,
                    color: rawColors.foreground,
                  },
                ]}
              />
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary, marginTop: 10 }]}>
            Intensity
          </Text>
          <View style={styles.filterRow}>
            {[
              { key: "none", label: "None" },
              { key: "percent_1rm", label: "%1RM" },
              { key: "rpe", label: "RPE" },
              { key: "rir", label: "RIR" },
              { key: "load", label: units.toUpperCase() },
            ].map((option) => {
              const selected = set.intensityType === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() =>
                    handleSetChange(index, {
                      intensityType: option.key as EditableSetConfig["intensityType"],
                      intensityValue: option.key === "none" ? "" : set.intensityValue,
                    })
                  }
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: selected ? rawColors.primary : rawColors.surface,
                      borderColor: selected ? rawColors.primary : rawColors.borderLight,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      {
                        color: selected
                          ? rawColors.primaryForeground
                          : rawColors.foregroundSecondary,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {set.intensityType !== "none" ? (
            <TextInput
              value={set.intensityValue}
              onChangeText={(value) => handleSetChange(index, { intensityValue: value })}
              keyboardType="decimal-pad"
              placeholder={
                set.intensityType === "percent_1rm"
                  ? "75"
                  : set.intensityType === "rpe"
                    ? "8"
                    : set.intensityType === "rir"
                      ? "2"
                      : "100"
              }
              placeholderTextColor={rawColors.foregroundMuted}
              style={[
                styles.input,
                {
                  backgroundColor: rawColors.surface,
                  borderColor: rawColors.borderLight,
                  color: rawColors.foreground,
                  marginTop: 8,
                },
              ]}
            />
          ) : null}

          <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary, marginTop: 10 }]}>
            Role
          </Text>
          <View style={styles.filterRow}>
            {[
              { key: "work", label: "Work" },
              { key: "warmup", label: "Warmup" },
              { key: "top", label: "Top" },
              { key: "backoff", label: "Backoff" },
            ].map((option) => {
              const selected = set.role === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => handleSetChange(index, { role: option.key })}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: selected ? rawColors.primary : rawColors.surface,
                      borderColor: selected ? rawColors.primary : rawColors.borderLight,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      {
                        color: selected
                          ? rawColors.primaryForeground
                          : rawColors.foregroundSecondary,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary, marginTop: 10 }]}>
            Progression ({units}/session)
          </Text>
          <TextInput
            value={set.progression}
            onChangeText={(value) => handleSetChange(index, { progression: value })}
            keyboardType="decimal-pad"
            placeholder="2.5"
            placeholderTextColor={rawColors.foregroundMuted}
            style={[
              styles.input,
              {
                backgroundColor: rawColors.surface,
                borderColor: rawColors.borderLight,
                color: rawColors.foreground,
              },
            ]}
          />
        </View>
      ))}

      <Pressable
        onPress={handleAddSet}
        style={[styles.secondaryAction, { borderColor: rawColors.primary }]}
      >
        <MaterialCommunityIcons name="plus" size={18} color={rawColors.primary} />
        <Text style={[styles.secondaryActionText, { color: rawColors.primary }]}>
          Add set group
        </Text>
      </Pressable>

      <Pressable
        onPress={handleSave}
        style={[styles.primaryModalAction, { backgroundColor: rawColors.primary }]}
      >
        <Text style={[styles.primaryModalActionText, { color: rawColors.primaryForeground }]}>
          Save exercise config
        </Text>
      </Pressable>
    </ScrollView>
  );
}

export default function ProgramScheduleScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{
    name?: string;
    description?: string;
    units?: string;
    timingMode?: string;
    editProgramId?: string;
  }>();

  const timingMode = normalizeTimingMode(
    typeof params.timingMode === "string" ? params.timingMode : undefined
  );
  const units = params.units === "lb" ? "lb" : "kg";
  const editProgramId =
    typeof params.editProgramId === "string" ? Number.parseInt(params.editProgramId, 10) : null;
  const isEditing = Number.isFinite(editProgramId);
  const requestedName = typeof params.name === "string" ? params.name : undefined;
  const requestedDescription =
    typeof params.description === "string" ? params.description : undefined;

  const [draft, setDraft] = useState<FlatProgramDraft>(() =>
    createDefaultFlatProgramDraft(timingMode, {
      name: requestedName,
      description: requestedDescription,
      units,
    })
  );
  const [editingProgram, setEditingProgram] = useState<PslProgramRow | null>(null);
  const [loadingProgram, setLoadingProgram] = useState(isEditing);
  const [exerciseConfigVisible, setExerciseConfigVisible] = useState(false);
  const [configTarget, setConfigTarget] = useState<{
    sessionClientId: string;
    exerciseIndex: number;
  } | null>(null);
  const [previewStartDate, setPreviewStartDate] = useState<Date>(
    isoToDateLocal(getDefaultActivationStartDateIso())
  );
  const [previewWeeks, setPreviewWeeks] = useState(DEFAULT_ACTIVATION_WEEKS);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!isEditing || editProgramId === null) {
      setEditingProgram(null);
      setLoadingProgram(false);
      setDraft(
        createDefaultFlatProgramDraft(timingMode, {
          name: requestedName,
          description: requestedDescription,
          units,
        })
      );
      return;
    }

    let isCancelled = false;

    async function loadProgram() {
      setLoadingProgram(true);
      try {
        const program = await getPslProgramById(editProgramId);
        if (isCancelled) return;
        if (!program) {
          setSaveError("Program not found.");
          setLoadingProgram(false);
          return;
        }

        const existingDraft = deserializeFlatProgramDraftFromPsl(program.pslSource);
        if (!existingDraft) {
          router.replace({
            pathname: "/programs/create/editor",
            params: { editProgramId: String(program.id) },
          });
          return;
        }

        setEditingProgram(program);
        setDraft(
          existingDraft.timingMode === timingMode
            ? {
                ...existingDraft,
                name: requestedName?.trim() || existingDraft.name,
                description: requestedDescription?.trim() || existingDraft.description,
                units,
              }
            : createDefaultFlatProgramDraft(timingMode, {
                name: requestedName?.trim() || existingDraft.name,
                description: requestedDescription?.trim() || existingDraft.description,
                units,
              })
        );
        setPreviewStartDate(
          isoToDateLocal(program.startDate ?? getDefaultActivationStartDateIso())
        );
        setPreviewWeeks(derivePreviewWeeks(program.startDate, program.endDate));
        setSaveError("");
      } catch (error) {
        if (!isCancelled) {
          setSaveError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!isCancelled) {
          setLoadingProgram(false);
        }
      }
    }

    loadProgram();
    return () => {
      isCancelled = true;
    };
  }, [editProgramId, isEditing, requestedDescription, requestedName, timingMode, units]);

  useEffect(() => {
    (
      globalThis as {
        __exercisePickerCallback?: (
          exercises: { id: number; name: string }[],
          targetId: string
        ) => void;
      }
    ).__exercisePickerCallback = (exercises, targetId) => {
      setDraft((prev) => ({
        ...prev,
        sessions: prev.sessions.map((session) =>
          session.clientId === targetId
            ? {
                ...session,
                exercises: [
                  ...session.exercises,
                  ...exercises.map((exercise) =>
                    createExerciseDraft(exercise.id, exercise.name)
                  ),
                ],
              }
            : session
        ),
      }));
    };

    return () => {
      delete (globalThis as { __exercisePickerCallback?: unknown })
        .__exercisePickerCallback;
    };
  }, []);

  const pslSource = useMemo(() => serializeFlatProgramDraftToPsl(draft), [draft]);
  const activationInfo = useMemo(() => introspectPslSource(pslSource), [pslSource]);
  const requiresHorizonWeeks = activationInfo.ok
    ? activationInfo.requiresEndDateForActivation
    : true;
  const previewStartIso = useMemo(() => dateToIsoLocal(previewStartDate), [previewStartDate]);
  const previewOverride = useMemo(() => {
    if (!activationInfo.ok) return null;
    if (activationInfo.requiresEndDateForActivation) {
      return {
        start_date: previewStartIso,
        end_date: computeEndDateIso(previewStartIso, previewWeeks),
      };
    }
    return { start_date: previewStartIso };
  }, [activationInfo, previewStartIso, previewWeeks]);
  const compileResult = useMemo(
    () =>
      compilePslSource(pslSource, previewOverride ? { calendarOverride: previewOverride } : {}),
    [previewOverride, pslSource]
  );
  const diagnostics = useMemo(() => compileResult.diagnostics ?? [], [compileResult.diagnostics]);
  const errorDiagnostics = useMemo(
    () => diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [diagnostics]
  );
  const compatibilityWarnings = useMemo(() => {
    if (!compileResult.ast) return [];
    return getPslCompatibilityWarnings(compileResult.ast);
  }, [compileResult.ast]);

  const previewDerivedEndIso = useMemo(() => {
    if (!activationInfo.ok || !activationInfo.requiresEndDateForActivation) return null;
    return computeEndDateIso(previewStartIso, previewWeeks);
  }, [activationInfo, previewStartIso, previewWeeks]);

  const sessionsPreview = useMemo(() => {
    if (!compileResult.compiled) return [];
    return compileResult.compiled.sessions.slice(0, 6).map((session) => ({
      id: session.id,
      name: session.name,
      exerciseCount: session.exercises.length,
    }));
  }, [compileResult.compiled]);

  const materializedPreview = useMemo(() => {
    if (!compileResult.materialized) return [];
    return compileResult.materialized.slice(0, 10).map((session) => ({
      id: session.id,
      name: session.name,
      dateIso: session.date_iso ?? "",
    }));
  }, [compileResult.materialized]);

  const totalExercises = useMemo(
    () => draft.sessions.reduce((sum, session) => sum + session.exercises.length, 0),
    [draft.sessions]
  );

  const configExercise = useMemo(() => {
    if (!configTarget) return null;
    const session = draft.sessions.find((item) => item.clientId === configTarget.sessionClientId);
    if (!session) return null;
    return session.exercises[configTarget.exerciseIndex] ?? null;
  }, [configTarget, draft.sessions]);

  const updateSession = useCallback((sessionClientId: string, patch: Partial<SessionDraft>) => {
    setDraft((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) =>
        session.clientId === sessionClientId ? { ...session, ...patch } : session
      ),
    }));
  }, []);

  const toggleWeekday = useCallback((sessionClientId: string, day: Weekday) => {
    setDraft((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) => {
        if (session.clientId !== sessionClientId) return session;
        const selected = session.weekdays.includes(day);
        return {
          ...session,
          weekdays: selected
            ? session.weekdays.filter((value) => value !== day)
            : [...session.weekdays, day],
        };
      }),
    }));
  }, []);

  const moveSession = useCallback((sessionClientId: string, direction: -1 | 1) => {
    setDraft((prev) => {
      const index = prev.sessions.findIndex((session) => session.clientId === sessionClientId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.sessions.length) {
        return prev;
      }

      const sessions = [...prev.sessions];
      const [session] = sessions.splice(index, 1);
      sessions.splice(nextIndex, 0, session);
      return { ...prev, sessions };
    });
  }, []);

  const addSession = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      sessions: [...prev.sessions, createDefaultSessionDraft(prev.timingMode, prev.sessions.length)],
    }));
  }, []);

  const removeSession = useCallback((sessionClientId: string) => {
    setDraft((prev) => {
      if (prev.sessions.length <= 1) return prev;
      return {
        ...prev,
        sessions: prev.sessions.filter((session) => session.clientId !== sessionClientId),
      };
    });
  }, []);

  const openExercisePicker = useCallback((session: SessionDraft) => {
    const existingIds = session.exercises.map((exercise) => exercise.exerciseId).join(",");
    router.push({
      pathname: "/programs/create/exercise-picker",
      params: {
        targetId: session.clientId,
        targetLabel: session.name || "Session",
        existingIds,
      },
    });
  }, []);

  const removeExercise = useCallback((sessionClientId: string, exerciseIndex: number) => {
    setDraft((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) =>
        session.clientId === sessionClientId
          ? {
              ...session,
              exercises: session.exercises.filter((_, index) => index !== exerciseIndex),
            }
          : session
      ),
    }));
  }, []);

  const handleOpenExerciseConfig = useCallback(
    (sessionClientId: string, exerciseIndex: number) => {
      setConfigTarget({ sessionClientId, exerciseIndex });
      setExerciseConfigVisible(true);
    },
    []
  );

  const handleSaveExerciseConfig = useCallback(
    (exercise: ExerciseConfig) => {
      if (!configTarget) return;
      setDraft((prev) => ({
        ...prev,
        sessions: prev.sessions.map((session) =>
          session.clientId === configTarget.sessionClientId
            ? {
                ...session,
                exercises: session.exercises.map((currentExercise, index) =>
                  index === configTarget.exerciseIndex ? exercise : currentExercise
                ),
              }
            : session
        ),
      }));
      setExerciseConfigVisible(false);
      setConfigTarget(null);
    },
    [configTarget]
  );

  const validateGeneratedProgram = useCallback(() => {
    const result = compilePslSource(
      pslSource,
      previewOverride ? { calendarOverride: previewOverride } : {}
    );
    if (!result.valid) {
      const message = result.diagnostics
        .filter((diagnostic) => diagnostic.severity === "error")
        .map((diagnostic) => diagnostic.message)
        .join("\n");
      throw new Error(message || "Program could not be validated.");
    }
    return result;
  }, [previewOverride, pslSource]);

  const handleSaveTemplate = useCallback(async () => {
    setSaving(true);
    setSaveError("");
    try {
      const nextName = draft.name.trim() || "My Program";
      const nextDescription = draft.description?.trim() || undefined;

      if (editingProgram?.isActive) {
        const result = validateGeneratedProgram();
        if (!previewOverride || !result.materialized) {
          throw new Error("Choose valid activation dates before saving changes.");
        }
        const storedEndDate = previewOverride.end_date ?? result.ast?.calendar?.end_date ?? null;
        await updatePslProgram(editingProgram.id, {
          name: nextName,
          description: nextDescription ?? null,
          pslSource,
          compiledHash: result.compiled?.source_hash ?? null,
          isActive: true,
          startDate: previewOverride.start_date,
          endDate: storedEndDate,
          units: result.ast?.units ?? draft.units ?? null,
        });
        await deleteCalendarForProgram(editingProgram.id);
        await insertCalendarEntries(
          editingProgram.id,
          extractCalendarEntries(result.materialized)
        );
      } else if (editingProgram) {
        validateGeneratedProgram();
        await updatePslProgram(editingProgram.id, {
          name: nextName,
          description: nextDescription ?? null,
          pslSource,
          compiledHash: null,
          units: draft.units ?? null,
        });
      } else {
        validateGeneratedProgram();
        await createPslProgram({
          name: nextName,
          description: nextDescription,
          pslSource,
          isActive: false,
          units: draft.units,
        });
      }
      router.replace("/programs/manage");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [draft.description, draft.name, draft.units, editingProgram, previewOverride, pslSource, validateGeneratedProgram]);

  const handleSaveAndActivate = useCallback(async () => {
    setSaving(true);
    setSaveError("");
    try {
      const result = validateGeneratedProgram();
      const nextName = draft.name.trim() || "My Program";
      const nextDescription = draft.description?.trim() || undefined;

      if (editingProgram) {
        if (!previewOverride || !result.materialized) {
          throw new Error("Choose valid activation dates before activating.");
        }
        const storedEndDate = previewOverride.end_date ?? result.ast?.calendar?.end_date ?? null;
        await updatePslProgram(editingProgram.id, {
          name: nextName,
          description: nextDescription ?? null,
          pslSource,
          compiledHash: result.compiled?.source_hash ?? null,
          isActive: true,
          startDate: previewOverride.start_date,
          endDate: storedEndDate,
          units: result.ast?.units ?? draft.units ?? null,
        });
        await deleteCalendarForProgram(editingProgram.id);
        await insertCalendarEntries(
          editingProgram.id,
          extractCalendarEntries(result.materialized)
        );
        router.replace("/programs/manage");
        return;
      }

      const program = await createPslProgram({
        name: nextName,
        description: nextDescription,
        pslSource,
        isActive: false,
        units: draft.units,
      });
      router.replace({
        pathname: "/programs/manage",
        params: { activateProgramId: String(program.id) },
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [draft.description, draft.name, draft.units, editingProgram, previewOverride, pslSource, validateGeneratedProgram]);

  const handleEditPslInstead = useCallback(() => {
    router.push({
      pathname: "/programs/create/editor",
      params: {
        pslSource,
        ...(editingProgram ? { editProgramId: String(editingProgram.id) } : {}),
      },
    });
  }, [editingProgram, pslSource]);

  const secondaryActionLabel = editingProgram ? "Save Changes" : "Save as Template";
  const primaryActionLabel = saving
    ? "Saving..."
    : editingProgram?.isActive
      ? "Save & Refresh"
      : "Save & Activate";

  return (
    <View style={styles.container} className="bg-background">
      <Stack.Screen
        options={{
          title: editingProgram ? "Edit Program" : "Program Builder",
          headerStyle: { backgroundColor: rawColors.background },
          headerTintColor: rawColors.foreground,
        }}
      />

      {loadingProgram ? (
        <View style={[styles.container, styles.emptyState]}>
          <Text style={{ color: rawColors.foregroundSecondary, fontSize: 16, fontWeight: "600" }}>
            Loading program...
          </Text>
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View
          style={[
            styles.heroCard,
            { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight },
          ]}
        >
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: rawColors.primary + "18" }]}>
              <MaterialCommunityIcons
                name={TIMING_MODE_META[draft.timingMode].icon}
                size={22}
                color={rawColors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { color: rawColors.foreground }]}>
                {draft.name.trim() || "My Program"}
              </Text>
              <Text style={[styles.heroSubtitle, { color: rawColors.foregroundSecondary }]}>
                {TIMING_MODE_META[draft.timingMode].title}
              </Text>
              <Text style={[styles.helpText, { color: rawColors.foregroundMuted }]}>
                {TIMING_MODE_META[draft.timingMode].description}
              </Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={[styles.metaPill, { backgroundColor: rawColors.surface }]}>
              <Text style={[styles.metaPillText, { color: rawColors.foregroundSecondary }]}>
                {draft.sessions.length} session{draft.sessions.length === 1 ? "" : "s"}
              </Text>
            </View>
            <View style={[styles.metaPill, { backgroundColor: rawColors.surface }]}>
              <Text style={[styles.metaPillText, { color: rawColors.foregroundSecondary }]}>
                {totalExercises} exercise{totalExercises === 1 ? "" : "s"}
              </Text>
            </View>
            <View style={[styles.metaPill, { backgroundColor: rawColors.surface }]}>
              <Text style={[styles.metaPillText, { color: rawColors.foregroundSecondary }]}>
                {draft.units?.toUpperCase() ?? "KG"}
              </Text>
            </View>
          </View>

          <Pressable onPress={handleEditPslInstead} hitSlop={8} style={{ marginTop: 12 }}>
            <Text style={{ color: rawColors.primary, fontWeight: "700" }}>
              Edit PSL instead
            </Text>
          </Pressable>
        </View>

        {draft.timingMode === "sequence" ? (
          <View
            style={[
              styles.panel,
              { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight },
            ]}
          >
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.panelTitle, { color: rawColors.foreground }]}>
                  Repeat sequence
                </Text>
                <Text style={[styles.helpText, { color: rawColors.foregroundMuted }]}>
                  Turn this off for a one-pass onboarding or peaking sequence.
                </Text>
              </View>
              <Switch
                value={draft.sequenceRepeat}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, sequenceRepeat: value }))}
                trackColor={{ false: rawColors.borderLight, true: rawColors.primary + "55" }}
                thumbColor={draft.sequenceRepeat ? rawColors.primary : rawColors.foregroundMuted}
              />
            </View>
          </View>
        ) : null}

        <View
          style={[
            styles.panel,
            { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight },
          ]}
        >
          <View style={styles.panelHeaderRow}>
            <Text style={[styles.panelTitle, { color: rawColors.foreground }]}>
              Sessions
            </Text>
            <Pressable onPress={addSession} hitSlop={8} style={styles.inlineAction}>
              <MaterialCommunityIcons name="plus" size={18} color={rawColors.primary} />
              <Text style={{ color: rawColors.primary, fontWeight: "700" }}>Add session</Text>
            </Pressable>
          </View>

          <Text style={[styles.helpText, { color: rawColors.foregroundMuted }]}>
            Sessions are first-class. One session can target multiple weekdays, and multiple sessions can land on the same day.
          </Text>

          <View style={{ marginTop: 14, gap: 12 }}>
            {draft.sessions.map((session, index) => (
              <SessionCard
                key={session.clientId}
                session={session}
                index={index}
                total={draft.sessions.length}
                timingMode={draft.timingMode}
                sequenceRepeat={draft.sequenceRepeat}
                units={draft.units ?? "kg"}
                rawColors={rawColors}
                onNameChange={(value) => updateSession(session.clientId, { name: value })}
                onUpdate={(patch) => updateSession(session.clientId, patch)}
                onToggleWeekday={(day) => toggleWeekday(session.clientId, day)}
                onMove={(direction) => moveSession(session.clientId, direction)}
                onRemove={() => removeSession(session.clientId)}
                onOpenExercisePicker={() => openExercisePicker(session)}
                onOpenExerciseConfig={(exerciseIndex) =>
                  handleOpenExerciseConfig(session.clientId, exerciseIndex)
                }
                onRemoveExercise={(exerciseIndex) =>
                  removeExercise(session.clientId, exerciseIndex)
                }
              />
            ))}
          </View>
        </View>

        <View
          style={[
            styles.panel,
            { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight },
          ]}
        >
          <Text style={[styles.panelTitle, { color: rawColors.foreground }]}>
            Preview / Activation Dates
          </Text>
          <Text style={[styles.helpText, { color: rawColors.foregroundMuted }]}>
            Preview uses a temporary calendar override. Save and activate will still let you confirm dates on the manage screen.
          </Text>

          <Pressable
            onPress={() => {
              setPreviewStartDate(isoToDateLocal(getDefaultActivationStartDateIso()));
              setPreviewWeeks(DEFAULT_ACTIVATION_WEEKS);
            }}
            hitSlop={8}
            style={{ marginTop: 10, alignSelf: "flex-start" }}
          >
            <Text style={{ color: rawColors.primary, fontWeight: "700" }}>
              Use default preview dates
            </Text>
          </Pressable>

          <View style={{ marginTop: 12 }}>
            <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
              Start date
            </Text>
            <Pressable
              onPress={() => setShowStartPicker(true)}
              style={[
                styles.inputRow,
                { backgroundColor: rawColors.surface, borderColor: rawColors.borderLight },
              ]}
            >
              <Text style={{ color: rawColors.foreground, fontWeight: "700" }}>
                {previewStartIso}
              </Text>
              <MaterialCommunityIcons
                name="calendar"
                size={20}
                color={rawColors.foregroundSecondary}
              />
            </Pressable>
            {showStartPicker ? (
              <DateTimePicker
                value={previewStartDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, date) => {
                  setShowStartPicker(Platform.OS === "ios");
                  if (date) setPreviewStartDate(date);
                }}
              />
            ) : null}
          </View>

          {requiresHorizonWeeks ? (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
                Horizon (weeks)
              </Text>
              <TextInput
                value={String(previewWeeks)}
                onChangeText={(value) =>
                  setPreviewWeeks(Math.max(1, Number.parseInt(value, 10) || 1))
                }
                keyboardType="number-pad"
                style={[
                  styles.input,
                  {
                    backgroundColor: rawColors.surface,
                    borderColor: rawColors.borderLight,
                    color: rawColors.foreground,
                  },
                ]}
              />
            </View>
          ) : null}

          {previewDerivedEndIso ? (
            <Text style={[styles.helpText, { color: rawColors.foregroundMuted, marginTop: 10 }]}>
              End date preview: {previewDerivedEndIso}
            </Text>
          ) : null}
        </View>

        <View
          style={[
            styles.panel,
            { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight },
          ]}
        >
          <Text style={[styles.panelTitle, { color: rawColors.foreground }]}>
            Diagnostics
          </Text>
          <Text style={[styles.helpText, { color: rawColors.foregroundMuted }]}>
            {compileResult.valid
              ? "Valid PSL 0.3 output"
              : `${errorDiagnostics.length} validation error${errorDiagnostics.length === 1 ? "" : "s"}`}
          </Text>

          {errorDiagnostics.slice(0, 6).map((diagnostic, index) => (
            <Text key={index} style={[styles.diagLine, { color: rawColors.destructive }]}>
              • {diagnostic.message}
            </Text>
          ))}

          {compatibilityWarnings.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
                Logging compatibility
              </Text>
              {compatibilityWarnings.slice(0, 4).map((warning, index) => (
                <Text key={index} style={[styles.diagLine, { color: rawColors.warning }]}>
                  • {warning.message}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.panel,
            { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight },
          ]}
        >
          <Text style={[styles.panelTitle, { color: rawColors.foreground }]}>
            Preview
          </Text>

          {sessionsPreview.length > 0 ? (
            sessionsPreview.map((session) => (
              <Text
                key={session.id}
                style={[styles.previewLine, { color: rawColors.foregroundSecondary }]}
              >
                • {session.name} ({session.exerciseCount} exercise
                {session.exerciseCount === 1 ? "" : "s"})
              </Text>
            ))
          ) : (
            <Text style={[styles.helpText, { color: rawColors.foregroundMuted }]}>
              Add timing data and exercises to see a compiled preview.
            </Text>
          )}

          {materializedPreview.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
                First occurrences
              </Text>
              {materializedPreview.map((session, index) => (
                <Text
                  key={`${session.id}-${index}`}
                  style={[styles.previewLine, { color: rawColors.foregroundSecondary }]}
                >
                  • {session.dateIso || "—"} — {session.name}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
      )}

      {!loadingProgram ? (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: rawColors.background,
              borderTopColor: rawColors.borderLight,
              shadowColor: rawColors.shadow,
            },
          ]}
        >
          {saveError ? (
            <Text style={[styles.saveError, { color: rawColors.destructive }]}>
              {saveError}
            </Text>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              onPress={handleSaveTemplate}
              disabled={saving}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: rawColors.border,
                  backgroundColor: pressed ? rawColors.surfaceSecondary : "transparent",
                  opacity: saving ? 0.6 : 1,
                },
              ]}
            >
              <Text style={{ color: rawColors.foreground, fontWeight: "600" }}>
                {secondaryActionLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSaveAndActivate}
              disabled={saving}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: rawColors.primary,
                  opacity: pressed || saving ? 0.72 : 1,
                },
              ]}
            >
              <Text style={{ color: rawColors.primaryForeground, fontWeight: "700" }}>
                {primaryActionLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <BaseModal
        visible={exerciseConfigVisible}
        onClose={() => {
          setExerciseConfigVisible(false);
          setConfigTarget(null);
        }}
      >
        {configExercise ? (
          <ExerciseConfigEditor
            exercise={configExercise}
            units={draft.units ?? "kg"}
            rawColors={rawColors}
            onSave={handleSaveExerciseConfig}
          />
        ) : null}
      </BaseModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 168,
  },
  heroCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  heroRow: {
    flexDirection: "row",
    gap: 12,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  heroSubtitle: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  helpText: {
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  metaPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  panelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  inlineAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sessionCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
  },
  sessionCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  sessionCardHeaderLeft: {
    flexDirection: "row",
    flex: 1,
    gap: 10,
  },
  sessionCardHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  orderBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  orderBadgeText: {
    fontSize: 13,
    fontWeight: "800",
  },
  sessionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  sessionNameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600",
  },
  fieldGroup: {
    marginTop: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  inputRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  weekdayChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  weekdayChip: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  weekdayChipText: {
    fontSize: 13,
    fontWeight: "800",
  },
  intervalRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  intervalField: {
    flex: 1,
  },
  exerciseSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 8,
  },
  exerciseSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  exerciseSectionCount: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyExerciseText: {
    fontSize: 13,
    lineHeight: 18,
  },
  exerciseRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  exerciseBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  exerciseBadgeText: {
    fontSize: 13,
    fontWeight: "800",
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: "700",
  },
  exerciseSummary: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  addExerciseButton: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  addExerciseButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  diagLine: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  previewLine: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 8,
  },
  saveError: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 14,
  },
  setCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  setCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  setCardTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  setRow: {
    flexDirection: "row",
    gap: 10,
  },
  setFieldSmall: {
    flex: 1,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  secondaryAction: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 12,
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: "700",
  },
  primaryModalAction: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryModalActionText: {
    fontSize: 15,
    fontWeight: "800",
  },
});
