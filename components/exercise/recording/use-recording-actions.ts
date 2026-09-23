import { router } from "expo-router";
import { useCallback } from "react";
import { Keyboard } from "react-native";
import { listMediaForSet, listMediaForSetIds } from "../../../lib/db/media";
import {
  deleteUserSet,
  getCalendarSetByWorkoutSetId,
  listCalendarSetsByWorkoutSetIds,
  syncStatusesForCalendarExercise,
} from "../../../lib/db/programCalendar";
import {
  addSet,
  completeExerciseEntry,
  deleteSet,
  deleteSetsForWorkoutExercise,
  updateSet,
  updateWorkoutExerciseInputs,
  type SetRow,
} from "../../../lib/db/workouts";
import { timerStore } from "../../../lib/timerStore";
import { deleteAssociatedMediaForSets } from "../../../lib/utils/mediaCleanup";
import { parseWeightInputToKg } from "../../../lib/utils/units";
import type { RecordingContextController } from "./use-recording-context";
import type { RecordingSessionController } from "./use-recording-session";

export function useRecordingActions(context: Pick<RecordingContextController & RecordingSessionController,
  "recordIdentityRef" | "entryPerformedAt" |
  "unitPreference" |
  "exerciseId" |
  "workoutId" |
  "workoutExerciseId" |
  "sets" |
  "weight" |
  "reps" |
  "note" |
  "setNote" |
  "setEditModalVisible" |
  "selectedSet" |
  "setSelectedSet" |
  "setDeleteConfirmVisible" |
  "deleteTarget" |
  "setDeleteTarget" |
  "deleteMediaChecked" |
  "setDeleteMediaChecked" |
  "deleteMediaAvailable" |
  "setDeleteMediaAvailable" |
  "deleteMediaSetIds" |
  "setDeleteMediaSetIds" |
  "setClearConfirmVisible" |
  "clearMediaChecked" |
  "setClearMediaChecked" |
  "clearMediaAvailable" |
  "setClearMediaAvailable" |
  "clearMediaSetIds" |
  "setClearMediaSetIds" |
  "currentTimer" |
  "selectedDate" |
  "activeProgramEntry" |
  "inProgramMode" |
  "nextSetIndex" |
  "hasConfirmedSets" |
  "onHistoryRefresh" |
  "loadRecordState" |
  "ensureManualWorkoutSession" |
  "ensureProgramWorkoutSession" |
  "reloadRecordState"
>) {
  const {
    recordIdentityRef, entryPerformedAt,
    unitPreference,
    exerciseId,
    workoutId,
    workoutExerciseId,
    sets,
    weight,
    reps,
    note,
    setNote,
    setEditModalVisible,
    selectedSet,
    setSelectedSet,
    setDeleteConfirmVisible,
    deleteTarget,
    setDeleteTarget,
    deleteMediaChecked,
    setDeleteMediaChecked,
    deleteMediaAvailable,
    setDeleteMediaAvailable,
    deleteMediaSetIds,
    setDeleteMediaSetIds,
    setClearConfirmVisible,
    clearMediaChecked,
    setClearMediaChecked,
    clearMediaAvailable,
    setClearMediaAvailable,
    clearMediaSetIds,
    setClearMediaSetIds,
    currentTimer,
    selectedDate,
    activeProgramEntry,
    inProgramMode,
    nextSetIndex,
    hasConfirmedSets,
    onHistoryRefresh,
    loadRecordState,
    ensureManualWorkoutSession,
    ensureProgramWorkoutSession,
    reloadRecordState,
  } = context;
  const handleAddSet = useCallback(async () => {
    const identity = recordIdentityRef.current;
    Keyboard.dismiss();
    const weightValueKg = parseWeightInputToKg(weight, unitPreference);
    const repsValue = reps.trim() ? parseInt(reps, 10) : null;
    const noteValue = note.trim() || null;

    if (!weightValueKg || weightValueKg === 0 || !repsValue || repsValue === 0) {
      return;
    }

    let nextWorkoutId = workoutId;
    let nextWorkoutExerciseId =
      workoutExerciseId;
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

    if (!inProgramMode) {
      const session = await ensureManualWorkoutSession();
      if (!session) return;
      nextWorkoutId = session.workoutId;
      nextWorkoutExerciseId = session.workoutExerciseId;
    }

    if (!nextWorkoutId || !nextExerciseId || !nextWorkoutExerciseId) {
      return;
    }

    if (recordIdentityRef.current !== identity) return;
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

    await updateWorkoutExerciseInputs(nextWorkoutExerciseId, { currentWeight: weightValueKg, currentReps: repsValue });
    if (recordIdentityRef.current !== identity) return;
    setNote("");
    await loadRecordState();
    onHistoryRefresh?.();
  }, [
    recordIdentityRef,
    weight,
    unitPreference,
    reps,
    note,
    workoutId,
    workoutExerciseId,
    exerciseId,
    inProgramMode,
    activeProgramEntry,
    sets,
    setNote,
    loadRecordState,
    onHistoryRefresh,
    ensureProgramWorkoutSession,
    ensureManualWorkoutSession,
    selectedDate,
    nextSetIndex,
  ]);

  const handleCompleteManualExercise = useCallback(async () => {
    const targetWorkoutExerciseId =
      workoutExerciseId;

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

    await completeExerciseEntry(targetWorkoutExerciseId, entryPerformedAt ?? selectedDate.getTime());
    onHistoryRefresh?.();
    router.back();
  }, [currentTimer, entryPerformedAt, hasConfirmedSets, onHistoryRefresh, selectedDate, sets, workoutExerciseId]);

  const handleEditSetPress = useCallback((set: SetRow) => {
    setSelectedSet(set);
    setEditModalVisible(true);
  }, [setEditModalVisible, setSelectedSet]);

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
    [onHistoryRefresh, reloadRecordState, selectedSet, setEditModalVisible, setSelectedSet]
  );

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmVisible(false);
    setDeleteTarget(null);
    setDeleteMediaChecked(false);
    setDeleteMediaAvailable(false);
    setDeleteMediaSetIds([]);
  }, [setDeleteConfirmVisible, setDeleteMediaAvailable, setDeleteMediaChecked, setDeleteMediaSetIds, setDeleteTarget]);

  const handleDeleteSetPress = useCallback(async (set: SetRow, displayIndex: number) => {
    setDeleteTarget({ set, displayIndex });
    setDeleteConfirmVisible(true);
    setDeleteMediaChecked(false);
    const mediaRows = await listMediaForSet(set.id);
    setDeleteMediaAvailable(mediaRows.length > 0);
    setDeleteMediaSetIds(mediaRows.length > 0 ? [set.id] : []);
  }, [setDeleteConfirmVisible, setDeleteMediaAvailable, setDeleteMediaChecked, setDeleteMediaSetIds, setDeleteTarget]);

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
  }, [setClearConfirmVisible, setClearMediaAvailable, setClearMediaChecked, setClearMediaSetIds]);

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
  }, [setClearConfirmVisible, setClearMediaAvailable, setClearMediaChecked, setClearMediaSetIds, sets]);

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
  return {
    handleAddSet,
    handleCompleteManualExercise,
    handleEditSetPress,
    handleSetPress,
    handleUpdateSet,
    closeDeleteConfirm,
    handleDeleteSetPress,
    handleConfirmDeleteSet,
    closeClearConfirm,
    handleOpenClearConfirm,
    handleConfirmClearSets,
    handleConfirmPlannedSet,
  };
}

export type RecordingActionsController = ReturnType<typeof useRecordingActions>;
