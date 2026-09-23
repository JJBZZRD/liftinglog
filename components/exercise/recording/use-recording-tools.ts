import { router } from "expo-router";
import { useCallback, useEffect } from "react";
import { appCapabilities } from "../../../lib/config/releaseProfile";
import { setLastRestSeconds } from "../../../lib/db/exercises";
import { timerStore } from "../../../lib/timerStore";
import { formatTime, parseTimerDurationSeconds } from "../../../lib/utils/formatters";
import type { RecordingContextController } from "./use-recording-context";
import type { RecordingSessionController } from "./use-recording-session";

export function useRecordingTools(context: Pick<RecordingContextController & RecordingSessionController,
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
  "inProgramMode" |
  "displayExerciseName" |
  "nextSetIndex" |
  "ensureManualWorkoutSession" |
  "ensureProgramWorkoutSession"
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
    inProgramMode,
    displayExerciseName,
    nextSetIndex,
    ensureManualWorkoutSession,
    ensureProgramWorkoutSession,
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

  const handleRecordVideoPress = useCallback(async () => {
    if (!appCapabilities.videoRecording) {
      return;
    }

    if (!exerciseId) {
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
    ensureManualWorkoutSession,
    ensureProgramWorkoutSession,
    exerciseId,
    inProgramMode,
    nextSetIndex,
    selectedDate,
    workoutExerciseId,
    workoutId,
  ]);

  const timerDisplayText = currentTimer
    ? formatTime(currentTimer.remainingSeconds)
    : formatTime(parseTimerDurationSeconds(timerMinutes, timerSeconds));

  const canOpenCamera =
    appCapabilities.videoRecording &&
    !!exerciseId &&
    (inProgramMode || !!workoutId);
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
