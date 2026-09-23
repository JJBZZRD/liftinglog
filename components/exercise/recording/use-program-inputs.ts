import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect } from "react";
import { Alert, Keyboard } from "react-native";
import { syncStatusesForCalendarExercise } from "../../../lib/db/programCalendar";
import { completeExerciseEntry } from "../../../lib/db/workouts";
import { persistCompletedProgramExercise } from "../../../lib/programs/programExerciseHistory";
import { refreshUpcomingCalendarForProgram } from "../../../lib/programs/psl/programRuntime";
import { timerStore } from "../../../lib/timerStore";
import { parseWeightInputToKg } from "../../../lib/utils/units";
import type { RecordingContextController } from "./use-recording-context";
import type { RecordingSessionController } from "./use-recording-session";
import type { ProgramPersistenceController } from "./use-program-persistence";

export function useProgramInputs(context: Pick<RecordingContextController & RecordingSessionController & ProgramPersistenceController,
  "waitForProgramCommits" |
  "unitPreference" |
  "workoutExerciseId" |
  "currentTimer" |
  "selectedDate" |
  "programEntries" |
  "setSelectedProgramExerciseId" |
  "programWeightInputs" |
  "setProgramWeightInputs" |
  "programRepsInputs" |
  "setProgramRepsInputs" |
  "setEditingProgramSetIds" |
  "setProgramCompleteModalVisible" |
  "programDirtySetIdsRef" |
  "programFocusCountsRef" |
  "programBlurTimeoutsRef" |
  "programAutosaveTimeoutsRef" |
  "programWeightInputsRef" |
  "programRepsInputsRef" |
  "persistDirtyProgramSetCommitsOnBlurRef" |
  "commitProgramSetChangesRef" |
  "activeFocusGenerationRef" |
  "activeProgramEntry" |
  "prescribedSets" |
  "hasConfirmedSets" |
  "onHistoryRefresh" |
  "loadProgramWorkout" |
  "loadRecordState" |
  "reloadRecordState" |
  "isProgramInputPairComplete" |
  "findProgramSetContext" |
  "allPrescribedComplete" |
  "hasAnyCompleteProgramSet" |
  "commitProgramSetChanges"
>) {
  const {
    waitForProgramCommits,
    unitPreference,
    workoutExerciseId,
    currentTimer,
    selectedDate,
    programEntries,
    setSelectedProgramExerciseId,
    programWeightInputs,
    setProgramWeightInputs,
    programRepsInputs,
    setProgramRepsInputs,
    setEditingProgramSetIds,
    setProgramCompleteModalVisible,
    programDirtySetIdsRef,
    programFocusCountsRef,
    programBlurTimeoutsRef,
    programAutosaveTimeoutsRef,
    programWeightInputsRef,
    programRepsInputsRef,
    persistDirtyProgramSetCommitsOnBlurRef,
    commitProgramSetChangesRef,
    activeFocusGenerationRef,
    activeProgramEntry,
    prescribedSets,
    hasConfirmedSets,
    onHistoryRefresh,
    loadProgramWorkout,
    loadRecordState,
    reloadRecordState,
    isProgramInputPairComplete,
    findProgramSetContext,
    allPrescribedComplete,
    hasAnyCompleteProgramSet,
    commitProgramSetChanges,
  } = context;
  useEffect(() => {
    return () => {
      // Cancel timers without erasing dirty inputs: the focus cleanup below persists them.
      for (const timer of Object.values(programBlurTimeoutsRef.current)) clearTimeout(timer);
      for (const timer of Object.values(programAutosaveTimeoutsRef.current)) clearTimeout(timer);
    };
  }, [programBlurTimeoutsRef, programAutosaveTimeoutsRef]);

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
    [
      commitProgramSetChangesRef,
      findProgramSetContext,
      programAutosaveTimeoutsRef,
      programDirtySetIdsRef,
      programRepsInputsRef,
      programWeightInputsRef,
      unitPreference,
    ]
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
    [programDirtySetIdsRef, programWeightInputsRef, scheduleProgramSetAutosave, setProgramWeightInputs]
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
    [programDirtySetIdsRef, programRepsInputsRef, scheduleProgramSetAutosave, setProgramRepsInputs]
  );

  const handleProgramSetAutofill = useCallback(
    async (
      setId: number,
      values: {
        weight: string;
        reps: string;
      }
    ) => {
      const nextWeight = values.weight.trim();
      const nextReps = values.reps.trim();

      if (!nextWeight || !nextReps) {
        return;
      }

      Keyboard.dismiss();

      programWeightInputsRef.current = {
        ...programWeightInputsRef.current,
        [setId]: nextWeight,
      };
      programRepsInputsRef.current = {
        ...programRepsInputsRef.current,
        [setId]: nextReps,
      };
      setProgramWeightInputs((current) => ({
        ...current,
        [setId]: nextWeight,
      }));
      setProgramRepsInputs((current) => ({
        ...current,
        [setId]: nextReps,
      }));

      if (!isProgramInputPairComplete(nextWeight, nextReps)) {
        return;
      }

      programDirtySetIdsRef.current.add(setId);
      await commitProgramSetChanges(setId, { skipReload: true });
    },
    [
      commitProgramSetChanges,
      isProgramInputPairComplete,
      programDirtySetIdsRef,
      programRepsInputsRef,
      programWeightInputsRef,
      setProgramRepsInputs,
      setProgramWeightInputs,
    ]
  );

  const flushDirtyProgramSetCommits = useCallback(async () => {
    await waitForProgramCommits();
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
  }, [
    commitProgramSetChanges,
    programAutosaveTimeoutsRef,
    programBlurTimeoutsRef,
    programDirtySetIdsRef,
    programFocusCountsRef,
    reloadRecordState,
    setEditingProgramSetIds,
    waitForProgramCommits,
  ]);

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
  }, [
    commitProgramSetChanges,
    onHistoryRefresh,
    programAutosaveTimeoutsRef,
    programBlurTimeoutsRef,
    programDirtySetIdsRef,
    programFocusCountsRef,
  ]);

  useEffect(() => {
    persistDirtyProgramSetCommitsOnBlurRef.current =
      persistDirtyProgramSetCommitsOnBlur;
  }, [persistDirtyProgramSetCommitsOnBlur, persistDirtyProgramSetCommitsOnBlurRef]);

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
  }, [programAutosaveTimeoutsRef, programBlurTimeoutsRef, programFocusCountsRef, setEditingProgramSetIds]);

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
    [
      commitProgramSetChanges,
      programAutosaveTimeoutsRef,
      programBlurTimeoutsRef,
      programDirtySetIdsRef,
      programFocusCountsRef,
      setEditingProgramSetIds,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        void persistDirtyProgramSetCommitsOnBlurRef.current();
      };
    }, [persistDirtyProgramSetCommitsOnBlurRef])
  );

  const handleSelectProgramExercise = useCallback(
    async (programExerciseId: number) => {
      Keyboard.dismiss();
      await flushDirtyProgramSetCommits();
      setSelectedProgramExerciseId(programExerciseId);
      await loadProgramWorkout(
        programEntries,
        programExerciseId,
        activeFocusGenerationRef.current
      );
    },
    [activeFocusGenerationRef, flushDirtyProgramSetCommits, loadProgramWorkout, programEntries, setSelectedProgramExerciseId]
  );

  const handleOpenProgramSetInfo = useCallback(
    async (setId: number, calendarSetId: number) => {
      Keyboard.dismiss();

      if (programDirtySetIdsRef.current.has(calendarSetId)) {
        await flushDirtyProgramSetCommits();
      }

      router.push({ pathname: "/set/[id]", params: { id: String(setId) } });
    },
    [flushDirtyProgramSetCommits, programDirtySetIdsRef]
  );

  const canCompleteProgramExercise =
    hasConfirmedSets || hasAnyCompleteProgramSet;

  const finalizeProgramExercise = useCallback(async () => {
    if (!activeProgramEntry || !canCompleteProgramExercise) {
      return;
    }

    setProgramCompleteModalVisible(false);
    Keyboard.dismiss();

    try {
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
    hasAnyCompleteProgramSet,
    loadRecordState,
    onHistoryRefresh,
    programRepsInputs,
    programWeightInputs,
    selectedDate,
    setProgramCompleteModalVisible,
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
  }, [allPrescribedComplete, canCompleteProgramExercise, finalizeProgramExercise, prescribedSets.length, setProgramCompleteModalVisible]);
  return {
    scheduleProgramSetAutosave,
    handleProgramWeightChange,
    handleProgramRepsChange,
    handleProgramSetAutofill,
    flushDirtyProgramSetCommits,
    persistDirtyProgramSetCommitsOnBlur,
    handleProgramSetFocus,
    handleProgramSetBlur,
    handleSelectProgramExercise,
    handleOpenProgramSetInfo,
    canCompleteProgramExercise,
    finalizeProgramExercise,
    handleProgramCompletePress,
  };
}

export type ProgramInputsController = ReturnType<typeof useProgramInputs>;
