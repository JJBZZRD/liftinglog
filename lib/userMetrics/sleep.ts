const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60 * 1000;

export function normalizeClockMinutes(minutes: number): number {
  const normalized = minutes % MINUTES_PER_DAY;
  return normalized < 0 ? normalized + MINUTES_PER_DAY : normalized;
}

export function getMinutesOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return (date.getHours() * 60) + date.getMinutes();
}

export function getDayStartTimestamp(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function getSleepDurationMinutes(startMinutes: number, endMinutes: number): number {
  return normalizeClockMinutes(endMinutes - startMinutes);
}

export function getSleepDurationHours(startMinutes: number, endMinutes: number): number {
  return getSleepDurationMinutes(startMinutes, endMinutes) / 60;
}

export function buildSleepWindowForWakeDate(
  wakeDateTimestamp: number,
  startMinutes: number,
  endMinutes: number
): {
  sleepStartAt: number;
  sleepEndAt: number;
  sleepHours: number;
  durationMinutes: number;
} {
  const dayStart = getDayStartTimestamp(wakeDateTimestamp);
  const normalizedStart = normalizeClockMinutes(startMinutes);
  const normalizedEnd = normalizeClockMinutes(endMinutes);
  const durationMinutes = getSleepDurationMinutes(normalizedStart, normalizedEnd);

  const sleepEndAt = dayStart + (normalizedEnd * MS_PER_MINUTE);
  let sleepStartAt = dayStart + (normalizedStart * MS_PER_MINUTE);

  if (normalizedStart > normalizedEnd) {
    sleepStartAt -= MINUTES_PER_DAY * MS_PER_MINUTE;
  }

  return {
    sleepStartAt,
    sleepEndAt,
    sleepHours: durationMinutes / 60,
    durationMinutes,
  };
}

export function getDefaultSleepWindow(baseTimestamp = Date.now()): {
  sleepStartAt: number;
  sleepEndAt: number;
  sleepHours: number;
  durationMinutes: number;
} {
  return buildSleepWindowForWakeDate(baseTimestamp, 23 * 60, 7 * 60);
}

export function formatSleepClockTime(timestamp: number | null | undefined): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "--";
  }

  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatSleepDurationMinutes(durationMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(durationMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
