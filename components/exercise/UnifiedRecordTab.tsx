import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import SetItem from "../lists/SetItem";
import AppModal from "../modals/BaseModal";
import DatePickerModal from "../modals/DatePickerModal";
import EditSetModal from "../modals/EditSetModal";
import TimerModal from "../TimerModal";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import {
  getLastRestSeconds,
  setLastRestSeconds,
} from "../../lib/db/exercises";
import { listMediaForSet, listMediaForSetIds } from "../../lib/db/media";
import {
  deleteUserSet,
  getCalendarSetById,
  getCalendarSetByWorkoutSetId,
  getProgrammedExercisesForExerciseOnDate,
  listCalendarSetsByWorkoutSetIds,
  resolveWorkoutExerciseIdForCalendarExercise,
  syncStatusesForCalendarExercise,
  updateSetActuals,
  type ProgramCalendarSetRow,
  type ProgrammedExerciseForDate,
} from "../../lib/db/programCalendar";
import {
  addSet,
  addWorkoutExercise,
  completeExerciseEntry,
  deleteSet,
  deleteSetsForWorkoutExercise,
  getOpenWorkoutExercise,
  getOrCreateActiveWorkout,
  getWorkoutExerciseById,
  listSetsForWorkoutExercise,
  updateExerciseEntryDate,
  updateSet,
  updateWorkoutExerciseInputs,
  updateWorkoutExerciseNote,
  type SetRow,
} from "../../lib/db/workouts";
import {
  ensureProgramExerciseWorkoutSession,
  persistCompletedProgramExercise,
  persistProgramSetToWorkoutHistory,
} from "../../lib/programs/programExerciseHistory";
import {
  getIntensityDefaultValue,
  getIntensityUnit,
} from "../../lib/programs/psl/pslMapper";
import { refreshUpcomingCalendarForProgram } from "../../lib/programs/psl/programRuntime";
import { useTheme } from "../../lib/theme/ThemeContext";
import { timerStore, type Timer } from "../../lib/timerStore";
import { formatRelativeDate, formatTime } from "../../lib/utils/formatters";
import { deleteAssociatedMediaForSets } from "../../lib/utils/mediaCleanup";
import {
  formatEditableWeightFromKg,
  formatWeightFromKg,
  getWeightUnitLabel,
  parseWeightInputToKg,
} from "../../lib/utils/units";

type RecordTabProps = {
  onHistoryRefresh?: () => void;
};

type ProgrammedSetsPanelProps = {
  programEntries: ProgrammedExerciseForDate[];
  selectedProgramExerciseId: number | null;
  onSelectProgramExercise: (id: number) => void;
  prescribedSets: ProgramCalendarSetRow[];
  userSets: ProgramCalendarSetRow[];
  weightInputs: Record<number, string>;
  repsInputs: Record<number, string>;
  onWeightChange: (setId: number, value: string) => void;
  onRepsChange: (setId: number, value: string) => void;
  onSetFocus: (setId: number) => void;
  onSetBlur: (setId: number) => void;
  onOpenSetInfo: (setId: number, calendarSetId: number) => void;
  setIdsWithMedia: Set<number>;
};

function normalizeDate(date: Date): Date {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  return next;
}

function toDateIso(date: Date): string {
  return normalizeDate(date).toISOString().slice(0, 10);
}

function pickProgrammedEntry(
  entries: ProgrammedExerciseForDate[],
  preferredProgramExerciseId: number | null
): ProgrammedExerciseForDate | null {
  if (entries.length === 0) {
    return null;
  }

  if (preferredProgramExerciseId) {
    const preferred = entries.find(
      (entry) => entry.calendarExercise.id === preferredProgramExerciseId
    );
    if (preferred) {
      return preferred;
    }
  }

  return (
    entries.find((entry) => entry.calendarExercise.status !== "complete") ??
    entries[0]
  );
}

function getProgramEntryLabel(
  entry: ProgrammedExerciseForDate,
  index: number,
  total: number
): string {
  const sessionLabel = entry.calendar.sessionName.trim();
  if (total === 1) {
    return `${entry.programName} - ${sessionLabel}`;
  }
  return `${index + 1}. ${entry.programName} - ${sessionLabel}`;
}

function hasLoggedProgramSet(set: ProgramCalendarSetRow): boolean {
  return set.isLogged && set.setId != null;
}

