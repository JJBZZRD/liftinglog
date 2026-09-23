import { getWorkoutSessionDetail } from "../../../lib/db/workoutSessions";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { getLastRestSeconds } from "../../../lib/db/exercises";
import {
  getProgrammedExercisesForExerciseOnDate,
  resolveWorkoutExerciseIdForCalendarExercise,
  type ProgrammedExerciseForDate,
} from "../../../lib/db/programCalendar";
import {
  addWorkoutExercise,
  getOpenWorkoutExercise,
  getActiveWorkout,
  getWorkoutById,
  getWorkoutExerciseById,
  listSetsForWorkoutExercise,
} from "../../../lib/db/workouts";
import { ensureProgramExerciseWorkoutSession } from "../../../lib/programs/programExerciseHistory";
import { formatEditableWeightFromKg } from "../../../lib/utils/units";
import { normalizeDate, pickProgrammedEntry } from "./recording-utils";
import type { RecordingContextController } from "./use-recording-context";

export function useRecordingSession(context: Pick<RecordingContextController,
  "recordIdentityRef" | "recordLoadGenerationRef" | "setEntryPerformedAt" |
  "setEntryCompletedAt" |
  "newEntryRequested" |
  "setNewEntryRequested" |
  "programDateIso" |
  "selectedWorkoutId" |
  "setWorkout" |
  "entryIdRef" |
  "workoutOverrideRef" |
  "sessionCreationRef" |
  "paramWorkoutId" |
  "unitPreference" |
  "exerciseId" |
  "exerciseNameParam" |
  "paramWeId" |
  "programsExperienceEnabled" |
  "paramProgramExerciseId" |
  "workoutId" |
  "setWorkoutId" |
  "exerciseStatus" |
  "setValidationAttempt" |
  "setRecordLoadError" |
  "setWorkoutExerciseId" |
  "setSets" |
  "setWeightState" |
  "setRepsState" |
  "setTimerMinutes" |
  "setTimerSeconds" |
  "selectedDate" |
  "setSelectedDate" |
  "setProgramEntries" |
  "selectedProgramExerciseId" |
  "setSelectedProgramExerciseId" |
  "setProgramWeightInputs" |
  "setProgramRepsInputs" |
  "programWeightInputsRef" |
  "programRepsInputsRef" |
  "activeFocusGenerationRef" |
  "isExerciseAvailableRef" |
  "isExerciseAvailable" |
  "isInitializationCurrent" |
  "activeProgramEntry" |
  "clearProgramInteractionState" |
  "applyLoadedSessionNote"
>) {
  const {
    recordIdentityRef, recordLoadGenerationRef, setEntryPerformedAt,
    setEntryCompletedAt,
    newEntryRequested,
    setNewEntryRequested,
    programDateIso,
    selectedWorkoutId,
    setWorkout,
    entryIdRef,
    workoutOverrideRef,
    sessionCreationRef,
    paramWorkoutId,
    unitPreference,
    exerciseId,
    exerciseNameParam,
    paramWeId,
    programsExperienceEnabled,
    paramProgramExerciseId,
    workoutId,
    setWorkoutId,
    exerciseStatus,
    setValidationAttempt,
    setRecordLoadError,
    setWorkoutExerciseId,
    setSets,
    setWeightState,
    setRepsState,
    setTimerMinutes,
    setTimerSeconds,
    selectedDate,
    setSelectedDate,
    setProgramEntries,
    selectedProgramExerciseId,
    setSelectedProgramExerciseId,
    setProgramWeightInputs,
    setProgramRepsInputs,
    programWeightInputsRef,
    programRepsInputsRef,
    activeFocusGenerationRef,
    isExerciseAvailableRef,
    isExerciseAvailable,
    isInitializationCurrent,
    activeProgramEntry,
    clearProgramInteractionState,
    applyLoadedSessionNote,
  } = context;
  const loadLastRestTime = useCallback(async (focusGeneration = activeFocusGenerationRef.current) => {
    if (!isInitializationCurrent(exerciseId, focusGeneration)) {
      return;
    }
    const lastRest = await getLastRestSeconds(exerciseId!);
    if (
      isInitializationCurrent(exerciseId, focusGeneration) &&
      lastRest !== null &&
      lastRest > 0
    ) {
      const mins = Math.floor(lastRest / 60);
      const secs = lastRest % 60;
      setTimerMinutes(String(mins));
      setTimerSeconds(String(secs));
    }
  }, [activeFocusGenerationRef, exerciseId, isInitializationCurrent, setTimerMinutes, setTimerSeconds]);

  // Only an explicit recording action creates an exercise entry. Opening this screen is read-only.
  const ensureManualWorkoutSession = useCallback(async () => {
    const focusGeneration = activeFocusGenerationRef.current;
    const identity = recordIdentityRef.current;
    if (!workoutId || !isInitializationCurrent(exerciseId, focusGeneration)) return null;
    const target = await getWorkoutById(workoutId);
    if (!target || target.completedAt != null) return null;
    if (!isInitializationCurrent(exerciseId, focusGeneration)) return null;
    if (recordIdentityRef.current !== identity) return null;
    if (sessionCreationRef.current?.identity === identity) return sessionCreationRef.current.promise;
    const create = async () => {
      const existing = entryIdRef.current
        ? await getWorkoutExerciseById(entryIdRef.current)
        : newEntryRequested ? null : await getOpenWorkoutExercise(target.id, exerciseId!);
      if (!isInitializationCurrent(exerciseId, focusGeneration)) throw new Error("The recording screen is no longer active.");
      if (recordIdentityRef.current !== identity) return null;
      if (existing && (existing.workoutId !== target.id || existing.exerciseId !== exerciseId)) return null;
      if (existing?.completedAt != null) return null;
      const entryId = existing?.id ?? await addWorkoutExercise({
        workout_id: target.id, exercise_id: exerciseId!, performed_at: normalizeDate(new Date(target.startedAt)).getTime(),
      });
      if (recordIdentityRef.current !== identity || !isInitializationCurrent(exerciseId, focusGeneration)) return null;
      entryIdRef.current = entryId;
      setWorkoutExerciseId(entryId);
      return { workoutId: target.id, workoutExerciseId: entryId };
    };
    const creation = { identity, promise: create() };
    sessionCreationRef.current = creation;
    try { return await creation.promise; } finally { if (sessionCreationRef.current === creation) sessionCreationRef.current = null; }
  }, [
    activeFocusGenerationRef,
    recordIdentityRef,
    workoutId,
    isInitializationCurrent,
    exerciseId,
    sessionCreationRef,
    entryIdRef,
    newEntryRequested,
    setWorkoutExerciseId,
  ]);

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
    [programRepsInputsRef, programWeightInputsRef, setProgramRepsInputs, setProgramWeightInputs, unitPreference]
  );

  const loadManualWorkout = useCallback(async (focusGeneration: number | null) => {
    const identity = recordIdentityRef.current;
    const loadGeneration = ++recordLoadGenerationRef.current;
    const isCurrent = () => isInitializationCurrent(exerciseId, focusGeneration) && recordIdentityRef.current === identity && recordLoadGenerationRef.current === loadGeneration;
    if (!isCurrent()) return;
    const requestedEntryId = entryIdRef.current ?? (newEntryRequested ? null : paramWeId);
    let entry = requestedEntryId ? await getWorkoutExerciseById(requestedEntryId) : null;
    if (entry && entry.exerciseId !== exerciseId) throw new Error("This entry belongs to another exercise.");
    if (paramWeId && !newEntryRequested && !entry) throw new Error("This exercise entry is no longer available.");
    const requestedWorkoutId = entry?.workoutId ?? workoutOverrideRef.current ?? paramWorkoutId ?? selectedWorkoutId;
    let target = requestedWorkoutId ? await getWorkoutById(requestedWorkoutId) : await getActiveWorkout();
    // A deleted remembered selection may safely fall back to the real active workout.
    if (!target && !entry && !paramWorkoutId) target = await getActiveWorkout();
    if (target) {
      const detail = await getWorkoutSessionDetail(target.id);
      if (detail) target = { ...target, name: detail.name };
    }
    if (!isCurrent()) return;
    if (!newEntryRequested && !entry && target && target.completedAt == null) entry = await getOpenWorkoutExercise(target.id, exerciseId!);
    const exerciseSets = entry ? await listSetsForWorkoutExercise(entry.id) : [];
    if (!isCurrent()) return;
    entryIdRef.current = entry?.id ?? null;
    setWorkout(target);
    setWorkoutId(target?.id ?? null);
    setWorkoutExerciseId(entry?.id ?? null);
    setEntryCompletedAt(entry?.completedAt ?? null);
    setEntryPerformedAt(entry?.performedAt ?? null);
    if (target) setSelectedDate(normalizeDate(new Date(target.startedAt)));
    applyLoadedSessionNote(entry?.id ?? null, entry?.note);
    setSets(exerciseSets);
    setWeightState(entry?.currentWeight != null ? formatEditableWeightFromKg(entry.currentWeight, unitPreference) : "");
    setRepsState(entry?.currentReps != null ? String(entry.currentReps) : "");
    if (paramWeId) {
      const planned = exerciseSets.find(set => (set.note ?? "").startsWith("[PLANNED]"));
      if (planned?.weightKg != null) setWeightState(formatEditableWeightFromKg(planned.weightKg, unitPreference));
      if (planned?.reps != null) setRepsState(String(planned.reps));
    }
    await loadLastRestTime(focusGeneration);
  }, [
    recordIdentityRef,
    recordLoadGenerationRef,
    entryIdRef,
    newEntryRequested,
    paramWeId,
    exerciseId,
    workoutOverrideRef,
    paramWorkoutId,
    selectedWorkoutId,
    setWorkout,
    setWorkoutId,
    setWorkoutExerciseId,
    setEntryCompletedAt,
    setEntryPerformedAt,
    setSelectedDate,
    applyLoadedSessionNote,
    setSets,
    setWeightState,
    unitPreference,
    setRepsState,
    loadLastRestTime,
    isInitializationCurrent,
  ]);

  const loadProgramWorkout = useCallback(
    async (
      entries: ProgrammedExerciseForDate[],
      preferredProgramExerciseId: number | null | undefined,
      focusGeneration: number | null
    ) => {
      const identity = recordIdentityRef.current;
      const loadGeneration = ++recordLoadGenerationRef.current;
      const isCurrent = () => isInitializationCurrent(exerciseId, focusGeneration) && recordIdentityRef.current === identity && recordLoadGenerationRef.current === loadGeneration;
      if (!isCurrent()) {
        return;
      }
      const nextEntry = pickProgrammedEntry(
        entries,
        preferredProgramExerciseId ??
        selectedProgramExerciseId ??
        paramProgramExerciseId
      );

      const hydrateUnlinkedWorkout = async () => {
        const candidateId = paramWorkoutId ?? selectedWorkoutId;
        let candidate = candidateId ? await getWorkoutById(candidateId) : await getActiveWorkout();
        if (candidate) {
          const detail = await getWorkoutSessionDetail(candidate.id);
          if (detail) candidate = { ...candidate, name: detail.name };
        }
        if (!isCurrent()) return false;
        entryIdRef.current = null;
        setWorkout(candidate);
        setWorkoutId(candidate?.id ?? null);
        setWorkoutExerciseId(null);
        setEntryCompletedAt(null);
        setEntryPerformedAt(null);
        setSelectedDate(candidate ? normalizeDate(new Date(candidate.startedAt)) : normalizeDate(new Date(programDateIso + "T12:00:00")));
        return true;
      };

      if (!nextEntry) {
        setSelectedProgramExerciseId(null);
        if (!(await hydrateUnlinkedWorkout())) return;
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
      await loadLastRestTime(focusGeneration);

      if (!isCurrent()) {
        return;
      }

      const resolvedWorkoutExerciseId =
        await resolveWorkoutExerciseIdForCalendarExercise(
          nextEntry.calendarExercise.id
        );

      if (!isCurrent()) {
        return;
      }

      if (!resolvedWorkoutExerciseId) {
        if (!(await hydrateUnlinkedWorkout())) return;
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

      if (!isCurrent()) {
        return;
      }

      if (!linkedWorkoutExercise) {
        if (!(await hydrateUnlinkedWorkout())) return;
        applyLoadedSessionNote(null, null);
        setSets([]);
        programWeightInputsRef.current = {};
        programRepsInputsRef.current = {};
        setWeightState("");
        setRepsState("");
        return;
      }

      let parentWorkout = await getWorkoutById(linkedWorkoutExercise.workoutId);
      if (parentWorkout) {
        const detail = await getWorkoutSessionDetail(parentWorkout.id);
        if (detail) parentWorkout = { ...parentWorkout, name: detail.name };
      }
      const linkedSets = await listSetsForWorkoutExercise(linkedWorkoutExercise.id);
      if (!isCurrent()) return;
      entryIdRef.current = linkedWorkoutExercise.id;
      setEntryCompletedAt(linkedWorkoutExercise.completedAt ?? null);
      setEntryPerformedAt(linkedWorkoutExercise.performedAt ?? null);
      setWorkoutId(linkedWorkoutExercise.workoutId);
      setWorkout(parentWorkout);
      if (parentWorkout) setSelectedDate(normalizeDate(new Date(parentWorkout.startedAt)));
      setWorkoutExerciseId(linkedWorkoutExercise.id);
      applyLoadedSessionNote(linkedWorkoutExercise.id, linkedWorkoutExercise.note);
      setWeightState(linkedWorkoutExercise.currentWeight != null ? formatEditableWeightFromKg(linkedWorkoutExercise.currentWeight, unitPreference) : "");
      setRepsState(linkedWorkoutExercise.currentReps != null ? String(linkedWorkoutExercise.currentReps) : "");
      setSets(linkedSets);
    },
    [
      recordIdentityRef,
      recordLoadGenerationRef,
      selectedProgramExerciseId,
      paramProgramExerciseId,
      hydrateProgramInputs,
      loadLastRestTime,
      entryIdRef,
      setEntryCompletedAt,
      setEntryPerformedAt,
      setWorkoutId,
      setWorkout,
      setSelectedDate,
      setWorkoutExerciseId,
      applyLoadedSessionNote,
      setWeightState,
      unitPreference,
      setRepsState,
      setSets,
      isInitializationCurrent,
      exerciseId,
      paramWorkoutId,
      selectedWorkoutId,
      programDateIso,
      setSelectedProgramExerciseId,
      programWeightInputsRef,
      programRepsInputsRef,
      setProgramWeightInputs,
      setProgramRepsInputs,
    ]
  );

  const loadRecordState = useCallback(async () => {
    const focusGeneration = activeFocusGenerationRef.current;
    const identity = recordIdentityRef.current;
    const loadGeneration = ++recordLoadGenerationRef.current;
    const isCurrent = () => isInitializationCurrent(exerciseId, focusGeneration) && recordIdentityRef.current === identity && recordLoadGenerationRef.current === loadGeneration;
    if (!isCurrent()) {
      return;
    }

    if (!programsExperienceEnabled || !paramProgramExerciseId) {
      setProgramEntries([]);
      setSelectedProgramExerciseId(null);
      programWeightInputsRef.current = {};
      programRepsInputsRef.current = {};
      setProgramWeightInputs({});
      setProgramRepsInputs({});
      await loadManualWorkout(focusGeneration);
      return;
    }

    clearProgramInteractionState();

    const nextProgramEntries = await getProgrammedExercisesForExerciseOnDate({
      dateIso: programDateIso,
      exerciseId,
      exerciseName: exerciseNameParam,
    });

    if (!isCurrent()) {
      return;
    }

    if (nextProgramEntries.length > 0) {
      setProgramEntries(nextProgramEntries);
      await loadProgramWorkout(nextProgramEntries, undefined, focusGeneration);
      return;
    }

    setProgramEntries([]);
    setSelectedProgramExerciseId(null);
    programWeightInputsRef.current = {};
    programRepsInputsRef.current = {};
    setProgramWeightInputs({});
    setProgramRepsInputs({});
    await loadManualWorkout(focusGeneration);
  }, [
    activeFocusGenerationRef,
    recordIdentityRef,
    recordLoadGenerationRef,
    programsExperienceEnabled,
    paramProgramExerciseId,
    clearProgramInteractionState,
    programDateIso,
    exerciseId,
    exerciseNameParam,
    setProgramEntries,
    setSelectedProgramExerciseId,
    programWeightInputsRef,
    programRepsInputsRef,
    setProgramWeightInputs,
    setProgramRepsInputs,
    loadManualWorkout,
    isInitializationCurrent,
    loadProgramWorkout,
  ]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!isExerciseAvailable) {
        return () => {
          active = false;
        };
      }

      setRecordLoadError(null);
      void loadRecordState().catch(() => {
        if (active && isExerciseAvailableRef.current) {
          setRecordLoadError("We couldn’t load this exercise.");
        }
      });

      return () => {
        active = false;
      };
    }, [isExerciseAvailable, isExerciseAvailableRef, loadRecordState, setRecordLoadError])
  );

  const retryExerciseLoad = useCallback(() => {
    if (exerciseStatus !== "available") {
      setValidationAttempt((attempt) => attempt + 1);
      return;
    }

    setRecordLoadError(null);
    void loadRecordState().catch(() => {
      if (isExerciseAvailableRef.current) {
        setRecordLoadError("We couldn’t load this exercise.");
      }
    });
  }, [exerciseStatus, isExerciseAvailableRef, loadRecordState, setRecordLoadError, setValidationAttempt]);

  const goBackToExercises = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/exercises");
  }, []);

  const ensureProgramWorkoutSession = useCallback(async () => {
    const identity = recordIdentityRef.current;
    const focusGeneration = activeFocusGenerationRef.current;
    if (!activeProgramEntry || !workoutId || !isInitializationCurrent(exerciseId, focusGeneration)) {
      return null;
    }

    const parent = await getWorkoutById(workoutId);
    if (!parent || parent.completedAt != null) return null;
    if (recordIdentityRef.current !== identity || !isInitializationCurrent(exerciseId, focusGeneration)) return null;
    const session = await ensureProgramExerciseWorkoutSession({
      calendarExerciseId: activeProgramEntry.calendarExercise.id,
      calendarExercise: activeProgramEntry.calendarExercise,
      exerciseName: activeProgramEntry.calendarExercise.exerciseName,
      performedAt: selectedDate.getTime(),
    });

    const sessionWorkout = await getWorkoutById(session.workoutId);
    if (recordIdentityRef.current !== identity || !isInitializationCurrent(exerciseId, focusGeneration)) return null;
    entryIdRef.current = session.workoutExerciseId;
    setWorkoutId(session.workoutId);
    setWorkout(sessionWorkout);
    setWorkoutExerciseId(session.workoutExerciseId);
    return session;
  }, [
    activeFocusGenerationRef,
    activeProgramEntry,
    entryIdRef,
    exerciseId,
    isInitializationCurrent,
    recordIdentityRef,
    selectedDate,
    setWorkout,
    setWorkoutExerciseId,
    setWorkoutId,
    workoutId,
  ]);

  const reloadRecordState = useCallback(async () => {
    await loadRecordState();
  }, [loadRecordState]);

  const refreshWorkoutSets = useCallback(async (targetWorkoutExerciseId: number) => {
    const identity = recordIdentityRef.current;
    const linkedWorkoutExercise = await getWorkoutExerciseById(targetWorkoutExerciseId);
    if (!linkedWorkoutExercise) return;
    const nextSets = await listSetsForWorkoutExercise(linkedWorkoutExercise.id);
    if (recordIdentityRef.current !== identity) return;
    entryIdRef.current = linkedWorkoutExercise.id;
    setWorkoutId(linkedWorkoutExercise.workoutId);
    setWorkoutExerciseId(linkedWorkoutExercise.id);
    setEntryPerformedAt(linkedWorkoutExercise.performedAt ?? null);
    applyLoadedSessionNote(linkedWorkoutExercise.id, linkedWorkoutExercise.note);
    setSets(nextSets);
  }, [applyLoadedSessionNote, recordIdentityRef, entryIdRef, setWorkoutId, setWorkoutExerciseId, setEntryPerformedAt, setSets]);
  const startAnotherEntry = useCallback(() => {
    recordIdentityRef.current += 1;
    entryIdRef.current = null;
    setEntryPerformedAt(null);
    setNewEntryRequested(true);
    setWorkoutExerciseId(null);
    setEntryCompletedAt(null);
    setSets([]);
    applyLoadedSessionNote(null, null);
  }, [
    applyLoadedSessionNote,
    entryIdRef,
    recordIdentityRef,
    setEntryCompletedAt,
    setEntryPerformedAt,
    setNewEntryRequested,
    setSets,
    setWorkoutExerciseId,
  ]);
  return {
    startAnotherEntry,
    loadLastRestTime,
    ensureManualWorkoutSession,
    hydrateProgramInputs,
    loadManualWorkout,
    loadProgramWorkout,
    loadRecordState,
    retryExerciseLoad,
    goBackToExercises,
    ensureProgramWorkoutSession,
    reloadRecordState,
    refreshWorkoutSets,
  };
}

export type RecordingSessionController = ReturnType<typeof useRecordingSession>;
