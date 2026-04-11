import type { MetricType, PerformanceZone } from "./types";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const METRIC_TYPES = [
  "bodyweight",
  "waist",
  "sleep",
  "restingHr",
  "fatigue",
  "soreness",
  "stress",
  "steps",
] as const satisfies readonly MetricType[];

export const CORE_METRICS = [
  "sleep",
  "restingHr",
  "fatigue",
  "soreness",
  "stress",
] as const satisfies readonly MetricType[];

export const METRIC_LABELS: Record<MetricType, string> = {
  bodyweight: "bodyweight",
  waist: "waist",
  sleep: "sleep",
  restingHr: "resting HR",
  fatigue: "fatigue",
  soreness: "soreness",
  stress: "stress",
  steps: "steps",
};

export type MetricRule = {
  weight: number;
  recentWindowDays: number;
  baselineWindowDays: number;
  recentTargetCount: number;
  baselineTargetCount: number;
  acuteMinCount: number;
  trendMinRecentCount: number;
  trendMinBaselineCount: number;
  acuteMaxDaysSinceLastEntry: number;
  maxStaleDays: number;
  acuteSupported: boolean;
  trendSupported: boolean;
};

export const METRIC_RULES: Record<MetricType, MetricRule> = {
  bodyweight: {
    weight: 0.8,
    recentWindowDays: 14,
    baselineWindowDays: 28,
    recentTargetCount: 6,
    baselineTargetCount: 10,
    acuteMinCount: 0,
    trendMinRecentCount: 3,
    trendMinBaselineCount: 6,
    acuteMaxDaysSinceLastEntry: 0,
    maxStaleDays: 21,
    acuteSupported: false,
    trendSupported: true,
  },
  waist: {
    weight: 0.55,
    recentWindowDays: 21,
    baselineWindowDays: 42,
    recentTargetCount: 3,
    baselineTargetCount: 6,
    acuteMinCount: 0,
    trendMinRecentCount: 2,
    trendMinBaselineCount: 4,
    acuteMaxDaysSinceLastEntry: 0,
    maxStaleDays: 30,
    acuteSupported: false,
    trendSupported: true,
  },
  sleep: {
    weight: 1.2,
    recentWindowDays: 7,
    baselineWindowDays: 21,
    recentTargetCount: 5,
    baselineTargetCount: 10,
    acuteMinCount: 1,
    trendMinRecentCount: 3,
    trendMinBaselineCount: 7,
    acuteMaxDaysSinceLastEntry: 2,
    maxStaleDays: 7,
    acuteSupported: true,
    trendSupported: true,
  },
  restingHr: {
    weight: 1.1,
    recentWindowDays: 7,
    baselineWindowDays: 21,
    recentTargetCount: 4,
    baselineTargetCount: 9,
    acuteMinCount: 0,
    trendMinRecentCount: 3,
    trendMinBaselineCount: 7,
    acuteMaxDaysSinceLastEntry: 0,
    maxStaleDays: 7,
    acuteSupported: false,
    trendSupported: true,
  },
  fatigue: {
    weight: 1.15,
    recentWindowDays: 7,
    baselineWindowDays: 21,
    recentTargetCount: 4,
    baselineTargetCount: 8,
    acuteMinCount: 1,
    trendMinRecentCount: 3,
    trendMinBaselineCount: 6,
    acuteMaxDaysSinceLastEntry: 2,
    maxStaleDays: 7,
    acuteSupported: true,
    trendSupported: true,
  },
  soreness: {
    weight: 0.8,
    recentWindowDays: 7,
    baselineWindowDays: 21,
    recentTargetCount: 4,
    baselineTargetCount: 8,
    acuteMinCount: 1,
    trendMinRecentCount: 3,
    trendMinBaselineCount: 6,
    acuteMaxDaysSinceLastEntry: 2,
    maxStaleDays: 7,
    acuteSupported: true,
    trendSupported: true,
  },
  stress: {
    weight: 0.95,
    recentWindowDays: 7,
    baselineWindowDays: 21,
    recentTargetCount: 4,
    baselineTargetCount: 8,
    acuteMinCount: 1,
    trendMinRecentCount: 3,
    trendMinBaselineCount: 6,
    acuteMaxDaysSinceLastEntry: 2,
    maxStaleDays: 7,
    acuteSupported: true,
    trendSupported: true,
  },
  steps: {
    weight: 0.65,
    recentWindowDays: 7,
    baselineWindowDays: 21,
    recentTargetCount: 5,
    baselineTargetCount: 10,
    acuteMinCount: 1,
    trendMinRecentCount: 4,
    trendMinBaselineCount: 8,
    acuteMaxDaysSinceLastEntry: 2,
    maxStaleDays: 7,
    acuteSupported: true,
    trendSupported: true,
  },
};

export const PERFORMANCE_ZONE_THRESHOLDS: Record<PerformanceZone, number> = {
  peak: 0.65,
  ready: 0.25,
  stable: -0.2,
  caution: -0.55,
  compromised: -1,
};

export const CONFIDENCE_THRESHOLDS = {
  high: 0.72,
  medium: 0.45,
};

export const MAX_REASON_COUNT = 4;
export const MAX_NOTE_COUNT = 4;

export const BODYWEIGHT_THRESHOLDS = {
  gradualLossWeeklyFraction: -0.006,
  rapidLossWeeklyFraction: -0.012,
  waistDropCm: -1.0,
  waistRiseCm: 1.0,
};

export const SLEEP_THRESHOLDS = {
  veryPoorHours: 5.25,
  poorHours: 6.25,
  goodHours: 8,
  belowBaselineHours: -0.75,
  aboveBaselineHours: 0.75,
};

export const RHR_THRESHOLDS = {
  elevatedBpm: 5,
  favorableBpm: -4,
};

export const SCORE_METRIC_THRESHOLDS = {
  low: 2,
  high: 4,
  veryHigh: 5,
  trendDelta: 0.75,
};

export const STEPS_THRESHOLDS = {
  acuteHighSteps: 18_000,
  spikeRatio: 1.4,
  elevatedRecentRatio: 1.25,
  elevatedAbsoluteDelta: 2_500,
};

export const PATTERN_WEIGHTS = {
  aggressiveCutWarning: 1.15,
  acutePoorRecoveryDay: 1.05,
  primedForPerformance: 1.1,
  narrowDataWarning: 0,
};

