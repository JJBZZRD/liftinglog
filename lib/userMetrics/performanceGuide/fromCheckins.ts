import type { UserCheckin } from "../../db/userCheckins";
import { getUserMetricEntries } from "../definitions";
import { METRIC_TYPES } from "./constants";
import { buildPerformanceGuide } from "./performanceGuideEngine";
import type { MetricEntry, PerformanceGuideInput, PerformanceGuideResult } from "./types";

export function buildPerformanceGuideInputFromCheckins(
  checkins: UserCheckin[]
): PerformanceGuideInput {
  const input: PerformanceGuideInput = {};

  for (const metric of METRIC_TYPES) {
    const entries: MetricEntry[] = getUserMetricEntries(checkins, metric).map((entry) => ({
      metric,
      recordedAt: entry.recordedAt,
      value: entry.value,
      sleepStartAt: entry.sleepStartAt,
      sleepEndAt: entry.sleepEndAt,
      note: entry.note,
      context: entry.context,
      source: entry.source,
    }));

    input[metric] = entries;
  }

  return input;
}

export function buildPerformanceGuideFromCheckins(
  checkins: UserCheckin[],
  options?: { now?: number }
): PerformanceGuideResult {
  return buildPerformanceGuide(buildPerformanceGuideInputFromCheckins(checkins), options);
}

