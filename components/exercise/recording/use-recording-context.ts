import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useUnitPreference } from "../../../lib/contexts/UnitPreferenceContext";
import { appCapabilities } from "../../../lib/config/releaseProfile";
import { getExerciseById } from "../../../lib/db/exercises";
import { parseExerciseRouteId } from "../../../lib/routing/exerciseRouteId";
import { listMediaForSetIds } from "../../../lib/db/media";
import { type ProgrammedExerciseForDate } from "../../../lib/db/programCalendar";
import { updateWorkoutExerciseInputs, type SetRow, type Workout } from "../../../lib/db/workouts";
import { useWorkoutTheme } from "../../workouts/workout-theme";
import { getSelectedWorkoutId, subscribeWorkoutSelection } from "../../../lib/workouts/selection-store";
import { type Timer } from "../../../lib/timerStore";
import { parseWeightInputToKg } from "../../../lib/utils/units";
import { normalizeDate, toDateIso, pickProgrammedEntry } from "./recording-utils";

export function useRecordingContext(onHistoryRefresh?: () => void) {
  const { rawColors } = useWorkoutTheme();
  const selectedWorkoutId = useSyncExternalStore(subscribeWorkoutSelection, getSelectedWorkoutId, getSelectedWorkoutId);
  const recordIdentityRef = useRef(0);
  const recordLoadGenerationRef = useRef(0);
  const routeIdentityRef = useRef("");
  const [entryPerformedAt, setEntryPerformedAt] = useState<number | null>(null);
  const [entryCompletedAt, setEntryCompletedAt] = useState<number | null>(null);
  const [newEntryRequested, setNewEntryRequested] = useState(false);
  const [workout, setWorkout] = useState<Workout | null>(null);
  const entryIdRef = useRef<number | null>(null);
  const workoutOverrideRef = useRef<number | null>(null);
  const sessionCreationRef = useRef<{ identity: number; promise: Promise<{ workoutId: number; workoutExerciseId: number } | null> } | null>(null);

  const { unitPreference } = useUnitPreference();

  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    weId?: string;
    workoutId?: string;
    plannedDate?: string;
    dateIso?: string;
    programExerciseId?: string;
  }>();

  const routeIdentity = [params.id, params.weId, params.workoutId, params.programExerciseId, params.dateIso].join(":");
  if (routeIdentityRef.current !== routeIdentity) {
    routeIdentityRef.current = routeIdentity;
    recordIdentityRef.current += 1;
  }

  const exerciseId = parseExerciseRouteId(params.id);

  const exerciseNameParam =
    typeof params.name === "string" ? params.name : "Exercise";

  const paramWeId =
    typeof params.weId === "string" ? parseInt(params.weId, 10) : null;

  const paramWorkoutId = parseExerciseRouteId(params.workoutId);

  useEffect(() => { entryIdRef.current = null; workoutOverrideRef.current = null; setNewEntryRequested(false); setEntryCompletedAt(null); }, [params.id, params.weId, params.workoutId]);

  const programsExperienceEnabled = appCapabilities.programsExperience === "enabled";

  const paramPlannedDate =
    programsExperienceEnabled && typeof params.plannedDate === "string"
      ? parseInt(params.plannedDate, 10)
      : null;

  const paramProgramExerciseId =
    programsExperienceEnabled && typeof params.programExerciseId === "string"
      ? parseInt(params.programExerciseId, 10)
      : null;

  const paramDateIso =
    programsExperienceEnabled && typeof params.dateIso === "string"
      ? params.dateIso
      : null;

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

  const [validatedExerciseId, setValidatedExerciseId] = useState<number | null>(null);

  const [exerciseStatus, setExerciseStatus] = useState<"loading" | "available" | "unavailable" | "error">(
    exerciseId ? "loading" : "unavailable"
  );

  const [validationAttempt, setValidationAttempt] = useState(0);

  const [recordLoadError, setRecordLoadError] = useState<string | null>(null);

  const [workoutExerciseId, setWorkoutExerciseId] = useState<number | null>(
    null
  );

  const [sets, setSets] = useState<SetRow[]>([]);

  const [weight, setWeightState] = useState("");

  const [reps, setRepsState] = useState("");

  const [note, setNote] = useState("");

  const [legacyEntryNote, setLegacyEntryNote] = useState("");

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

  const persistDirtyProgramSetCommitsOnBlurRef = useRef<
    () => Promise<void>
  >(async () => { });

  const commitProgramSetChangesRef = useRef<
    (
      setId: number,
      options?: { skipReload?: boolean; suppressUiUpdate?: boolean }
    ) => Promise<void>
  >(async () => { });

  const exerciseValidationGenerationRef = useRef(0);

  const focusGenerationRef = useRef(0);

  const activeFocusGenerationRef = useRef<number | null>(null);

  const currentExerciseIdRef = useRef<number | null>(exerciseId);

  const isExerciseAvailableRef = useRef(false);

  currentExerciseIdRef.current = exerciseId;

  const selectedDateIso = useMemo(() => toDateIso(selectedDate), [selectedDate]);
  const programDateIso = useMemo(() => toDateIso(initialSelectedDate), [initialSelectedDate]);

  const isExerciseAvailable =
    exerciseStatus === "available" && validatedExerciseId === exerciseId;

  isExerciseAvailableRef.current = isExerciseAvailable;

  const isInitializationCurrent = useCallback(
    (id: number | null, focusGeneration: number | null) =>
      id !== null &&
      focusGeneration !== null &&
      activeFocusGenerationRef.current === focusGeneration &&
      isExerciseAvailableRef.current &&
      currentExerciseIdRef.current === id,
    []
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void validationAttempt;
      const generation = exerciseValidationGenerationRef.current + 1;
      const focusGeneration = focusGenerationRef.current + 1;
      exerciseValidationGenerationRef.current = generation;
      focusGenerationRef.current = focusGeneration;
      activeFocusGenerationRef.current = focusGeneration;
      isExerciseAvailableRef.current = false;

      if (!exerciseId) {
        setValidatedExerciseId(null);
        setExerciseStatus("unavailable");
        setRecordLoadError(null);
        return () => {
          cancelled = true;
        };
      }

      setValidatedExerciseId(null);
      setExerciseStatus("loading");
      setRecordLoadError(null);

      void getExerciseById(exerciseId)
        .then((exercise) => {
          if (
            cancelled ||
            exerciseValidationGenerationRef.current !== generation ||
            activeFocusGenerationRef.current !== focusGeneration ||
            currentExerciseIdRef.current !== exerciseId
          ) {
            return;
          }

          if (!exercise) {
            setValidatedExerciseId(null);
            setExerciseStatus("unavailable");
            return;
          }

          setValidatedExerciseId(exerciseId);
          setExerciseStatus("available");
        })
        .catch(() => {
          if (
            !cancelled &&
            exerciseValidationGenerationRef.current === generation &&
            activeFocusGenerationRef.current === focusGeneration &&
            currentExerciseIdRef.current === exerciseId
          ) {
            setValidatedExerciseId(null);
            setExerciseStatus("error");
          }
        });

      return () => {
        cancelled = true;
        if (activeFocusGenerationRef.current === focusGeneration) {
          activeFocusGenerationRef.current = null;
          isExerciseAvailableRef.current = false;
        }
      };
    }, [exerciseId, validationAttempt])
  );

  const activeProgramEntry = useMemo(
    () =>
      programsExperienceEnabled
        ? pickProgrammedEntry(programEntries, selectedProgramExerciseId)
        : null,
    [programEntries, programsExperienceEnabled, selectedProgramExerciseId]
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

  const setWeight = useCallback(
    (value: string) => {
      setWeightState(value);
      if (workoutExerciseId && isExerciseAvailableRef.current) {
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
      if (workoutExerciseId && isExerciseAvailableRef.current) {
        const numValue = value.trim() ? parseInt(value, 10) : null;
        void updateWorkoutExerciseInputs(workoutExerciseId, {
          currentReps: numValue,
        });
      }
    },
    [workoutExerciseId]
  );

  const confirmedSets = useMemo(
    () =>
      sets.filter(
        (set) =>
          !(set.note ?? "").startsWith("[PLANNED]") &&
          set.weightKg !== null &&
          set.reps !== null &&
          Number.isFinite(set.weightKg) &&
          set.weightKg >= 0 &&
          set.reps > 0
      ),
    [sets]
  );

  const hasConfirmedSets = confirmedSets.length > 0;
  const applyLoadedSessionNote = useCallback((_id: number | null, note: string | null | undefined) => setLegacyEntryNote(note ?? ""), []);
  return {
    recordIdentityRef, recordLoadGenerationRef, entryPerformedAt, setEntryPerformedAt,
    entryCompletedAt,
    setEntryCompletedAt,
    newEntryRequested,
    setNewEntryRequested,
    programDateIso,
    selectedWorkoutId,
    workout,
    setWorkout,
    entryIdRef,
    workoutOverrideRef,
    sessionCreationRef,
    paramWorkoutId,
    rawColors,
    unitPreference,
    params,
    exerciseId,
    exerciseNameParam,
    paramWeId,
    programsExperienceEnabled,
    paramPlannedDate,
    paramProgramExerciseId,
    paramDateIso,
    initialSelectedDate,
    workoutId,
    setWorkoutId,
    validatedExerciseId,
    setValidatedExerciseId,
    exerciseStatus,
    setExerciseStatus,
    validationAttempt,
    setValidationAttempt,
    recordLoadError,
    setRecordLoadError,
    workoutExerciseId,
    setWorkoutExerciseId,
    sets,
    setSets,
    weight,
    setWeightState,
    reps,
    setRepsState,
    note,
    setNote,
    legacyEntryNote,
    setLegacyEntryNote,
    editModalVisible,
    setEditModalVisible,
    selectedSet,
    setSelectedSet,
    deleteConfirmVisible,
    setDeleteConfirmVisible,
    deleteTarget,
    setDeleteTarget,
    deleteMediaChecked,
    setDeleteMediaChecked,
    deleteMediaAvailable,
    setDeleteMediaAvailable,
    deleteMediaSetIds,
    setDeleteMediaSetIds,
    clearConfirmVisible,
    setClearConfirmVisible,
    clearMediaChecked,
    setClearMediaChecked,
    clearMediaAvailable,
    setClearMediaAvailable,
    clearMediaSetIds,
    setClearMediaSetIds,
    setIdsWithMedia,
    setSetIdsWithMedia,
    timerModalVisible,
    setTimerModalVisible,
    currentTimer,
    setCurrentTimer,
    timerMinutes,
    setTimerMinutes,
    timerSeconds,
    setTimerSeconds,
    selectedDate,
    setSelectedDate,
    showDatePicker,
    setShowDatePicker,
    programEntries,
    setProgramEntries,
    selectedProgramExerciseId,
    setSelectedProgramExerciseId,
    programWeightInputs,
    setProgramWeightInputs,
    programRepsInputs,
    setProgramRepsInputs,
    setEditingProgramSetIds,
    isManualFormExpanded,
    setIsManualFormExpanded,
    programCompleteModalVisible,
    setProgramCompleteModalVisible,
    programDirtySetIdsRef,
    programFocusCountsRef,
    programBlurTimeoutsRef,
    programAutosaveTimeoutsRef,
    programWeightInputsRef,
    programRepsInputsRef,
    persistDirtyProgramSetCommitsOnBlurRef,
    commitProgramSetChangesRef,
    exerciseValidationGenerationRef,
    focusGenerationRef,
    activeFocusGenerationRef,
    currentExerciseIdRef,
    isExerciseAvailableRef,
    selectedDateIso,
    isExerciseAvailable,
    isInitializationCurrent,
    activeProgramEntry,
    inProgramMode,
    manualFormExpansion,
    prescribedSets,
    userSets,
    displayExerciseName,
    nextSetIndex,
    hiddenProgramSetIds,
    displayedRecordedSets,
    clearProgramInteractionState,
    manualFormAnimatedStyle,
    setWeight,
    setReps,
    confirmedSets,
    hasConfirmedSets,
    applyLoadedSessionNote,
    onHistoryRefresh,
  };
}

export type RecordingContextController = ReturnType<typeof useRecordingContext>;
