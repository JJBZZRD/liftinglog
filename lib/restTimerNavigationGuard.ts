export const SAFE_REST_TIMER_ROUTE = "/";

const RESERVED_TIMER_FIELDS = ["timerId", "endAt", "navigationGeneration"] as const;

let quarantined = false;
let navigationEpoch = 0;

type ParsedNavigationPath = {
  readonly url: URL;
  readonly routePath: string;
};

export type RestTimerNotificationNavigationData = {
  readonly timerId?: unknown;
  readonly exerciseId?: unknown;
  readonly endAt?: unknown;
  readonly navigationGeneration?: unknown;
};

function parseNavigationPath(path: string): ParsedNavigationPath | null {
  try {
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(path);
    const url = absolute ? new URL(path) : new URL(path, "liftinglog://app/");
    const routePath =
      absolute && url.protocol === "liftinglog:" && url.hostname.length > 0
        ? `/${url.hostname}${url.pathname}`
        : url.pathname;
    return { url, routePath };
  } catch {
    return null;
  }
}

function hasReservedMarker(path: string, parsed: ParsedNavigationPath | null): boolean {
  if (
    parsed &&
    (parsed.url.searchParams.getAll("source").includes("notification") ||
      RESERVED_TIMER_FIELDS.some((field) => parsed.url.searchParams.has(field)))
  ) {
    return true;
  }

  return (
    /(?:[?&]|%3[fF]|%26)source(?:=|%3[dD])notification(?:[&#]|$|%26)/.test(path) ||
    RESERVED_TIMER_FIELDS.some((field) =>
      new RegExp(`(?:[?&]|%3[fF]|%26)${field}(?:=|%3[dD])`).test(path)
    )
  );
}

function singularValue(url: URL, name: string): string | null {
  const values = url.searchParams.getAll(name);
  return values.length === 1 ? values[0] : null;
}

function isCanonicalPositiveInteger(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value));
}

function isAndroidRuntime(): boolean {
  const expoOsKey = ["EXPO", "OS"].join("_");
  const configuredOs = process.env[expoOsKey];
  if (configuredOs) return configuredOs === "android";
  try {
    // Metro has a real React Native platform when EXPO_OS was not inlined. The
    // catch preserves importability in non-native host test environments.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as typeof import("react-native");
    return Platform.OS === "android";
  } catch {
    return false;
  }
}

function hasCurrentGeneration(value: string | null): boolean {
  if (!isAndroidRuntime() || quarantined) return false;

  // Keep this dependency lazy so non-Android notification handling remains
  // import-inert in runtimes without the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getRestTimerNavigationGeneration } = require("./native/restTimerNotifications") as typeof import("./native/restTimerNotifications");
  const current = getRestTimerNavigationGeneration();
  if (current.status !== "available") return false;
  if (current.generation === null) return value === null;
  return value === current.generation;
}

export function beginRestTimerNavigationQuarantine(): void {
  quarantined = true;
  navigationEpoch += 1;
}

export function endRestTimerNavigationQuarantine(): void {
  quarantined = false;
  navigationEpoch += 1;
}

export function isRestTimerNavigationQuarantined(): boolean {
  return quarantined;
}

export function getRestTimerNavigationEpoch(): number {
  return navigationEpoch;
}

export function isTimerLikeNavigationPath(path: string): boolean {
  const parsed = parseNavigationPath(path);
  return hasReservedMarker(path, parsed);
}

export function guardRestTimerNavigationPath(path: string): string {
  const parsed = parseNavigationPath(path);
  if (!hasReservedMarker(path, parsed)) return path;
  if (!parsed || quarantined || !isAndroidRuntime()) {
    return SAFE_REST_TIMER_ROUTE;
  }

  const match = /^\/exercise\/([^/]+)\/?$/.exec(parsed.routePath);
  if (!match) return SAFE_REST_TIMER_ROUTE;

  let exerciseId: string;
  try {
    exerciseId = decodeURIComponent(match[1]);
  } catch {
    return SAFE_REST_TIMER_ROUTE;
  }

  const source = singularValue(parsed.url, "source");
  const timerId = singularValue(parsed.url, "timerId");
  const endAt = singularValue(parsed.url, "endAt");
  const tab = singularValue(parsed.url, "tab");
  const generationValues = parsed.url.searchParams.getAll("navigationGeneration");
  if (
    !isCanonicalPositiveInteger(exerciseId) ||
    source !== "notification" ||
    tab !== "record" ||
    timerId === null ||
    timerId.trim().length === 0 ||
    endAt === null ||
    !isCanonicalPositiveInteger(endAt) ||
    generationValues.length > 1
  ) {
    return SAFE_REST_TIMER_ROUTE;
  }

  const generation = generationValues.length === 1 ? generationValues[0] : null;
  return hasCurrentGeneration(generation) ? path : SAFE_REST_TIMER_ROUTE;
}

export function canDeliverRestTimerNotificationResponse(
  data: RestTimerNotificationNavigationData,
  expectedEpoch: number
): boolean {
  if (quarantined || expectedEpoch !== navigationEpoch) return false;
  if (!isAndroidRuntime()) return true;
  if (
    typeof data.timerId !== "string" ||
    data.timerId.trim().length === 0 ||
    typeof data.exerciseId !== "number" ||
    !Number.isSafeInteger(data.exerciseId) ||
    data.exerciseId <= 0 ||
    typeof data.endAt !== "number" ||
    !Number.isSafeInteger(data.endAt) ||
    data.endAt <= 0
  ) {
    return false;
  }

  const generation =
    typeof data.navigationGeneration === "string" ? data.navigationGeneration : null;
  if (
    data.navigationGeneration !== undefined &&
    typeof data.navigationGeneration !== "string"
  ) {
    return false;
  }
  return hasCurrentGeneration(generation);
}
