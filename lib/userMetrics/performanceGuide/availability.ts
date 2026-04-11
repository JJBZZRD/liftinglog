import { METRIC_RULES, METRIC_TYPES } from "./constants";
import { clamp, getDaysSince } from "./baselines";
import type {
  MetricAvailability,
  MetricAvailabilityMap,
  MetricBaselineMap,
  MetricType,
} from "./types";

export function computeMetricAvailability(
  baselines: MetricBaselineMap,
  now: number
): MetricAvailabilityMap {
  const availability = {} as MetricAvailabilityMap;

  for (const metric of METRIC_TYPES) {
    const baseline = baselines[metric];
    const rules = METRIC_RULES[metric];
    const latestEntry = baseline.latestEntry;
    const daysSinceLastEntry =
      latestEntry === null ? null : getDaysSince(now, latestEntry.recordedAt);
    const hasRecentData =
      daysSinceLastEntry !== null
      && daysSinceLastEntry <= rules.recentWindowDays
      && baseline.recentEntries.length > 0;

    availability[metric] = {
      metric,
      hasAnyData: baseline.entries.length > 0,
      hasRecentData,
      recentCount: baseline.recentEntries.length,
      baselineCount: baseline.baselineEntries.length,
      daysSinceLastEntry,
      acuteEligible:
        rules.acuteSupported
        && hasRecentData
        && daysSinceLastEntry !== null
        && daysSinceLastEntry <= rules.acuteMaxDaysSinceLastEntry
        && baseline.recentEntries.length >= rules.acuteMinCount,
      trendEligible:
        rules.trendSupported
        && hasRecentData
        && baseline.recentEntries.length >= rules.trendMinRecentCount
        && baseline.baselineEntries.length >= rules.trendMinBaselineCount,
      latestEntry,
    };
  }

  return availability;
}

export function getMetricRecencyScore(
  metric: MetricType,
  availability: MetricAvailability
): number {
  if (availability.daysSinceLastEntry === null) {
    return 0;
  }

  return clamp(
    1 - availability.daysSinceLastEntry / Math.max(METRIC_RULES[metric].maxStaleDays, 1)
  );
}

export function getAcuteSignalReliability(
  metric: MetricType,
  availability: MetricAvailability
): number {
  if (!availability.acuteEligible) {
    return 0;
  }

  const rules = METRIC_RULES[metric];
  const recency = getMetricRecencyScore(metric, availability);
  const density = clamp(availability.recentCount / Math.max(rules.recentTargetCount, 1));
  return clamp(recency * 0.55 + density * 0.45);
}

export function getTrendSignalReliability(
  metric: MetricType,
  availability: MetricAvailability
): number {
  if (!availability.trendEligible) {
    return 0;
  }

  const rules = METRIC_RULES[metric];
  const recency = getMetricRecencyScore(metric, availability);
  const recentDensity = clamp(availability.recentCount / Math.max(rules.recentTargetCount, 1));
  const baselineDensity = clamp(
    availability.baselineCount / Math.max(rules.baselineTargetCount, 1)
  );

  return clamp(recency * 0.3 + recentDensity * 0.35 + baselineDensity * 0.35);
}

