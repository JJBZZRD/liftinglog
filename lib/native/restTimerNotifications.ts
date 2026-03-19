import { NativeModules, Platform } from "react-native";

type NativeRestTimerNotificationsModule = {
  showCountdownNotification(
    timerId: string,
    exerciseId: number,
    exerciseName: string,
    endAtMillis: number
  ): Promise<void>;
  dismissCountdownNotification(timerId: string, exerciseId: number): Promise<void>;
  cancelCompletionNotification(timerId: string, exerciseId: number): Promise<void>;
  showCompletionNotification(
    timerId: string,
    exerciseId: number,
    exerciseName: string,
    endAtMillis: number
  ): Promise<void>;
  canScheduleExactAlarms(): Promise<boolean>;
  openExactAlarmSettings(): Promise<boolean>;
};

type CountdownPayload = {
  timerId: string;
  exerciseId: number;
  exerciseName: string;
  endAt: number;
};

const nativeModule = NativeModules.RestTimerNotifications as NativeRestTimerNotificationsModule | undefined;

export function supportsNativeCountdownNotifications(): boolean {
  return Platform.OS === "android" && Boolean(nativeModule);
}

export async function showCountdownNotification(payload: CountdownPayload): Promise<boolean> {
  if (!supportsNativeCountdownNotifications() || !nativeModule) {
    return false;
  }

  await nativeModule.showCountdownNotification(
    payload.timerId,
    payload.exerciseId,
    payload.exerciseName,
    payload.endAt
  );
  return true;
}

export async function dismissCountdownNotification(
  timerId: string,
  exerciseId: number
): Promise<boolean> {
  if (!supportsNativeCountdownNotifications() || !nativeModule) {
    return false;
  }

  await nativeModule.dismissCountdownNotification(timerId, exerciseId);
  return true;
}

export async function showCompletionNotification(payload: CountdownPayload): Promise<boolean> {
  if (!supportsNativeCountdownNotifications() || !nativeModule) {
    return false;
  }

  await nativeModule.showCompletionNotification(
    payload.timerId,
    payload.exerciseId,
    payload.exerciseName,
    payload.endAt
  );
  return true;
}

export async function cancelCompletionNotification(
  timerId: string,
  exerciseId: number
): Promise<boolean> {
  if (!supportsNativeCountdownNotifications() || !nativeModule) {
    return false;
  }

  await nativeModule.cancelCompletionNotification(timerId, exerciseId);
  return true;
}

export async function canScheduleExactAlarms(): Promise<boolean> {
  if (!supportsNativeCountdownNotifications() || !nativeModule) {
    return false;
  }

  return nativeModule.canScheduleExactAlarms();
}

export async function openExactAlarmSettings(): Promise<boolean> {
  if (!supportsNativeCountdownNotifications() || !nativeModule) {
    return false;
  }

  return nativeModule.openExactAlarmSettings();
}
