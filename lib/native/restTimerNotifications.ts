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
  retireRestTimerArtifactsForReplacementRestore?(): Promise<unknown>;
  getRestTimerNavigationGeneration?(): unknown;
};

type CountdownPayload = {
  timerId: string;
  exerciseId: number;
  exerciseName: string;
  endAt: number;
};

const nativeModule = NativeModules.RestTimerNotifications as NativeRestTimerNotificationsModule | undefined;

export const ERR_REST_TIMER_RETIRE_UNAVAILABLE = "ERR_REST_TIMER_RETIRE_UNAVAILABLE";
export const ERR_REST_TIMER_RETIRE_RESTORE = "ERR_REST_TIMER_RETIRE_RESTORE";
export const ERR_REST_TIMER_NAVIGATION_GENERATION_READ_FAILED =
  "ERR_REST_TIMER_NAVIGATION_GENERATION_READ_FAILED";
export const ERR_REST_TIMER_NAVIGATION_GENERATION_INVALID_ACKNOWLEDGEMENT =
  "ERR_REST_TIMER_NAVIGATION_GENERATION_INVALID_ACKNOWLEDGEMENT";

export type RestTimerNavigationGeneration =
  | { status: "available"; generation: string | null }
  | { status: "unreadable"; code: string }
  | { status: "unavailable" };

export type RestoreTimerRetirement = {
  status: "retired";
  registeredTimersRetired: number;
  displayedNotificationsCleared: true;
};

type RestTimerRetirementErrorCode =
  | typeof ERR_REST_TIMER_RETIRE_UNAVAILABLE
  | typeof ERR_REST_TIMER_RETIRE_RESTORE;

function retirementError(
  code: RestTimerRetirementErrorCode,
  message: string,
  cause?: unknown
): Error & { code: RestTimerRetirementErrorCode; cause?: unknown } {
  const error = new Error(message) as Error & {
    code: RestTimerRetirementErrorCode;
    cause?: unknown;
  };
  error.code = code;
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
}

function isRestoreTimerRetirement(value: unknown): value is RestoreTimerRetirement {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<RestoreTimerRetirement>;
  return (
    candidate.status === "retired" &&
    typeof candidate.registeredTimersRetired === "number" &&
    Number.isSafeInteger(candidate.registeredTimersRetired) &&
    candidate.registeredTimersRetired >= 0 &&
    candidate.displayedNotificationsCleared === true
  );
}

const REST_TIMER_NAVIGATION_GENERATION_PATTERN =
  /^timer-nav-v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function hasExactKeys(value: object, expectedKeys: string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function parseRestTimerNavigationGeneration(
  value: unknown
): RestTimerNavigationGeneration | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.status === "available") {
    if (!hasExactKeys(candidate, ["status", "generation"])) {
      return null;
    }
    if (
      candidate.generation !== null &&
      (typeof candidate.generation !== "string" ||
        !REST_TIMER_NAVIGATION_GENERATION_PATTERN.test(candidate.generation))
    ) {
      return null;
    }
    return {
      status: "available",
      generation: candidate.generation as string | null,
    };
  }
  if (candidate.status === "unreadable") {
    if (
      !hasExactKeys(candidate, ["status", "code"]) ||
      typeof candidate.code !== "string" ||
      candidate.code.trim().length === 0
    ) {
      return null;
    }
    return { status: "unreadable", code: candidate.code };
  }
  if (candidate.status === "unavailable" && hasExactKeys(candidate, ["status"])) {
    return { status: "unavailable" };
  }
  return null;
}

export function supportsNativeCountdownNotifications(): boolean {
  return Platform.OS === "android" && Boolean(nativeModule);
}

export function getRestTimerNavigationGeneration(): RestTimerNavigationGeneration {
  if (
    Platform.OS !== "android" ||
    !nativeModule ||
    typeof nativeModule.getRestTimerNavigationGeneration !== "function"
  ) {
    return { status: "unavailable" };
  }

  let acknowledgement: unknown;
  try {
    acknowledgement = nativeModule.getRestTimerNavigationGeneration();
  } catch {
    return {
      status: "unreadable",
      code: ERR_REST_TIMER_NAVIGATION_GENERATION_READ_FAILED,
    };
  }

  return (
    parseRestTimerNavigationGeneration(acknowledgement) ?? {
      status: "unreadable",
      code: ERR_REST_TIMER_NAVIGATION_GENERATION_INVALID_ACKNOWLEDGEMENT,
    }
  );
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

export async function retireRestTimerArtifactsForReplacementRestore(): Promise<RestoreTimerRetirement> {
  if (
    Platform.OS !== "android" ||
    !nativeModule ||
    typeof nativeModule.retireRestTimerArtifactsForReplacementRestore !== "function"
  ) {
    throw retirementError(
      ERR_REST_TIMER_RETIRE_UNAVAILABLE,
      "Native rest-timer retirement is unavailable"
    );
  }

  let acknowledgement: unknown;
  try {
    acknowledgement = await nativeModule.retireRestTimerArtifactsForReplacementRestore();
  } catch (cause) {
    throw retirementError(
      ERR_REST_TIMER_RETIRE_RESTORE,
      "Native rest-timer retirement failed",
      cause
    );
  }

  if (!isRestoreTimerRetirement(acknowledgement)) {
    throw retirementError(
      ERR_REST_TIMER_RETIRE_RESTORE,
      "Native rest-timer retirement returned an invalid acknowledgement"
    );
  }

  return acknowledgement;
}
