import { METRIC_RULES, METRIC_TYPES, MS_PER_DAY } from "./constants";
import type {
  MetricBaseline,
  MetricBaselineMap,
  MetricEntry,
  MetricType,
  PerformanceGuideInput,
} from "./types";

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function startOfLocalDay(value: number | Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getDaysSince(now: number, recordedAt: number): number {
  const nowDay = startOfLocalDay(now).getTime();
  const entryDay = startOfLocalDay(recordedAt).getTime();
  return Math.max(0, Math.floor((nowDay - entryDay) / MS_PER_DAY));
}

function getRange(entries: MetricEntry[]): { min: number | null; max: number | null } {
  if (entries.length === 0) {
    return { min: null, max: null };
  }

  let min = entries[0].value;
  let max = entries[0].value;

  for (const entry of entries) {
    if (entry.value < min) min = entry.value;
    if (entry.value > max) max = entry.value;
  }

  return { min, max };
}

function normalizeMetricList(metric: MetricType, entries: MetricEntry[] | undefined): MetricEntry[] {
  const latestEntryByDay = new Map<number, MetricEntry>();

  for (const rawEntry of entries ?? []) {
    if (!Number.isFinite(rawEntry.value) || !Number.isFinite(rawEntry.recordedAt)) {
      continue;
    }

    const normalizedEntry: MetricEntry = {
      metric,
      recordedAt: rawEntry.recordedAt,
      value: rawEntry.value,
      sleepStartAt: rawEntry.sleepStartAt ?? null,
      sleepEndAt: rawEntry.sleepEndAt ?? null,
      note: rawEntry.note ?? null,
      context: rawEntry.context ?? null,
      source: rawEntry.source ?? null,
    };
    const dayKey = startOfLocalDay(normalizedEntry.recordedAt).getTime();
    const existing = latestEntryByDay.get(dayKey);

    if (
      !existing
      || normalizedEntry.recordedAt > existing.recordedAt
    ) {
      latestEntryByDay.set(dayKey, normalizedEntry);
    }
  }

  return [...latestEntryByDay.values()].sort((left, right) => left.recordedAt - right.recordedAt);
}

export function normalizeMetricEntries(
  input: PerformanceGuideInput
): Record<MetricType, MetricEntry[]> {
  const normalized = {} as Record<MetricType, MetricEntry[]>;

  for (const metric of METRIC_TYPES) {
    normalized[metric] = normalizeMetricList(metric, input[metric]);
  }

  return normalized;
}

function buildEmptyBaseline(metric: MetricType): MetricBaseline {
  return {
    metric,
    entries: [],
    latestEntry: null,
    recentEntries: [],
    baselineEntries: [],
    recentAverage: null,
    baselineAverage: null,
    recentMin: null,
    recentMax: null,
    baselineMin: null,
    baselineMax: null,
  };
}

export function buildMetricBaselines(
  normalizedEntries: Record<MetricType, MetricEntry[]>,
  now: number
): MetricBaselineMap {
  const baselines = {} as MetricBaselineMap;
  const todayStart = startOfLocalDay(now).getTime();

  for (const metric of METRIC_TYPES) {
    const entries = normalizedEntries[metric] ?? [];
    if (entries.length === 0) {
      baselines[metric] = buildEmptyBaseline(metric);
      continue;
    }

    const rules = METRIC_RULES[metric];
    const recentStart = todayStart - (rules.recentWindowDays - 1) * MS_PER_DAY;
    const baselineStart = recentStart - rules.baselineWindowDays * MS_PER_DAY;
    const recentEntries = entries.filter((entry) => entry.recordedAt >= recentStart);
    const baselineEntries = entries.filter(
      (entry) => entry.recordedAt >= baselineStart && entry.recordedAt < recentStart
    );
    const recentRange = getRange(recentEntries);
    const baselineRange = getRange(baselineEntries);

    baselines[metric] = {
      metric,
      entries,
      latestEntry: entries[entries.length - 1] ?? null,
      recentEntries,
      baselineEntries,
      recentAverage: average(recentEntries.map((entry) => entry.value)),
      baselineAverage: average(baselineEntries.map((entry) => entry.value)),
      recentMin: recentRange.min,
      recentMax: recentRange.max,
      baselineMin: baselineRange.min,
      baselineMax: baselineRange.max,
    };
  }

  return baselines;
}