function ProgrammedSetsPanel({
  programEntries,
  selectedProgramExerciseId,
  onSelectProgramExercise,
  prescribedSets,
  userSets,
  weightInputs,
  repsInputs,
  onWeightChange,
  onRepsChange,
  onSetFocus,
  onSetBlur,
  onOpenSetInfo,
  setIdsWithMedia,
}: ProgrammedSetsPanelProps) {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const weightUnitLabel = getWeightUnitLabel(unitPreference);
  const loggedSetCount = useMemo(
    () => prescribedSets.filter((set) => hasLoggedProgramSet(set)).length,
    [prescribedSets]
  );

  const renderProgramSet = useCallback(
    (
      set: ProgramCalendarSetRow,
      index: number,
      options?: {
        isExtra?: boolean;
      }
    ) => {
      const weightValue = weightInputs[set.id] ?? "";
      const repsValue = repsInputs[set.id] ?? "";
      const isComplete = hasLoggedProgramSet(set);
      const isExtra = options?.isExtra ?? false;
      const canOpenSetInfo = !!set.setId;

      let intensityPlaceholder = "Intensity";
      let intensityUnitLabel: string = weightUnitLabel;

      if (set.prescribedIntensityJson) {
        try {
          const intensity = JSON.parse(set.prescribedIntensityJson);
          intensityPlaceholder =
            getIntensityDefaultValue(intensity) || intensityPlaceholder;
          const prescribedUnit = getIntensityUnit(intensity);
          if (
            prescribedUnit === "RPE" ||
            prescribedUnit === "RIR" ||
            prescribedUnit === "%"
          ) {
            intensityUnitLabel = prescribedUnit;
          }
        } catch {}
      }

      const repsPlaceholder = set.prescribedReps || "Reps";
      const roleLabel =
        isExtra
          ? "Extra"
          : set.prescribedRole && set.prescribedRole !== "work"
          ? set.prescribedRole.charAt(0).toUpperCase() +
            set.prescribedRole.slice(1)
          : null;

      return (
        <View
          key={set.id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 10,
            paddingHorizontal: 10,
            borderRadius: 12,
            borderWidth: 1,
            marginBottom: 8,
            backgroundColor: isComplete
              ? rawColors.success + "18"
              : rawColors.surfaceSecondary,
            borderColor: isComplete
              ? rawColors.success + "40"
              : rawColors.borderLight,
          }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 10,
              backgroundColor: isComplete
                ? rawColors.success
                : rawColors.foregroundSecondary,
            }}
          >
            {isComplete ? (
              <MaterialCommunityIcons
                name="check"
                size={14}
                color={rawColors.primaryForeground}
              />
            ) : (
              <Text
                className="text-xs font-bold text-primary-foreground"
                selectable
              >
                {index + 1}
              </Text>
            )}
          </View>

          <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <TextInput
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  fontSize: 15,
                  fontWeight: "600",
                  textAlign: "center",
                  backgroundColor: rawColors.surface,
                  borderColor: isComplete
                    ? rawColors.success + "45"
                    : rawColors.borderLight,
                  color: rawColors.foreground,
                }}
                value={weightValue}
                onChangeText={(value) => onWeightChange(set.id, value)}
                onFocus={() => onSetFocus(set.id)}
                onBlur={() => onSetBlur(set.id)}
                placeholder={intensityPlaceholder}
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="decimal-pad"
              />
              <Text
                className="text-[11px] font-medium"
                style={{ width: 28, color: rawColors.foregroundSecondary }}
                selectable
              >
                {intensityUnitLabel}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <TextInput
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  fontSize: 15,
                  fontWeight: "600",
                  textAlign: "center",
                  backgroundColor: rawColors.surface,
                  borderColor: isComplete
                    ? rawColors.success + "45"
                    : rawColors.borderLight,
                  color: rawColors.foreground,
                }}
                value={repsValue}
                onChangeText={(value) => onRepsChange(set.id, value)}
                onFocus={() => onSetFocus(set.id)}
                onBlur={() => onSetBlur(set.id)}
                placeholder={repsPlaceholder}
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="number-pad"
              />
              <Text
                className="text-[11px] font-medium"
                style={{ width: 28, color: rawColors.foregroundSecondary }}
                selectable
              >
                reps
              </Text>
            </View>
          </View>

          <View className="ml-2 flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open set ${index + 1} details`}
              accessibilityState={{ disabled: !canOpenSetInfo }}
              hitSlop={8}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={({ pressed }) => ({
                opacity: !canOpenSetInfo ? 0.45 : pressed ? 0.7 : 1,
                backgroundColor:
                  canOpenSetInfo && setIdsWithMedia.has(set.setId!)
                    ? rawColors.primary + "18"
                    : rawColors.surface,
                borderWidth: 1,
                borderColor:
                  canOpenSetInfo && setIdsWithMedia.has(set.setId!)
                    ? rawColors.primary + "30"
                    : rawColors.borderLight,
              })}
              onPress={() => {
                if (!set.setId) {
                  return;
                }
                onOpenSetInfo(set.setId, set.id);
              }}
              disabled={!canOpenSetInfo}
            >
              <MaterialCommunityIcons
                name="information-outline"
                size={18}
                color={
                  canOpenSetInfo && setIdsWithMedia.has(set.setId!)
                    ? rawColors.primary
                    : rawColors.foregroundMuted
                }
              />
            </Pressable>

            {roleLabel && (
              <View
                className="rounded-md px-2 py-1"
                style={{ backgroundColor: rawColors.primary + "20" }}
              >
                <Text
                  className="text-[10px] font-bold uppercase"
                  style={{ color: rawColors.primary }}
                  selectable
                >
                  {roleLabel}
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    },
    [
      onOpenSetInfo,
      onSetFocus,
      setIdsWithMedia,
      onRepsChange,
      onSetBlur,
      onWeightChange,
      rawColors,
      repsInputs,
      weightInputs,
      weightUnitLabel,
    ]
  );

  return (
    <View
      className="rounded-2xl border p-4 mb-4"
      style={{
        borderColor: rawColors.borderLight,
        backgroundColor: rawColors.surfaceSecondary,
      }}
    >
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-base font-semibold text-foreground" selectable>
          Programmed Sets
        </Text>
        <View className="rounded-full px-3 py-1.5 bg-primary-light">
          <Text className="text-sm font-medium text-primary" selectable>
            {loggedSetCount}/{prescribedSets.length} logged
          </Text>
        </View>
      </View>

      {programEntries.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
        >
          {programEntries.map((entry, index) => {
            const isSelected =
              entry.calendarExercise.id === selectedProgramExerciseId;
            const label = getProgramEntryLabel(
              entry,
              index,
              programEntries.length
            );

            return (
              <Pressable
                key={entry.calendarExercise.id}
                className="rounded-full px-3 py-2"
                style={{
                  backgroundColor: isSelected
                    ? rawColors.primary
                    : rawColors.surfaceSecondary,
                }}
                onPress={() => onSelectProgramExercise(entry.calendarExercise.id)}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{
                    color: isSelected
                      ? rawColors.primaryForeground
                      : rawColors.foreground,
                  }}
                  selectable
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View className="mt-1">
        {prescribedSets.map((set, index) => renderProgramSet(set, index))}
        {userSets.length > 0 && (
          <View className="mt-2">
            <Text
              className="text-xs font-semibold uppercase mb-2 text-foreground-secondary"
              selectable
            >
              Legacy Program Extra Sets
            </Text>
            {userSets.map((set, index) =>
              renderProgramSet(set, index, { isExtra: true })
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export default function UnifiedRecordTab({ onHistoryRefresh }: RecordTabProps) {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    weId?: string;
    plannedDate?: string;
    dateIso?: string;
    programExerciseId?: string;
  }>();
  const exerciseId =
    typeof params.id === "string" ? parseInt(params.id, 10) : null;
  const exerciseNameParam =
    typeof params.name === "string" ? params.name : "Exercise";
  const paramWeId =
    typeof params.weId === "string" ? parseInt(params.weId, 10) : null;
  const paramPlannedDate =
    typeof params.plannedDate === "string"
      ? parseInt(params.plannedDate, 10)
      : null;
  const paramProgramExerciseId =
    typeof params.programExerciseId === "string"
      ? parseInt(params.programExerciseId, 10)
      : null;
  const paramDateIso =
    typeof params.dateIso === "string" ? params.dateIso : null;

  const initialSelectedDate = useMemo(() => {
    if (paramDateIso) {
      return normalizeDate(new Date(`${paramDateIso}T12:00:00`));
    }
    if (paramPlannedDate) {
      return normalizeDate(new Date(paramPlannedDate));
    }
    return normalizeDate(new Date());
  }, [paramDateIso, paramPlannedDate]);

  const [workoutId, setWorkoutId] = useState<number | null>(null);
  const [workoutExerciseId, setWorkoutExerciseId] = useState<number | null>(
    null
  );
  const [sets, setSets] = useState<SetRow[]>([]);
  const [weight, setWeightState] = useState("");
  const [reps, setRepsState] = useState("");
  const [note, setNote] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedSet, setSelectedSet] = useState<SetRow | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    set: SetRow;
    displayIndex: number;
  } | null>(null);
  const [deleteMediaChecked, setDeleteMediaChecked] = useState(false);
  const [deleteMediaAvailable, setDeleteMediaAvailable] = useState(false);
  const [deleteMediaSetIds, setDeleteMediaSetIds] = useState<number[]>([]);
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);
  const [clearMediaChecked, setClearMediaChecked] = useState(false);
  const [clearMediaAvailable, setClearMediaAvailable] = useState(false);
  const [clearMediaSetIds, setClearMediaSetIds] = useState<number[]>([]);
  const [setIdsWithMedia, setSetIdsWithMedia] = useState<Set<number>>(
    new Set()
  );
  const [timerModalVisible, setTimerModalVisible] = useState(false);
  const [currentTimer, setCurrentTimer] = useState<Timer | null>(null);
  const [timerMinutes, setTimerMinutes] = useState("1");
  const [timerSeconds, setTimerSeconds] = useState("30");
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [programEntries, setProgramEntries] = useState<
    ProgrammedExerciseForDate[]
  >([]);
  const [selectedProgramExerciseId, setSelectedProgramExerciseId] = useState<
    number | null
  >(paramProgramExerciseId);
  const [programWeightInputs, setProgramWeightInputs] = useState<
    Record<number, string>
  >({});
  const [programRepsInputs, setProgramRepsInputs] = useState<
    Record<number, string>
  >({});
  const [, setEditingProgramSetIds] = useState<number[]>([]);
  const [isManualFormExpanded, setIsManualFormExpanded] = useState(
    !paramProgramExerciseId
  );
  const [programCompleteModalVisible, setProgramCompleteModalVisible] =
    useState(false);
  const programDirtySetIdsRef = useRef<Set<number>>(new Set());
  const programFocusCountsRef = useRef<Record<number, number>>({});
  const programBlurTimeoutsRef = useRef<
    Record<number, ReturnType<typeof setTimeout>>
  >({});
  const programAutosaveTimeoutsRef = useRef<
    Record<number, ReturnType<typeof setTimeout>>
  >({});
  const programWeightInputsRef = useRef<Record<number, string>>({});
  const programRepsInputsRef = useRef<Record<number, string>>({});
  const sessionNoteRef = useRef("");
  const sessionNoteDirtyRef = useRef(false);
  const sessionNoteContextRef = useRef<number | null>(null);
  const flushSessionNoteDraftRef = useRef<
    () => Promise<{ workoutId: number | null; workoutExerciseId: number | null }>
  >(async () => ({ workoutId: null, workoutExerciseId: null }));
  const persistDirtyProgramSetCommitsOnBlurRef = useRef<
    () => Promise<void>
  >(async () => {});
  const commitProgramSetChangesRef = useRef<
    (
      setId: number,
      options?: { skipReload?: boolean; suppressUiUpdate?: boolean }
    ) => Promise<void>
  >(async () => {});

  const selectedDateIso = useMemo(() => toDateIso(selectedDate), [selectedDate]);

  const activeProgramEntry = useMemo(
    () => pickProgrammedEntry(programEntries, selectedProgramExerciseId),
    [programEntries, selectedProgramExerciseId]
  );

  const inProgramMode = activeProgramEntry !== null;
  const manualFormExpansion = useSharedValue(paramProgramExerciseId ? 0 : 1);

  const prescribedSets = useMemo(
    () => activeProgramEntry?.sets.filter((set) => !set.isUserAdded) ?? [],
    [activeProgramEntry]
  );
  const userSets = useMemo(
    () => activeProgramEntry?.sets.filter((set) => set.isUserAdded) ?? [],
    [activeProgramEntry]
  );

  const displayExerciseName =
    activeProgramEntry?.calendarExercise.exerciseName ?? exerciseNameParam;
  const nextSetIndex = sets.length + 1;
  const hiddenProgramSetIds = useMemo(
    () =>
      new Set(
        (activeProgramEntry?.sets ?? [])
          .map((set) => set.setId)
          .filter((setId): setId is number => typeof setId === "number")
      ),
    [activeProgramEntry]
  );
  const displayedRecordedSets = useMemo(
    () => sets.filter((set) => !hiddenProgramSetIds.has(set.id)),
    [hiddenProgramSetIds, sets]
  );

  const clearProgramInteractionState = useCallback(() => {
    for (const timeoutId of Object.values(programBlurTimeoutsRef.current)) {
      clearTimeout(timeoutId);
    }
    for (const timeoutId of Object.values(programAutosaveTimeoutsRef.current)) {
      clearTimeout(timeoutId);
    }
    programBlurTimeoutsRef.current = {};
    programAutosaveTimeoutsRef.current = {};
    programFocusCountsRef.current = {};
    programDirtySetIdsRef.current.clear();
    setEditingProgramSetIds([]);
  }, []);

  const manualFormAnimatedStyle = useAnimatedStyle(() => ({
    maxHeight: withTiming(manualFormExpansion.value === 1 ? 520 : 0, {
      duration: 260,
    }),
    opacity: withTiming(manualFormExpansion.value === 1 ? 1 : 0, {
      duration: 180,
    }),
    transform: [
      {
        translateY: withTiming(manualFormExpansion.value === 1 ? 0 : -10, {
          duration: 220,
        }),
      },
    ],
    overflow: "hidden" as const,
  }));

  const loadLastRestTime = useCallback(async () => {
    if (!exerciseId) {
      return;
    }
    const lastRest = await getLastRestSeconds(exerciseId);
    if (lastRest !== null && lastRest > 0) {
      const mins = Math.floor(lastRest / 60);
      const secs = lastRest % 60;
      setTimerMinutes(String(mins));
      setTimerSeconds(String(secs));
    }
  }, [exerciseId]);

  const applyLoadedSessionNote = useCallback(
    (nextWorkoutExerciseId: number | null, nextNote: string | null | undefined) => {
      if (
        sessionNoteDirtyRef.current &&
        sessionNoteContextRef.current === nextWorkoutExerciseId
      ) {
        return;
      }

      const nextValue = nextNote ?? "";
      sessionNoteDirtyRef.current = false;
      sessionNoteContextRef.current = nextWorkoutExerciseId;
      sessionNoteRef.current = nextValue;
      setSessionNote(nextValue);
    },
    []
  );

  const ensureManualWorkoutSession = useCallback(async () => {
    if (!exerciseId) {
      return null;
    }

    const nextWorkoutId = workoutId ?? (await getOrCreateActiveWorkout());
    const existingOpenWorkoutExercise =
      workoutExerciseId != null
        ? await getWorkoutExerciseById(workoutExerciseId)
        : await getOpenWorkoutExercise(nextWorkoutId, exerciseId);
    const nextWorkoutExerciseId =
      existingOpenWorkoutExercise?.id ??
      (await addWorkoutExercise({
        workout_id: nextWorkoutId,
        exercise_id: exerciseId,
        performed_at: selectedDate.getTime(),
      }));

    setWorkoutId(nextWorkoutId);
    setWorkoutExerciseId(nextWorkoutExerciseId);

    return {
      workoutId: nextWorkoutId,
      workoutExerciseId: nextWorkoutExerciseId,
    };
  }, [exerciseId, selectedDate, workoutExerciseId, workoutId]);

  const hydrateProgramInputs = useCallback(
    (entries: ProgrammedExerciseForDate[]) => {
      const nextWeightInputs: Record<number, string> = {};
      const nextRepsInputs: Record<number, string> = {};

      for (const entry of entries) {
        for (const set of entry.sets) {
          const hasLoggedValues =
            set.isLogged &&
            set.setId != null &&
            set.actualWeight != null &&
            set.actualWeight > 0 &&
            set.actualReps != null &&
            set.actualReps > 0;

          if (hasLoggedValues) {
            nextWeightInputs[set.id] = formatEditableWeightFromKg(
              set.actualWeight,
              unitPreference
            );
            nextRepsInputs[set.id] = String(set.actualReps);
          }
        }
      }

      programWeightInputsRef.current = nextWeightInputs;
      programRepsInputsRef.current = nextRepsInputs;
      setProgramWeightInputs(nextWeightInputs);
      setProgramRepsInputs(nextRepsInputs);
    },
    [unitPreference]
  );

  const loadManualWorkout = useCallback(async () => {
    if (!exerciseId) {
      return;
    }

    const activeWorkoutId = await getOrCreateActiveWorkout();
    setWorkoutId(activeWorkoutId);

    let nextWorkoutExerciseId: number;
    let nextWorkoutExercise: Awaited<ReturnType<typeof getWorkoutExerciseById>> =
      null;

    if (paramWeId) {
      nextWorkoutExerciseId = paramWeId;
      nextWorkoutExercise = await getWorkoutExerciseById(paramWeId);
      setWorkoutExerciseId(nextWorkoutExerciseId);
    } else {
      const openWorkoutExercise = await getOpenWorkoutExercise(
        activeWorkoutId,
        exerciseId
      );

      if (openWorkoutExercise) {
        nextWorkoutExerciseId = openWorkoutExercise.id;
        nextWorkoutExercise = openWorkoutExercise;
        setWorkoutExerciseId(nextWorkoutExerciseId);
        if (openWorkoutExercise.currentWeight !== null) {
          setWeightState(
            formatEditableWeightFromKg(
              openWorkoutExercise.currentWeight,
              unitPreference
            )
          );
        }
        if (openWorkoutExercise.currentReps !== null) {
          setRepsState(String(openWorkoutExercise.currentReps));
        }
      } else {
        nextWorkoutExerciseId = await addWorkoutExercise({
          workout_id: activeWorkoutId,
          exercise_id: exerciseId,
          performed_at: selectedDate.getTime(),
        });
        nextWorkoutExercise = await getWorkoutExerciseById(nextWorkoutExerciseId);
        setWorkoutExerciseId(nextWorkoutExerciseId);
        setWeightState("");
        setRepsState("");
      }
    }

    applyLoadedSessionNote(nextWorkoutExerciseId, nextWorkoutExercise?.note ?? null);

    const exerciseSets = await listSetsForWorkoutExercise(nextWorkoutExerciseId);
    setSets(exerciseSets);

    if (paramWeId && exerciseSets.length > 0) {
      const firstPlanned = exerciseSets.find((set) =>
        (set.note ?? "").startsWith("[PLANNED]")
      );
      if (firstPlanned) {
        if (firstPlanned.weightKg !== null) {
          setWeightState(
            formatEditableWeightFromKg(firstPlanned.weightKg, unitPreference)
          );
        }
        if (firstPlanned.reps !== null) {
          setRepsState(String(firstPlanned.reps));
        }
      }
    }

    await loadLastRestTime();
  }, [
    applyLoadedSessionNote,
    exerciseId,
    loadLastRestTime,
    paramWeId,
    selectedDate,
    unitPreference,
  ]);

  const loadProgramWorkout = useCallback(
    async (
      entries: ProgrammedExerciseForDate[],
      preferredProgramExerciseId?: number | null
    ) => {
      const nextEntry = pickProgrammedEntry(
        entries,
        preferredProgramExerciseId ??
          selectedProgramExerciseId ??
          paramProgramExerciseId
      );

      if (!nextEntry) {
        setSelectedProgramExerciseId(null);
        setWorkoutId(null);
        setWorkoutExerciseId(null);
        applyLoadedSessionNote(null, null);
        setSets([]);
        programWeightInputsRef.current = {};
        programRepsInputsRef.current = {};
        setProgramWeightInputs({});
        setProgramRepsInputs({});
        setWeightState("");
        setRepsState("");
        return;
      }

      if (selectedProgramExerciseId !== nextEntry.calendarExercise.id) {
        setSelectedProgramExerciseId(nextEntry.calendarExercise.id);
      }

      hydrateProgramInputs(entries);
      await loadLastRestTime();

      const resolvedWorkoutExerciseId =
        await resolveWorkoutExerciseIdForCalendarExercise(
          nextEntry.calendarExercise.id
        );

      if (!resolvedWorkoutExerciseId) {
        setWorkoutId(null);
        setWorkoutExerciseId(null);
        applyLoadedSessionNote(null, null);
        setSets([]);
        programWeightInputsRef.current = {};
        programRepsInputsRef.current = {};
        setWeightState("");
        setRepsState("");
        return;
      }

      const linkedWorkoutExercise = await getWorkoutExerciseById(
        resolvedWorkoutExerciseId
      );

      if (!linkedWorkoutExercise) {
        setWorkoutId(null);
        setWorkoutExerciseId(null);
        applyLoadedSessionNote(null, null);
        setSets([]);
        programWeightInputsRef.current = {};
        programRepsInputsRef.current = {};
        setWeightState("");
        setRepsState("");
        return;
      }

      setWorkoutId(linkedWorkoutExercise.workoutId);
      setWorkoutExerciseId(linkedWorkoutExercise.id);
      applyLoadedSessionNote(linkedWorkoutExercise.id, linkedWorkoutExercise.note);
      setWeightState(
        linkedWorkoutExercise.currentWeight != null
          ? formatEditableWeightFromKg(
              linkedWorkoutExercise.currentWeight,
              unitPreference
            )
          : ""
      );
      setRepsState(
        linkedWorkoutExercise.currentReps != null
          ? String(linkedWorkoutExercise.currentReps)
          : ""
      );
      setSets(await listSetsForWorkoutExercise(linkedWorkoutExercise.id));
    },
    [
      applyLoadedSessionNote,
      hydrateProgramInputs,
      loadLastRestTime,
      paramProgramExerciseId,
      selectedProgramExerciseId,
      unitPreference,
    ]
  );

  const loadRecordState = useCallback(async () => {
    if (!exerciseId) {
      return;
    }

    clearProgramInteractionState();

    const nextProgramEntries = await getProgrammedExercisesForExerciseOnDate({
      dateIso: selectedDateIso,
      exerciseId,
      exerciseName: exerciseNameParam,
    });

    if (nextProgramEntries.length > 0) {
      setProgramEntries(nextProgramEntries);
      await loadProgramWorkout(nextProgramEntries);
      return;
    }

    setProgramEntries([]);
    setSelectedProgramExerciseId(null);
    programWeightInputsRef.current = {};
    programRepsInputsRef.current = {};
    setProgramWeightInputs({});
    setProgramRepsInputs({});
    await loadManualWorkout();
  }, [
    clearProgramInteractionState,
    exerciseId,
    exerciseNameParam,
    loadManualWorkout,
    loadProgramWorkout,
    selectedDateIso,
  ]);

  useFocusEffect(
    useCallback(() => {
      void loadRecordState();
    }, [loadRecordState])
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        void flushSessionNoteDraftRef.current();
      };
    }, [])
  );

  useEffect(() => {
    sessionNoteRef.current = sessionNote;
  }, [sessionNote]);

  useEffect(() => {
    if (!inProgramMode) {
      manualFormExpansion.value = 1;
      setIsManualFormExpanded(true);
      return;
    }

    manualFormExpansion.value = 0;
    setIsManualFormExpanded(false);
  }, [inProgramMode, manualFormExpansion]);

  useEffect(() => {
    return () => {
      clearProgramInteractionState();
    };
  }, [clearProgramInteractionState]);

  useEffect(() => {
    programWeightInputsRef.current = programWeightInputs;
  }, [programWeightInputs]);

  useEffect(() => {
    programRepsInputsRef.current = programRepsInputs;
  }, [programRepsInputs]);

  useEffect(() => {
    let cancelled = false;
    const setIds = sets.map((set) => set.id).filter((id) => id > 0);
    if (setIds.length === 0) {
      setSetIdsWithMedia(new Set());
      return () => {
        cancelled = true;
      };
    }

    listMediaForSetIds(setIds)
      .then((mediaRows) => {
        if (cancelled) {
          return;
        }
        const nextSetIds = new Set(
          mediaRows
            .map((row) => row.setId)
            .filter((setId): setId is number => typeof setId === "number")
        );
        setSetIdsWithMedia(nextSetIds);
      })
      .catch(() => {
        if (!cancelled) {
          setSetIdsWithMedia(new Set());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sets]);

  useEffect(() => {
    const unsubscribe = timerStore.subscribe((timersByExercise) => {
      if (exerciseId) {
        const timer = timersByExercise.get(exerciseId);
        setCurrentTimer(timer ?? null);
      }
    });
    return unsubscribe;
  }, [exerciseId]);

  const setWeight = useCallback(
    (value: string) => {
      setWeightState(value);
      if (workoutExerciseId) {
        const weightKg = parseWeightInputToKg(value, unitPreference);
        void updateWorkoutExerciseInputs(workoutExerciseId, {
          currentWeight: weightKg,
        });
      }
    },
    [unitPreference, workoutExerciseId]
  );

  const setReps = useCallback(
    (value: string) => {
      setRepsState(value);
      if (workoutExerciseId) {
        const numValue = value.trim() ? parseInt(value, 10) : null;
        void updateWorkoutExerciseInputs(workoutExerciseId, {
          currentReps: numValue,
        });
      }
    },
    [workoutExerciseId]
  );

  const isProgramSetInputComplete = useCallback(
    (setId: number) => {
      const weightValue = (programWeightInputs[setId] ?? "").trim();
      const repsValue = (programRepsInputs[setId] ?? "").trim();

      if (!weightValue || !repsValue) {
        return false;
      }

      const parsedWeight = parseFloat(weightValue);
      const parsedReps = parseInt(repsValue, 10);

      return (
        Number.isFinite(parsedWeight) &&
        parsedWeight > 0 &&
        Number.isFinite(parsedReps) &&
        parsedReps > 0
      );
    },
    [programRepsInputs, programWeightInputs]
  );

  const isProgramSetReadyForCompletion = useCallback(
    (set: ProgramCalendarSetRow) =>
      hasLoggedProgramSet(set) || isProgramSetInputComplete(set.id),
    [isProgramSetInputComplete]
  );

  const findProgramSetContext = useCallback(
    (setId: number) => {
      for (const entry of programEntries) {
        const set = entry.sets.find((candidate) => candidate.id === setId);
        if (set) {
          return { entry, set };
        }
      }
      return null;
    },
    [programEntries]
  );

  const clearProgramInputState = useCallback((setId: number) => {
    if (setId in programWeightInputsRef.current) {
      const nextWeightInputs = { ...programWeightInputsRef.current };
      delete nextWeightInputs[setId];
      programWeightInputsRef.current = nextWeightInputs;
    }
    setProgramWeightInputs((current) => {
      if (!(setId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[setId];
      return next;
    });
    if (setId in programRepsInputsRef.current) {
      const nextRepsInputs = { ...programRepsInputsRef.current };
      delete nextRepsInputs[setId];
      programRepsInputsRef.current = nextRepsInputs;
    }
    setProgramRepsInputs((current) => {
      if (!(setId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[setId];
      return next;
    });
  }, []);

  const updateProgramSetInEntries = useCallback(
    (setId: number, nextSet: ProgramCalendarSetRow | null) => {
      setProgramEntries((current) =>
        current.map((entry) => {
          if (!entry.sets.some((set) => set.id === setId)) {
            return entry;
          }

          return {
            ...entry,
            sets: nextSet
              ? entry.sets.map((set) => (set.id === setId ? nextSet : set))
              : entry.sets.filter((set) => set.id !== setId),
          };
        })
      );
    },
    []
  );

  const allPrescribedComplete = useMemo(
    () =>
      prescribedSets.length > 0 &&
      prescribedSets.every((set) => isProgramSetReadyForCompletion(set)),
    [isProgramSetReadyForCompletion, prescribedSets]
  );

  const hasAnyCompleteProgramSet = useMemo(
    () =>
      [...prescribedSets, ...userSets].some((set) =>
        isProgramSetReadyForCompletion(set)
      ),
    [isProgramSetReadyForCompletion, prescribedSets, userSets]
  );

  const ensureProgramWorkoutSession = useCallback(async () => {
    if (!activeProgramEntry) {
      return null;
    }

    const session = await ensureProgramExerciseWorkoutSession({
      calendarExerciseId: activeProgramEntry.calendarExercise.id,
      calendarExercise: activeProgramEntry.calendarExercise,
      exerciseName: activeProgramEntry.calendarExercise.exerciseName,
      performedAt: selectedDate.getTime(),
    });

    setWorkoutId(session.workoutId);
    setWorkoutExerciseId(session.workoutExerciseId);
    return session;
  }, [activeProgramEntry, selectedDate]);

  const flushSessionNoteDraft = useCallback(async () => {
    let nextWorkoutId = workoutId;
    let nextWorkoutExerciseId = workoutExerciseId;

    if (!sessionNoteDirtyRef.current) {
      return {
        workoutId: nextWorkoutId,
        workoutExerciseId: nextWorkoutExerciseId,
      };
    }

    const noteValue = sessionNoteRef.current.trim() || null;

    if (!nextWorkoutExerciseId) {
      if (!noteValue) {
        sessionNoteDirtyRef.current = false;
        sessionNoteContextRef.current = null;
        return {
          workoutId: nextWorkoutId,
          workoutExerciseId: nextWorkoutExerciseId,
        };
      }

      if (inProgramMode && activeProgramEntry) {
        const session = await ensureProgramWorkoutSession();
        if (!session) {
          return {
            workoutId: nextWorkoutId,
            workoutExerciseId: nextWorkoutExerciseId,
          };
        }
        nextWorkoutId = session.workoutId;
        nextWorkoutExerciseId = session.workoutExerciseId;
      } else {
        const session = await ensureManualWorkoutSession();
        if (!session) {
          return {
            workoutId: nextWorkoutId,
            workoutExerciseId: nextWorkoutExerciseId,
          };
        }
        nextWorkoutId = session.workoutId;
        nextWorkoutExerciseId = session.workoutExerciseId;
      }
    }

    await updateWorkoutExerciseNote(nextWorkoutExerciseId, noteValue);

    if (nextWorkoutId !== workoutId) {
      setWorkoutId(nextWorkoutId);
    }
    if (nextWorkoutExerciseId !== workoutExerciseId) {
      setWorkoutExerciseId(nextWorkoutExerciseId);
    }

    sessionNoteDirtyRef.current = false;
    sessionNoteContextRef.current = nextWorkoutExerciseId;
    onHistoryRefresh?.();

    return {
      workoutId: nextWorkoutId,
      workoutExerciseId: nextWorkoutExerciseId,
    };
  }, [
    activeProgramEntry,
    ensureManualWorkoutSession,
    ensureProgramWorkoutSession,
    inProgramMode,
    onHistoryRefresh,
    workoutExerciseId,
    workoutId,
  ]);

  const reloadRecordState = useCallback(async () => {
    await flushSessionNoteDraft();
    await loadRecordState();
  }, [flushSessionNoteDraft, loadRecordState]);

  useEffect(() => {
    flushSessionNoteDraftRef.current = flushSessionNoteDraft;
  }, [flushSessionNoteDraft]);

  const handleSessionNoteChange = useCallback(
    (value: string) => {
      sessionNoteDirtyRef.current = true;
      sessionNoteContextRef.current = workoutExerciseId;
      sessionNoteRef.current = value;
      setSessionNote(value);
    },
    [workoutExerciseId]
  );

  const handleSessionNoteBlur = useCallback(() => {
    void flushSessionNoteDraft();
  }, [flushSessionNoteDraft]);

  const refreshWorkoutSets = useCallback(async (targetWorkoutExerciseId: number) => {
    const linkedWorkoutExercise = await getWorkoutExerciseById(targetWorkoutExerciseId);
    if (!linkedWorkoutExercise) {
      return;
    }

    setWorkoutId(linkedWorkoutExercise.workoutId);
    setWorkoutExerciseId(linkedWorkoutExercise.id);
    applyLoadedSessionNote(linkedWorkoutExercise.id, linkedWorkoutExercise.note);
    setSets(await listSetsForWorkoutExercise(linkedWorkoutExercise.id));
  }, [applyLoadedSessionNote]);

  const commitProgramSetChanges = useCallback(
    async (
      setId: number,
      options?: { skipReload?: boolean; suppressUiUpdate?: boolean }
    ) => {
      const autosaveTimeoutId = programAutosaveTimeoutsRef.current[setId];
      if (autosaveTimeoutId) {
        clearTimeout(autosaveTimeoutId);
        delete programAutosaveTimeoutsRef.current[setId];
      }

      if (!programDirtySetIdsRef.current.has(setId)) {
        return;
      }

      const context = findProgramSetContext(setId);
      if (!context) {
        programDirtySetIdsRef.current.delete(setId);
        return;
      }

      const latestCalendarSet = (await getCalendarSetById(setId)) ?? context.set;
      const weightInput = programWeightInputsRef.current[setId] ?? "";
      const repsInput = programRepsInputsRef.current[setId] ?? "";
      const trimmedWeight = weightInput.trim();
      const trimmedReps = repsInput.trim();
      const weightKg = trimmedWeight
        ? parseWeightInputToKg(weightInput, unitPreference)
        : null;
      const parsedReps = trimmedReps ? parseInt(repsInput, 10) : null;
      const isComplete =
        weightKg != null &&
        weightKg > 0 &&
        parsedReps != null &&
        Number.isFinite(parsedReps) &&
        parsedReps > 0;
      const shouldDeleteUserAddedSet =
        latestCalendarSet.isUserAdded && trimmedWeight === "" && trimmedReps === "";

      let nextWorkoutExerciseId = workoutExerciseId;

      try {
        if (isComplete) {
          const result = await persistProgramSetToWorkoutHistory({
            calendarExerciseId: context.entry.calendarExercise.id,
            calendarExercise: context.entry.calendarExercise,
            exerciseName: context.entry.calendarExercise.exerciseName,
            set: latestCalendarSet,
            weightInput,
            repsInput,
            unitPreference,
            performedAt: selectedDate.getTime(),
          });

          if (result.workoutExerciseId) {
            nextWorkoutExerciseId = result.workoutExerciseId;
          }
        } else if (shouldDeleteUserAddedSet) {
          if (latestCalendarSet.setId) {
            await deleteSet(latestCalendarSet.setId);
          }
          await deleteUserSet(setId);
          clearProgramInputState(setId);
        } else if (latestCalendarSet.setId) {
          await deleteSet(latestCalendarSet.setId);
          await updateSetActuals(setId, {
            actualWeight: null,
            actualReps: null,
            isLogged: false,
            setId_fk: null,
          });
        } else {
          await updateSetActuals(setId, {
            actualWeight: null,
            actualReps: null,
            isLogged: false,
          });
        }

        await syncStatusesForCalendarExercise(context.entry.calendarExercise.id);

        if (options?.suppressUiUpdate) {
          return;
        }

        const shouldReload =
          !options?.skipReload &&
          Object.keys(programFocusCountsRef.current).length === 0;

        if (shouldReload) {
          await reloadRecordState();
          onHistoryRefresh?.();
          return;
        }

        if (shouldDeleteUserAddedSet) {
          updateProgramSetInEntries(setId, null);
        } else {
          const refreshedCalendarSet = await getCalendarSetById(setId);
          if (refreshedCalendarSet) {
            updateProgramSetInEntries(setId, refreshedCalendarSet);
          }
        }

        if (nextWorkoutExerciseId) {
          await refreshWorkoutSets(nextWorkoutExerciseId);
        }
        onHistoryRefresh?.();
      } finally {
        programDirtySetIdsRef.current.delete(setId);
      }
    },
    [
      clearProgramInputState,
      findProgramSetContext,
      onHistoryRefresh,
      refreshWorkoutSets,
      reloadRecordState,
      selectedDate,
      unitPreference,
      updateProgramSetInEntries,
      workoutExerciseId,
    ]
  );

  useEffect(() => {
    commitProgramSetChangesRef.current = commitProgramSetChanges;
  }, [commitProgramSetChanges]);

  const scheduleProgramSetAutosave = useCallback(
    (
      setId: number,
      nextValues?: {
        weight?: string;
        reps?: string;
      }
    ) => {
      const existingTimeoutId = programAutosaveTimeoutsRef.current[setId];
      if (existingTimeoutId) {
        clearTimeout(existingTimeoutId);
        delete programAutosaveTimeoutsRef.current[setId];
      }

      const context = findProgramSetContext(setId);
      if (!context) {
        return;
      }

      const weightValue = (nextValues?.weight ??
        programWeightInputsRef.current[setId] ??
        ""
      ).trim();
      const repsValue = (nextValues?.reps ?? programRepsInputsRef.current[setId] ?? "").trim();

      if (!weightValue || !repsValue) {
        return;
      }

      const parsedWeight = parseWeightInputToKg(weightValue, unitPreference);
      const parsedReps = parseInt(repsValue, 10);

      if (
        parsedWeight == null ||
        parsedWeight <= 0 ||
        !Number.isFinite(parsedReps) ||
        parsedReps <= 0
      ) {
        return;
      }

      programAutosaveTimeoutsRef.current[setId] = setTimeout(() => {
        delete programAutosaveTimeoutsRef.current[setId];

        if (!programDirtySetIdsRef.current.has(setId)) {
          return;
        }

        void commitProgramSetChangesRef.current(setId, { skipReload: true });
      }, 320);
    },
    [findProgramSetContext, unitPreference]
  );

  const handleProgramWeightChange = useCallback(
    (setId: number, value: string) => {
      programDirtySetIdsRef.current.add(setId);
      programWeightInputsRef.current = {
        ...programWeightInputsRef.current,
        [setId]: value,
      };
      setProgramWeightInputs((current) => ({ ...current, [setId]: value }));
      scheduleProgramSetAutosave(setId, { weight: value });
    },
    [scheduleProgramSetAutosave]
  );

  const handleProgramRepsChange = useCallback(
    (setId: number, value: string) => {
      programDirtySetIdsRef.current.add(setId);
      programRepsInputsRef.current = {
        ...programRepsInputsRef.current,
        [setId]: value,
      };
      setProgramRepsInputs((current) => ({ ...current, [setId]: value }));
      scheduleProgramSetAutosave(setId, { reps: value });
    },
    [scheduleProgramSetAutosave]
  );

  const flushDirtyProgramSetCommits = useCallback(async () => {
    const dirtySetIds = Array.from(programDirtySetIdsRef.current);
    if (dirtySetIds.length === 0) {
      return;
    }

    for (const timeoutId of Object.values(programBlurTimeoutsRef.current)) {
      clearTimeout(timeoutId);
    }
    for (const timeoutId of Object.values(programAutosaveTimeoutsRef.current)) {
      clearTimeout(timeoutId);
    }
    programBlurTimeoutsRef.current = {};
    programAutosaveTimeoutsRef.current = {};
    programFocusCountsRef.current = {};
    setEditingProgramSetIds([]);

    for (const setId of dirtySetIds) {
      await commitProgramSetChanges(setId, { skipReload: true });
    }

    await reloadRecordState();
  }, [commitProgramSetChanges, reloadRecordState]);

  const persistDirtyProgramSetCommitsOnBlur = useCallback(async () => {
    const dirtySetIds = Array.from(programDirtySetIdsRef.current);
    if (dirtySetIds.length === 0) {
      return;
    }

    for (const timeoutId of Object.values(programBlurTimeoutsRef.current)) {
      clearTimeout(timeoutId);
    }
    for (const timeoutId of Object.values(programAutosaveTimeoutsRef.current)) {
      clearTimeout(timeoutId);
    }
    programBlurTimeoutsRef.current = {};
    programAutosaveTimeoutsRef.current = {};
    programFocusCountsRef.current = {};

    for (const setId of dirtySetIds) {
      await commitProgramSetChanges(setId, {
        skipReload: true,
        suppressUiUpdate: true,
      });
    }

    onHistoryRefresh?.();
  }, [commitProgramSetChanges, onHistoryRefresh]);

  useEffect(() => {
    persistDirtyProgramSetCommitsOnBlurRef.current =
      persistDirtyProgramSetCommitsOnBlur;
  }, [persistDirtyProgramSetCommitsOnBlur]);

  const handleProgramSetFocus = useCallback((setId: number) => {
    const timeoutId = programBlurTimeoutsRef.current[setId];
    if (timeoutId) {
      clearTimeout(timeoutId);
      delete programBlurTimeoutsRef.current[setId];
    }
    const autosaveTimeoutId = programAutosaveTimeoutsRef.current[setId];
    if (autosaveTimeoutId) {
      clearTimeout(autosaveTimeoutId);
      delete programAutosaveTimeoutsRef.current[setId];
    }

    programFocusCountsRef.current[setId] =
      (programFocusCountsRef.current[setId] ?? 0) + 1;
    setEditingProgramSetIds((current) =>
      current.includes(setId) ? current : [...current, setId]
    );
  }, []);

  const handleProgramSetBlur = useCallback(
    (setId: number) => {
      const timeoutId = programBlurTimeoutsRef.current[setId];
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      const autosaveTimeoutId = programAutosaveTimeoutsRef.current[setId];
      if (autosaveTimeoutId) {
        clearTimeout(autosaveTimeoutId);
        delete programAutosaveTimeoutsRef.current[setId];
      }

      programBlurTimeoutsRef.current[setId] = setTimeout(() => {
        const nextFocusCount = Math.max(
          0,
          (programFocusCountsRef.current[setId] ?? 1) - 1
        );

        if (nextFocusCount > 0) {
          programFocusCountsRef.current[setId] = nextFocusCount;
          delete programBlurTimeoutsRef.current[setId];
          return;
        }

        delete programFocusCountsRef.current[setId];
        delete programBlurTimeoutsRef.current[setId];
        setEditingProgramSetIds((current) => current.filter((id) => id !== setId));

        if (programDirtySetIdsRef.current.has(setId)) {
          void commitProgramSetChanges(setId);
        }
      }, 60);
    },
    [commitProgramSetChanges]
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        void persistDirtyProgramSetCommitsOnBlurRef.current();
      };
    }, [])
  );

  const handleSelectProgramExercise = useCallback(
    async (programExerciseId: number) => {
      Keyboard.dismiss();
      await flushSessionNoteDraft();
      await flushDirtyProgramSetCommits();
      setSelectedProgramExerciseId(programExerciseId);
      await loadProgramWorkout(programEntries, programExerciseId);
    },
    [
      flushDirtyProgramSetCommits,
      flushSessionNoteDraft,
      loadProgramWorkout,
      programEntries,
    ]
  );

  const handleOpenProgramSetInfo = useCallback(
    async (setId: number, calendarSetId: number) => {
      Keyboard.dismiss();

      await flushSessionNoteDraft();

      if (programDirtySetIdsRef.current.has(calendarSetId)) {
        await flushDirtyProgramSetCommits();
      }

      router.push({ pathname: "/set/[id]", params: { id: String(setId) } });
    },
    [flushDirtyProgramSetCommits, flushSessionNoteDraft]
  );

  const handleDateChange = useCallback(
    async (date: Date) => {
      const normalizedDate = normalizeDate(date);
      Keyboard.dismiss();

      await flushSessionNoteDraft();

      if (inProgramMode) {
        await flushDirtyProgramSetCommits();
      }

      setSelectedDate(normalizedDate);
      setShowDatePicker(false);

      if (!exerciseId || !workoutExerciseId || inProgramMode) {
        return;
      }

      const nextProgramEntries = await getProgrammedExercisesForExerciseOnDate({
        dateIso: toDateIso(normalizedDate),
        exerciseId,
        exerciseName: exerciseNameParam,
      });

      if (nextProgramEntries.length === 0) {
        await updateExerciseEntryDate(
          workoutExerciseId,
          normalizedDate.getTime()
        );
      }
    },
    [
      exerciseId,
      exerciseNameParam,
      flushDirtyProgramSetCommits,
      flushSessionNoteDraft,
      inProgramMode,
      workoutExerciseId,
    ]
  );

  const handleAddSet = useCallback(async () => {
    Keyboard.dismiss();
    const flushedSession = await flushSessionNoteDraft();
    let nextWorkoutId = flushedSession.workoutId ?? workoutId;
    let nextWorkoutExerciseId =
      flushedSession.workoutExerciseId ?? workoutExerciseId;
    let nextExerciseId = exerciseId;

    if (inProgramMode && activeProgramEntry && (!nextWorkoutId || !nextWorkoutExerciseId)) {
      const session = await ensureProgramWorkoutSession();
      if (!session) {
        return;
      }
      nextWorkoutId = session.workoutId;
      nextWorkoutExerciseId = session.workoutExerciseId;
      nextExerciseId = session.exerciseId;
    }

    if (!nextWorkoutId || !nextExerciseId || !nextWorkoutExerciseId) {
      return;
    }

    const weightValueKg = parseWeightInputToKg(weight, unitPreference);
    const repsValue = reps.trim() ? parseInt(reps, 10) : null;
    const noteValue = note.trim() || null;

    if (!weightValueKg || weightValueKg === 0 || !repsValue || repsValue === 0) {
      return;
    }

    const placeholder = sets.find((set) =>
      (set.note ?? "").startsWith("[PLANNED]")
    );

    if (placeholder) {
      const strippedNote =
        (placeholder.note ?? "").replace(/^\[PLANNED\]\s*/, "").trim() || null;
      const cleanNote = noteValue ?? strippedNote;
      await updateSet(placeholder.id, {
        weight_kg: weightValueKg,
        reps: repsValue,
        note: cleanNote,
        performed_at: selectedDate.getTime(),
      });
    } else {
      await addSet({
        workout_id: nextWorkoutId,
        exercise_id: nextExerciseId,
        workout_exercise_id: nextWorkoutExerciseId,
        weight_kg: weightValueKg,
        reps: repsValue,
        note: noteValue,
        set_index: nextSetIndex,
        performed_at: selectedDate.getTime(),
      });
    }

    setNote("");
    await loadRecordState();
    onHistoryRefresh?.();
  }, [
    activeProgramEntry,
    exerciseId,
    ensureProgramWorkoutSession,
    flushSessionNoteDraft,
    inProgramMode,
    loadRecordState,
    nextSetIndex,
    note,
    onHistoryRefresh,
    reps,
    selectedDate,
    sets,
    unitPreference,
    weight,
    workoutExerciseId,
    workoutId,
  ]);

  const confirmedSets = useMemo(
    () =>
      sets.filter(
        (set) =>
          !(set.note ?? "").startsWith("[PLANNED]") &&
          set.weightKg !== null &&
          set.reps !== null &&
          set.weightKg > 0 &&
          set.reps > 0
      ),
    [sets]
  );
  const hasConfirmedSets = confirmedSets.length > 0;
  const canCompleteProgramExercise =
    hasConfirmedSets || hasAnyCompleteProgramSet;

  const handleCompleteManualExercise = useCallback(async () => {
    const flushedSession = await flushSessionNoteDraft();
    const targetWorkoutExerciseId =
      flushedSession.workoutExerciseId ?? workoutExerciseId;

    if (!targetWorkoutExerciseId || !hasConfirmedSets) {
      return;
    }

    if (currentTimer) {
      await timerStore.deleteTimer(currentTimer.id);
    }

    const unconfirmedSets = sets.filter((set) =>
      (set.note ?? "").startsWith("[PLANNED]")
    );
    for (const set of unconfirmedSets) {
      await deleteSet(set.id);
    }

    await completeExerciseEntry(targetWorkoutExerciseId, selectedDate.getTime());
    onHistoryRefresh?.();
    router.back();
  }, [
    currentTimer,
    flushSessionNoteDraft,
    hasConfirmedSets,
    onHistoryRefresh,
    selectedDate,
    sets,
    workoutExerciseId,
  ]);

  const finalizeProgramExercise = useCallback(async () => {
    if (!activeProgramEntry || !canCompleteProgramExercise) {
      return;
    }

    setProgramCompleteModalVisible(false);
    Keyboard.dismiss();

    try {
      await flushSessionNoteDraft();
      await flushDirtyProgramSetCommits();

      let nextWorkoutExerciseId = workoutExerciseId;

      if (hasAnyCompleteProgramSet) {
        const result = await persistCompletedProgramExercise({
          calendarExerciseId: activeProgramEntry.calendarExercise.id,
          calendarExercise: activeProgramEntry.calendarExercise,
          exerciseName: activeProgramEntry.calendarExercise.exerciseName,
          sets: activeProgramEntry.sets,
          weightInputs: programWeightInputs,
          repsInputs: programRepsInputs,
          unitPreference,
          performedAt: selectedDate.getTime(),
        });
        nextWorkoutExerciseId = result.workoutExerciseId;
      }

      if (!nextWorkoutExerciseId) {
        throw new Error("Log at least one complete set before finishing the exercise.");
      }

      if (currentTimer) {
        await timerStore.deleteTimer(currentTimer.id);
      }

      if (!hasAnyCompleteProgramSet) {
        await completeExerciseEntry(nextWorkoutExerciseId, selectedDate.getTime());
      }
      await syncStatusesForCalendarExercise(activeProgramEntry.calendarExercise.id);
      await refreshUpcomingCalendarForProgram(activeProgramEntry.calendar.programId);
      onHistoryRefresh?.();
      router.back();
    } catch (error) {
      Alert.alert(
        "Save failed",
        error instanceof Error
          ? error.message
          : "The workout could not be saved to history."
      );
      await loadRecordState();
    }
  }, [
    activeProgramEntry,
    canCompleteProgramExercise,
    currentTimer,
    flushDirtyProgramSetCommits,
    flushSessionNoteDraft,
    hasAnyCompleteProgramSet,
    loadRecordState,
    onHistoryRefresh,
    programRepsInputs,
    programWeightInputs,
    selectedDate,
    unitPreference,
    workoutExerciseId,
  ]);

  const handleProgramCompletePress = useCallback(async () => {
    Keyboard.dismiss();

    if (!canCompleteProgramExercise) {
      return;
    }

    if (prescribedSets.length > 0 && !allPrescribedComplete) {
      setProgramCompleteModalVisible(true);
      return;
    }

    await finalizeProgramExercise();
  }, [
    allPrescribedComplete,
    canCompleteProgramExercise,
    finalizeProgramExercise,
    prescribedSets.length,
  ]);

  const handleTimerPress = useCallback(async () => {
    if (!exerciseId) {
      return;
    }

    if (currentTimer) {
      if (currentTimer.isRunning) {
        await timerStore.stopTimer(currentTimer.id);
      } else {
        await timerStore.startTimer(currentTimer.id);
      }
      return;
    }

    const mins = parseInt(timerMinutes, 10) || 1;
    const secs = parseInt(timerSeconds, 10) || 30;
    const totalSeconds = mins * 60 + secs;

    await setLastRestSeconds(exerciseId, totalSeconds);

    const timerId = await timerStore.createTimer(
      exerciseId,
      displayExerciseName,
      totalSeconds
    );
    await timerStore.startTimer(timerId);
  }, [
    currentTimer,
    displayExerciseName,
    exerciseId,
    timerMinutes,
    timerSeconds,
  ]);

  const handleSaveRestTime = useCallback(
    async (seconds: number) => {
      if (!exerciseId) {
        return;
      }
      await setLastRestSeconds(exerciseId, seconds);
    },
    [exerciseId]
  );

  const handleTimerLongPress = useCallback(() => {
    if (currentTimer) {
      const mins = Math.floor(currentTimer.durationSeconds / 60);
      const secs = currentTimer.durationSeconds % 60;
      setTimerMinutes(String(mins));
      setTimerSeconds(String(secs));
    }
    setTimerModalVisible(true);
  }, [currentTimer]);

  const handleRecordVideoPress = useCallback(async () => {
    if (!exerciseId) {
      return;
    }

    const flushedSession = await flushSessionNoteDraft();
    let nextWorkoutId = flushedSession.workoutId ?? workoutId;
    let nextWorkoutExerciseId =
      flushedSession.workoutExerciseId ?? workoutExerciseId;
    let nextExerciseId = exerciseId;

    if (inProgramMode && activeProgramEntry && (!nextWorkoutId || !nextWorkoutExerciseId)) {
      const session = await ensureProgramWorkoutSession();
      if (!session) {
        return;
      }
      nextWorkoutId = session.workoutId;
      nextWorkoutExerciseId = session.workoutExerciseId;
      nextExerciseId = session.exerciseId;
    }

    if (!nextWorkoutId || !nextWorkoutExerciseId || !nextExerciseId) {
      return;
    }

    router.push({
      pathname: "/exercise/record-video",
      params: {
        id: String(nextExerciseId),
        name: displayExerciseName,
        workoutId: String(nextWorkoutId),
        workoutExerciseId: String(nextWorkoutExerciseId),
        performedAt: String(selectedDate.getTime()),
        setIndex: String(nextSetIndex),
      },
    });
  }, [
    activeProgramEntry,
    displayExerciseName,
    ensureProgramWorkoutSession,
    exerciseId,
    flushSessionNoteDraft,
    inProgramMode,
    nextSetIndex,
    selectedDate,
    workoutExerciseId,
    workoutId,
  ]);

  const handleEditSetPress = useCallback((set: SetRow) => {
    setSelectedSet(set);
    setEditModalVisible(true);
  }, []);

  const handleSetPress = useCallback((setId: number) => {
    router.push({ pathname: "/set/[id]", params: { id: String(setId) } });
  }, []);

  const handleUpdateSet = useCallback(
    async (updates: {
      weight_kg: number;
      reps: number;
      note: string | null;
      performed_at?: number;
    }) => {
      if (!selectedSet) {
        return;
      }

      await updateSet(selectedSet.id, {
        weight_kg: updates.weight_kg,
        reps: updates.reps,
        note: updates.note,
        performed_at: updates.performed_at,
      });

      setEditModalVisible(false);
      setSelectedSet(null);
      await reloadRecordState();
      onHistoryRefresh?.();
    },
    [onHistoryRefresh, reloadRecordState, selectedSet]
  );

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmVisible(false);
    setDeleteTarget(null);
    setDeleteMediaChecked(false);
    setDeleteMediaAvailable(false);
    setDeleteMediaSetIds([]);
  }, []);

  const handleDeleteSetPress = useCallback(async (set: SetRow, displayIndex: number) => {
    setDeleteTarget({ set, displayIndex });
    setDeleteConfirmVisible(true);
    setDeleteMediaChecked(false);
    const mediaRows = await listMediaForSet(set.id);
    setDeleteMediaAvailable(mediaRows.length > 0);
    setDeleteMediaSetIds(mediaRows.length > 0 ? [set.id] : []);
  }, []);

  const handleConfirmDeleteSet = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }

    if (deleteMediaChecked && deleteMediaAvailable && deleteMediaSetIds.length > 0) {
      await deleteAssociatedMediaForSets(deleteMediaSetIds);
    }

    const linkedProgramSet = await getCalendarSetByWorkoutSetId(deleteTarget.set.id);
    await deleteSet(deleteTarget.set.id);

    if (linkedProgramSet?.isUserAdded) {
      await deleteUserSet(linkedProgramSet.id);
    }

    if (linkedProgramSet) {
      await syncStatusesForCalendarExercise(linkedProgramSet.calendarExerciseId);
    }

    closeDeleteConfirm();
    await reloadRecordState();
    onHistoryRefresh?.();
  }, [
    closeDeleteConfirm,
    deleteMediaAvailable,
    deleteMediaChecked,
    deleteMediaSetIds,
    deleteTarget,
    onHistoryRefresh,
    reloadRecordState,
  ]);

  const closeClearConfirm = useCallback(() => {
    setClearConfirmVisible(false);
    setClearMediaChecked(false);
    setClearMediaAvailable(false);
    setClearMediaSetIds([]);
  }, []);

  const handleOpenClearConfirm = useCallback(async () => {
    setClearConfirmVisible(true);
    setClearMediaChecked(false);
    const setIds = sets.map((set) => set.id).filter((id) => id > 0);
    setClearMediaSetIds(setIds);
    if (setIds.length === 0) {
      setClearMediaAvailable(false);
      return;
    }
    const mediaRows = await listMediaForSetIds(setIds);
    setClearMediaAvailable(mediaRows.length > 0);
  }, [sets]);

  const handleConfirmClearSets = useCallback(async () => {
    const setIds = sets.map((set) => set.id).filter((id) => id > 0);
    if (setIds.length === 0) {
      return;
    }

    if (clearMediaChecked && clearMediaAvailable && clearMediaSetIds.length > 0) {
      await deleteAssociatedMediaForSets(clearMediaSetIds);
    }

    const linkedProgramSets = await listCalendarSetsByWorkoutSetIds(setIds);
    const needsProgramAwareClear =
      inProgramMode || linkedProgramSets.some((set) => set.isUserAdded);

    if (needsProgramAwareClear) {
      for (const setId of setIds) {
        await deleteSet(setId);
      }

      for (const linkedProgramSet of linkedProgramSets) {
        if (linkedProgramSet.isUserAdded) {
          await deleteUserSet(linkedProgramSet.id);
        }
      }

      const calendarExerciseIds = [
        ...new Set(linkedProgramSets.map((set) => set.calendarExerciseId)),
      ];
      for (const calendarExerciseId of calendarExerciseIds) {
        await syncStatusesForCalendarExercise(calendarExerciseId);
      }
    } else if (workoutExerciseId) {
      await deleteSetsForWorkoutExercise(workoutExerciseId);
    }

    closeClearConfirm();
    await reloadRecordState();
    onHistoryRefresh?.();
  }, [
    clearMediaAvailable,
    clearMediaChecked,
    clearMediaSetIds,
    closeClearConfirm,
    inProgramMode,
    onHistoryRefresh,
    reloadRecordState,
    sets,
    workoutExerciseId,
  ]);

  const handleConfirmPlannedSet = useCallback(
    async (setItem: SetRow) => {
      const cleanNote =
        (setItem.note ?? "").replace(/^\[PLANNED\]\s*/, "").trim() || null;
      await updateSet(setItem.id, { note: cleanNote });
      await reloadRecordState();
      onHistoryRefresh?.();
    },
    [onHistoryRefresh, reloadRecordState]
  );

  if (!exerciseId) {
    return (
      <View className="flex-1 items-center justify-center p-4 bg-background">
        <Text className="text-base text-destructive" selectable>
          Invalid exercise ID
        </Text>
      </View>
    );
  }

  const renderSetItem = ({ item, index }: { item: SetRow; index: number }) => {
    const isPlanned = (item.note ?? "").startsWith("[PLANNED]");
    const displayNote = isPlanned
      ? (item.note ?? "").replace(/^\[PLANNED\]\s*/, "").trim() || null
      : item.note;

    return (
      <View style={isPlanned ? { opacity: 0.55 } : undefined}>
        <SetItem
          index={index + 1}
          weightKg={item.weightKg}
          reps={item.reps}
          note={isPlanned ? `${displayNote ? displayNote + " " : ""}(Planned)` : displayNote}
          onPress={() => handleSetPress(item.id)}
          rightActions={
            <View className="flex-row items-center gap-2 ml-2">
              {!inProgramMode && isPlanned && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm set ${index + 1}`}
                  hitSlop={8}
                  className="w-7 h-7 rounded-full items-center justify-center"
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    backgroundColor: rawColors.success + "20",
                    borderWidth: 1.5,
                    borderColor: rawColors.success,
                  })}
                  onPress={() => handleConfirmPlannedSet(item)}
                >
                  <MaterialCommunityIcons
                    name="check"
                    size={16}
                    color={rawColors.success}
                  />
                </Pressable>
              )}
              {setIdsWithMedia.has(item.id) && (
                <View className="w-7 h-7 rounded-full items-center justify-center bg-background">
                  <MaterialCommunityIcons
                    name="video-outline"
                    size={16}
                    color={rawColors.primary}
                  />
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit set ${index + 1}`}
                hitSlop={8}
                className="w-7 h-7 rounded-full items-center justify-center bg-background"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                onPress={() => handleEditSetPress(item)}
              >
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={16}
                  color={rawColors.primary}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete set ${index + 1}`}
                hitSlop={8}
                className="w-7 h-7 rounded-full items-center justify-center bg-background"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                onPress={() => handleDeleteSetPress(item, index + 1)}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={16}
                  color={rawColors.destructive}
                />
              </Pressable>
            </View>
          }
        />
      </View>
    );
  };

  const timerDisplayText = currentTimer
    ? formatTime(currentTimer.remainingSeconds)
    : formatTime(
        (parseInt(timerMinutes, 10) || 1) * 60 +
          (parseInt(timerSeconds, 10) || 30)
      );

  const canOpenCamera =
    !!exerciseId && (inProgramMode || (!!workoutId && !!workoutExerciseId));
  const handleToggleManualForm = () => {
    if (!inProgramMode) {
      return;
    }

    const nextExpanded = !isManualFormExpanded;
    setIsManualFormExpanded(nextExpanded);
    manualFormExpansion.value = nextExpanded ? 1 : 0;
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row justify-center mb-4">
          <Pressable
            className="flex-row items-center px-4 py-2.5 rounded-full border border-border bg-surface"
            style={{
              shadowColor: rawColors.shadow,
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.08,
              shadowRadius: 3,
              elevation: 2,
            }}
            onPress={() => setShowDatePicker(true)}
          >
            <MaterialCommunityIcons
              name="calendar"
              size={18}
              color={rawColors.primary}
            />
            <Text className="text-[15px] font-semibold mx-2 text-primary" selectable>
              {formatRelativeDate(selectedDate)}
            </Text>
            <MaterialCommunityIcons
              name="chevron-down"
              size={16}
              color={rawColors.foregroundSecondary}
            />
          </Pressable>
        </View>

        <View
          className={`rounded-2xl mb-4 bg-surface ${
            inProgramMode && !isManualFormExpanded ? "p-4" : "p-5"
          }`}
          style={{
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          {inProgramMode ? (
            <Pressable
              className="flex-row items-center justify-between"
              onPress={handleToggleManualForm}
            >
              <Text className="text-lg font-semibold text-foreground" selectable>
                Add Set
              </Text>
              <View className="flex-row items-center gap-2">
                <View className="px-3 py-1.5 rounded-full bg-primary-light">
                  <Text className="text-sm font-medium text-primary" selectable>
                    Set #{nextSetIndex}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name={isManualFormExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={rawColors.foregroundSecondary}
                />
              </View>
            </Pressable>
          ) : (
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-semibold text-foreground" selectable>
                Add Set
              </Text>
              <View className="flex-row items-center px-3 py-1.5 rounded-full bg-primary-light">
                <Text className="text-sm font-medium text-primary" selectable>
                  Set #{nextSetIndex}
                </Text>
              </View>
            </View>
          )}

          <Animated.View
            style={inProgramMode ? manualFormAnimatedStyle : undefined}
            pointerEvents={inProgramMode && !isManualFormExpanded ? "none" : "auto"}
          >
            <View className={inProgramMode ? "pt-4" : undefined}>
              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
                  <Text className="text-sm font-medium mb-2 text-foreground-secondary" selectable>
                    Weight ({getWeightUnitLabel(unitPreference)})
                  </Text>
                  <TextInput
                    className="border border-border rounded-xl p-3.5 text-base bg-surface-secondary text-foreground"
                    value={weight}
                    onChangeText={setWeight}
                    placeholder="0"
                    placeholderTextColor={rawColors.foregroundMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium mb-2 text-foreground-secondary" selectable>
                    Reps
                  </Text>
                  <TextInput
                    className="border border-border rounded-xl p-3.5 text-base bg-surface-secondary text-foreground"
                    value={reps}
                    onChangeText={setReps}
                    placeholder="0"
                    placeholderTextColor={rawColors.foregroundMuted}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium mb-2 text-foreground-secondary" selectable>
                  Set Note (Optional)
                </Text>
                <TextInput
                  className="border border-border rounded-xl p-3.5 text-base min-h-[70px] bg-surface-secondary text-foreground"
                  style={{ textAlignVertical: "top" }}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Add a set note..."
                  placeholderTextColor={rawColors.foregroundMuted}
                  multiline
                />
              </View>

              <View className="flex-row gap-3">
                <Pressable
                  className={`flex-row items-center justify-center px-4 h-[52px] rounded-xl border ${
                    currentTimer?.isRunning
                      ? "bg-primary border-primary"
                      : "bg-surface-secondary border-border"
                  }`}
                  onPress={handleTimerPress}
                  onLongPress={handleTimerLongPress}
                  delayLongPress={400}
                >
                  <MaterialCommunityIcons
                    name={currentTimer?.isRunning ? "pause" : "timer-outline"}
                    size={20}
                    color={
                      currentTimer?.isRunning
                        ? rawColors.primaryForeground
                        : rawColors.primary
                    }
                  />
                  <Text
                    className={`text-base font-semibold ml-2 ${
                      currentTimer?.isRunning
                        ? "text-primary-foreground"
                        : "text-primary"
                    }`}
                    selectable
                  >
                    {timerDisplayText}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Record video"
                  className="w-[52px] h-[52px] rounded-xl items-center justify-center border border-border bg-surface-secondary"
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.8 : canOpenCamera ? 1 : 0.5,
                  })}
                  onPress={handleRecordVideoPress}
                  disabled={!canOpenCamera}
                >
                  <MaterialCommunityIcons
                    name="video-outline"
                    size={22}
                    color={
                      canOpenCamera
                        ? rawColors.primary
                        : rawColors.foregroundMuted
                    }
                  />
                </Pressable>

                <Pressable
                  className="flex-1 flex-row items-center justify-center h-[52px] rounded-xl bg-primary"
                  style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                  onPress={handleAddSet}
                >
                  <MaterialCommunityIcons
                    name="plus"
                    size={20}
                    color={rawColors.primaryForeground}
                  />
                  <Text className="text-base font-semibold ml-1.5 text-primary-foreground" selectable>
                    Add Set
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>

        <View
          className="rounded-2xl p-5 bg-surface"
          style={{
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-semibold text-foreground" selectable>
              Recorded Sets
            </Text>
            {sets.length > 0 && (
              <View className="flex-row items-center px-3 py-1.5 rounded-full bg-surface-secondary">
                <MaterialCommunityIcons
                  name="dumbbell"
                  size={14}
                  color={rawColors.foregroundSecondary}
                />
                <Text className="text-sm font-medium ml-1.5 text-foreground-secondary" selectable>
                  {sets.length} {sets.length === 1 ? "set" : "sets"}
                </Text>
              </View>
            )}
          </View>

          {inProgramMode && activeProgramEntry && (
            <ProgrammedSetsPanel
              programEntries={programEntries}
              selectedProgramExerciseId={selectedProgramExerciseId}
              onSelectProgramExercise={handleSelectProgramExercise}
              prescribedSets={prescribedSets}
              userSets={userSets}
              weightInputs={programWeightInputs}
              repsInputs={programRepsInputs}
              onWeightChange={handleProgramWeightChange}
              onRepsChange={handleProgramRepsChange}
              onSetFocus={handleProgramSetFocus}
              onSetBlur={handleProgramSetBlur}
              onOpenSetInfo={handleOpenProgramSetInfo}
              setIdsWithMedia={setIdsWithMedia}
            />
          )}

          {displayedRecordedSets.length === 0 ? (
            <View className="items-center py-8">
              <View className="w-16 h-16 rounded-full items-center justify-center mb-4 bg-surface-secondary">
                <MaterialCommunityIcons
                  name="clipboard-outline"
                  size={28}
                  color={rawColors.foregroundMuted}
                />
              </View>
              <Text className="text-base font-medium text-foreground-secondary" selectable>
                {inProgramMode ? "No additional sets recorded yet" : "No sets recorded yet"}
              </Text>
              <Text className="text-sm text-center mt-1 text-foreground-muted" selectable>
                {inProgramMode
                  ? "Programmed rows are tracked above. Manual and off-program sets will appear below."
                  : "Add your first set using the form above."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={displayedRecordedSets}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderSetItem}
              scrollEnabled={false}
              nestedScrollEnabled
            />
          )}

          {sets.length > 0 && (
            <View className="flex-row justify-end mt-4">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear all recorded sets"
                className="flex-row items-center px-3 py-2 rounded-full bg-surface-secondary"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                onPress={handleOpenClearConfirm}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={16}
                  color={rawColors.destructive}
                />
                <Text className="text-sm font-semibold ml-1.5 text-destructive" selectable>
                  Clear
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <View
          className="rounded-2xl p-4 mt-4 bg-surface"
          style={{
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 6,
            elevation: 3,
          }}
        >
          <Text className="text-base font-semibold mb-3 text-foreground" selectable>
            Session Note (Optional)
          </Text>
          <TextInput
            className="border border-border rounded-xl p-3.5 text-base min-h-[88px] bg-surface-secondary text-foreground"
            style={{ textAlignVertical: "top" }}
            value={sessionNote}
            onChangeText={handleSessionNoteChange}
            onBlur={handleSessionNoteBlur}
            placeholder="Add a session note..."
            placeholderTextColor={rawColors.foregroundMuted}
            multiline
          />
        </View>
      </ScrollView>

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
        {inProgramMode ? (
          <Pressable
            className={`flex-row items-center justify-center py-4 rounded-xl ${
              !canCompleteProgramExercise ? "bg-surface-secondary" : "bg-primary"
            }`}
            style={({ pressed }) => ({
              opacity: pressed && canCompleteProgramExercise ? 0.8 : 1,
            })}
            onPress={handleProgramCompletePress}
            disabled={!canCompleteProgramExercise}
          >
            <MaterialCommunityIcons
              name="check-circle"
              size={22}
              color={
                !canCompleteProgramExercise
                  ? rawColors.foregroundMuted
                  : rawColors.primaryForeground
              }
            />
            <Text
              className={`text-base font-semibold ml-2 ${
                !canCompleteProgramExercise
                  ? "text-foreground-muted"
                  : "text-primary-foreground"
              }`}
              selectable
            >
              Complete Exercise
            </Text>
          </Pressable>
        ) : (
          <Pressable
            className={`flex-row items-center justify-center py-4 rounded-xl ${
              !hasConfirmedSets ? "bg-surface-secondary" : "bg-primary"
            }`}
            style={({ pressed }) => ({
              opacity: pressed && hasConfirmedSets ? 0.8 : 1,
            })}
            onPress={handleCompleteManualExercise}
            disabled={!hasConfirmedSets}
          >
            <MaterialCommunityIcons
              name="check-circle"
              size={22}
              color={
                !hasConfirmedSets
                  ? rawColors.foregroundMuted
                  : rawColors.primaryForeground
              }
            />
            <Text
              className={`text-base font-semibold ml-2 ${
                !hasConfirmedSets
                  ? "text-foreground-muted"
                  : "text-primary-foreground"
              }`}
              selectable
            >
              Complete Exercise
            </Text>
          </Pressable>
        )}
      </View>

      <DatePickerModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        value={selectedDate}
        onChange={handleDateChange}
      />

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

      <AppModal
        visible={deleteConfirmVisible}
        onClose={closeDeleteConfirm}
        maxWidth={380}
      >
        <Text className="text-xl font-bold mb-2 text-foreground" selectable>
          Delete set?
        </Text>
        <Text className="text-base mb-4 text-foreground-secondary" selectable>
          This action cannot be undone.
        </Text>

        {deleteTarget && (
          <View className="rounded-lg p-3 mb-5 bg-surface-secondary border border-border">
            <Text className="text-sm font-semibold text-foreground" selectable>
              Set #{deleteTarget.displayIndex}:{" "}
              {formatWeightFromKg(deleteTarget.set.weightKg, unitPreference)} x{" "}
              {deleteTarget.set.reps !== null
                ? String(deleteTarget.set.reps) + " reps"
                : "--"}
            </Text>
            {!!deleteTarget.set.note && (
              <Text
                className="text-sm mt-1 italic text-foreground-secondary"
                numberOfLines={2}
                selectable
              >
                {deleteTarget.set.note}
              </Text>
            )}
          </View>
        )}

        {deleteMediaAvailable && (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: deleteMediaChecked }}
            className="flex-row items-center mb-5"
            onPress={() => setDeleteMediaChecked((current) => !current)}
          >
            <MaterialCommunityIcons
              name={
                deleteMediaChecked
                  ? "checkbox-marked"
                  : "checkbox-blank-outline"
              }
              size={20}
              color={
                deleteMediaChecked
                  ? rawColors.primary
                  : rawColors.foregroundSecondary
              }
            />
            <Text className="text-sm font-medium ml-2 text-foreground" selectable>
              Delete associated media
            </Text>
          </Pressable>
        )}

        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
            onPress={closeDeleteConfirm}
          >
            <Text className="text-base font-semibold text-foreground-secondary" selectable>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center p-3.5 rounded-lg gap-1.5 bg-destructive"
            onPress={handleConfirmDeleteSet}
          >
            <MaterialCommunityIcons
              name="delete"
              size={20}
              color={rawColors.surface}
            />
            <Text className="text-base font-semibold text-primary-foreground" selectable>
              Delete
            </Text>
          </Pressable>
        </View>
      </AppModal>

      <AppModal
        visible={clearConfirmVisible}
        onClose={closeClearConfirm}
        maxWidth={380}
      >
        <Text className="text-xl font-bold mb-2 text-foreground" selectable>
          Clear sets?
        </Text>
        <Text className="text-base mb-4 text-foreground-secondary" selectable>
          This will remove all recorded sets. This action cannot be undone.
        </Text>

        <View className="rounded-lg p-3 mb-5 bg-surface-secondary border border-border">
          <Text className="text-sm font-semibold text-foreground" selectable>
            {sets.length} set{sets.length !== 1 ? "s" : ""} will be deleted
          </Text>
        </View>

        {clearMediaAvailable && (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: clearMediaChecked }}
            className="flex-row items-center mb-5"
            onPress={() => setClearMediaChecked((current) => !current)}
          >
            <MaterialCommunityIcons
              name={
                clearMediaChecked
                  ? "checkbox-marked"
                  : "checkbox-blank-outline"
              }
              size={20}
              color={
                clearMediaChecked
                  ? rawColors.primary
                  : rawColors.foregroundSecondary
              }
            />
            <Text className="text-sm font-medium ml-2 text-foreground" selectable>
              Delete associated media
            </Text>
          </Pressable>
        )}

        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
            onPress={closeClearConfirm}
          >
            <Text className="text-base font-semibold text-foreground-secondary" selectable>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center p-3.5 rounded-lg gap-1.5 bg-destructive"
            onPress={handleConfirmClearSets}
          >
            <MaterialCommunityIcons
              name="delete-sweep"
              size={20}
              color={rawColors.surface}
            />
            <Text className="text-base font-semibold text-primary-foreground" selectable>
              Clear
            </Text>
          </Pressable>
        </View>
      </AppModal>

      <AppModal
        visible={programCompleteModalVisible}
        onClose={() => setProgramCompleteModalVisible(false)}
      >
        <Text className="text-xl font-bold mb-3 text-foreground" selectable>
          Complete Exercise?
        </Text>
        <Text className="text-base mb-6 text-foreground-secondary" selectable>
          Some programmed sets are still incomplete. The completed sets will be
          saved to history and the remaining prescription will stay open.
        </Text>
        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
            onPress={() => setProgramCompleteModalVisible(false)}
          >
            <Text className="text-base font-semibold text-foreground-secondary" selectable>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-primary"
            onPress={finalizeProgramExercise}
          >
            <Text className="text-base font-semibold text-primary-foreground" selectable>
              Complete
            </Text>
          </Pressable>
        </View>
      </AppModal>

      <TimerModal
        visible={timerModalVisible}
        onClose={() => setTimerModalVisible(false)}
        exerciseId={exerciseId}
        exerciseName={displayExerciseName}
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
