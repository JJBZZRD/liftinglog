import { router } from "expo-router";
import { useCallback, useEffect } from "react";
import { appCapabilities } from "../../../lib/config/releaseProfile";
import { setLastRestSeconds } from "../../../lib/db/exercises";
import { timerStore } from "../../../lib/timerStore";
import { formatTime, parseTimerDurationSeconds } from "../../../lib/utils/formatters";
import type { RecordingContextController } from "./use-recording-context";

export function useRecordingTools(context: Pick<RecordingContextController,
  "exerciseId" |
  "workoutId" |
  "workoutExerciseId" |
  "setTimerModalVisible" |
  "currentTimer" |
  "setCurrentTimer" |
  "timerMinutes" |
  "setTimerMinutes" |
  "timerSeconds" |
  "setTimerSeconds" |
  "selectedDate" |
  "activeProgramEntry" |
  "programDateIso" |
  "inProgramMode" |
  "displayExerciseName" |
  "nextSetIndex" |
  "newEntryRequested"
>) {
  const {
    exerciseId,
    workoutId,
    workoutExerciseId,
    setTimerModalVisible,
    currentTimer,
    setCurrentTimer,
    timerMinutes,
    setTimerMinutes,
    timerSeconds,
    setTimerSeconds,
    selectedDate,
    activeProgramEntry,
    programDateIso,
    inProgramMode,
    displayExerciseName,
    nextSetIndex,
    newEntryRequested,
  } = context;
  useEffect(() => {
    const unsubscribe = timerStore.subscribe((timersByExercise) => {
      if (exerciseId) {
        const timer = timersByExercise.get(exerciseId);
        setCurrentTimer(timer ?? null);
      }
    });
    return unsubscribe;
  }, [exerciseId, setCurrentTimer]);

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

    const totalSeconds = parseTimerDurationSeconds(timerMinutes, timerSeconds);

    if (totalSeconds <= 0) {
      return;
    }

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
  }, [currentTimer, setTimerMinutes, setTimerModalVisible, setTimerSeconds]);

  const handleRecordVideoPress = useCallback(() => {
    if (!appCapabilities.videoRecording || !exerciseId || !workoutId) return;
    // Opening or cancelling the camera is read-only. The camera creates an
    // entry only when a valid set and its durable video are ready to save.
    router.push({
      pathname: "/exercise/record-video",
      params: {
        id: String(exerciseId),
        name: displayExerciseName,
        workoutId: String(workoutId),
        ...(workoutExerciseId ? { workoutExerciseId: String(workoutExerciseId) } : {}),
        ...(inProgramMode && activeProgramEntry ? { programExerciseId: String(activeProgramEntry.calendarExercise.id), dateIso: programDateIso } : {}),
        ...(newEntryRequested ? { newEntry: "1" } : {}),
        performedAt: String(selectedDate.getTime()),
        setIndex: String(nextSetIndex),
      },
    });
  }, [activeProgramEntry, programDateIso, displayExerciseName, exerciseId, inProgramMode, newEntryRequested, nextSetIndex, selectedDate, workoutExerciseId, workoutId]);

  const timerDisplayText = currentTimer
    ? formatTime(currentTimer.remainingSeconds)
    : formatTime(parseTimerDurationSeconds(timerMinutes, timerSeconds));

  const canOpenCamera =
    appCapabilities.videoRecording &&
    !!exerciseId &&
    !!workoutId;
  return {
    handleTimerPress,
    handleSaveRestTime,
    handleTimerLongPress,
    handleRecordVideoPress,
    timerDisplayText,
    canOpenCamera,
  };
}

export type RecordingToolsController = ReturnType<typeof useRecordingTools>;
