import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  deleteUserSet,
  getCalendarSetById,
  syncStatusesForCalendarExercise,
  updateSetActuals,
  type ProgramCalendarSetRow,
} from "../../../lib/db/programCalendar";
import { deleteSet } from "../../../lib/db/workouts";
import { persistProgramSetToWorkoutHistory } from "../../../lib/programs/programExerciseHistory";
import { parseWeightInputToKg } from "../../../lib/utils/units";
import { hasLoggedProgramSet } from "./recording-utils";
import type { RecordingContextController } from "./use-recording-context";
import type { RecordingSessionController } from "./use-recording-session";

export function useProgramPersistence(context: Pick<RecordingContextController & RecordingSessionController,
  "recordIdentityRef" |
  "unitPreference" |
  "workoutExerciseId" |
  "selectedDate" |
  "programEntries" |
  "setProgramEntries" |
  "programWeightInputs" |
  "setProgramWeightInputs" |
  "programRepsInputs" |
  "setProgramRepsInputs" |
  "programDirtySetIdsRef" |
  "programFocusCountsRef" |
  "programAutosaveTimeoutsRef" |
  "programWeightInputsRef" |
  "programRepsInputsRef" |
  "commitProgramSetChangesRef" |
  "prescribedSets" |
  "userSets" |
  "onHistoryRefresh" |
  "reloadRecordState" |
  "refreshWorkoutSets"
>) {
  const {
    recordIdentityRef,
    unitPreference,
    workoutExerciseId,
    selectedDate,
    programEntries,
    setProgramEntries,
    programWeightInputs,
    setProgramWeightInputs,
    programRepsInputs,
    setProgramRepsInputs,
    programDirtySetIdsRef,
    programFocusCountsRef,
    programAutosaveTimeoutsRef,
    programWeightInputsRef,
    programRepsInputsRef,
    commitProgramSetChangesRef,
    prescribedSets,
    userSets,
    onHistoryRefresh,
    reloadRecordState,
    refreshWorkoutSets,
  } = context;
  const isProgramInputPairComplete = useCallback(
    (weightValue: string, repsValue: string) => {
      const trimmedWeight = weightValue.trim();
      const trimmedReps = repsValue.trim();

      if (!trimmedWeight || !trimmedReps) {
        return false;
      }

      const parsedWeight = parseFloat(trimmedWeight);
      const parsedReps = parseInt(trimmedReps, 10);

      return (
        Number.isFinite(parsedWeight) &&
        parsedWeight > 0 &&
        Number.isFinite(parsedReps) &&
        parsedReps > 0
      );
    },
    []
  );

  const isProgramSetInputComplete = useCallback(
    (setId: number) =>
      isProgramInputPairComplete(
        programWeightInputs[setId] ?? "",
        programRepsInputs[setId] ?? ""
      ),
    [isProgramInputPairComplete, programRepsInputs, programWeightInputs]
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
  }, [programRepsInputsRef, programWeightInputsRef, setProgramRepsInputs, setProgramWeightInputs]);

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
    [setProgramEntries]
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

  const persistProgramSetChanges = useCallback(
    async (
      setId: number,
      options?: { skipReload?: boolean; suppressUiUpdate?: boolean; weightInput?: string; repsInput?: string; identity?: number }
    ) => {
      const autosaveTimeoutId = programAutosaveTimeoutsRef.current[setId];
      if (autosaveTimeoutId) {
        clearTimeout(autosaveTimeoutId);
        delete programAutosaveTimeoutsRef.current[setId];
      }

      if (!programDirtySetIdsRef.current.has(setId) && options?.weightInput === undefined) {
        return;
      }

      const context = findProgramSetContext(setId);
      if (!context) {
        programDirtySetIdsRef.current.delete(setId);
        return;
      }

      const latestCalendarSet = (await getCalendarSetById(setId)) ?? context.set;
      const weightInput = options?.weightInput ?? programWeightInputsRef.current[setId] ?? "";
      const repsInput = options?.repsInput ?? programRepsInputsRef.current[setId] ?? "";
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
      let saved = false;

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
        saved = true;

        if (options?.suppressUiUpdate || (options?.identity != null && options.identity !== recordIdentityRef.current) ||
          (programWeightInputsRef.current[setId] ?? "") !== weightInput || (programRepsInputsRef.current[setId] ?? "") !== repsInput) {
          return;
        }

        const shouldReload =
          !options?.skipReload &&
          programDirtySetIdsRef.current.size === 1 &&
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
          if (options?.identity != null && options.identity !== recordIdentityRef.current) return;
          if (refreshedCalendarSet) {
            updateProgramSetInEntries(setId, refreshedCalendarSet);
          }
        }

        if (nextWorkoutExerciseId) {
          if (options?.identity != null && options.identity !== recordIdentityRef.current) return;
          await refreshWorkoutSets(nextWorkoutExerciseId);
        }
        onHistoryRefresh?.();
      } finally {
        if (saved && (programWeightInputsRef.current[setId] ?? "") === weightInput &&
          (programRepsInputsRef.current[setId] ?? "") === repsInput) {
          programDirtySetIdsRef.current.delete(setId);
        }
      }
    },
    [
      clearProgramInputState,
      findProgramSetContext,
      onHistoryRefresh,
      programAutosaveTimeoutsRef,
      programDirtySetIdsRef,
      programFocusCountsRef,
      programRepsInputsRef,
      programWeightInputsRef,
      recordIdentityRef,
      refreshWorkoutSets,
      reloadRecordState,
      selectedDate,
      unitPreference,
      updateProgramSetInEntries,
      workoutExerciseId,
    ]
  );

  // Program rows share an entry: serialize first-set creation across rows as well
  // as coalescing blur, autosave and assignment flushes for the same row.
  const commitTailRef = useRef<Promise<void>>(Promise.resolve());
  const inFlightCommitsRef = useRef(new Map<number, Promise<void>>());
  const commitProgramSetChanges = useCallback(async function commit(
    setId: number, options?: { skipReload?: boolean; suppressUiUpdate?: boolean }
  ): Promise<void> {
    const existing = inFlightCommitsRef.current.get(setId);
    if (existing) {
      await existing;
      if (programDirtySetIdsRef.current.has(setId)) await commit(setId, options);
      return;
    }
    if (!programDirtySetIdsRef.current.has(setId)) return;
    const snapshot = {
      ...options,
      weightInput: programWeightInputsRef.current[setId] ?? "",
      repsInput: programRepsInputsRef.current[setId] ?? "",
      identity: recordIdentityRef.current,
    };
    const write = commitTailRef.current.then(() => persistProgramSetChanges(setId, snapshot));
    commitTailRef.current = write.catch(() => { });
    inFlightCommitsRef.current.set(setId, write);
    try { await write; } finally {
      if (inFlightCommitsRef.current.get(setId) === write) inFlightCommitsRef.current.delete(setId);
    }
  }, [persistProgramSetChanges, programDirtySetIdsRef, programWeightInputsRef, programRepsInputsRef, recordIdentityRef]);

  const waitForProgramCommits = useCallback(async () => {
    while (inFlightCommitsRef.current.size > 0) {
      await Promise.all([...inFlightCommitsRef.current.values()]);
    }
  }, []);

  useEffect(() => {
    commitProgramSetChangesRef.current = commitProgramSetChanges;
  }, [commitProgramSetChanges, commitProgramSetChangesRef]);
  return {
    isProgramInputPairComplete,
    isProgramSetInputComplete,
    isProgramSetReadyForCompletion,
    findProgramSetContext,
    clearProgramInputState,
    updateProgramSetInEntries,
    allPrescribedComplete,
    hasAnyCompleteProgramSet,
    commitProgramSetChanges,
    waitForProgramCommits,
  };
}

export type ProgramPersistenceController = ReturnType<typeof useProgramPersistence>;
