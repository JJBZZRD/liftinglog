import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getPREventsForExercise, type PREvent } from "../db/prEvents";
import {
  getExerciseFormulaOverride,
  getGlobalFormula,
  type E1RMFormulaId,
} from "../db/settings";
import { db } from "../db/connection";
import { hasColumn } from "../db/introspection";
import { sets, workoutExercises, workouts } from "../db/schema";
import { computeE1rm } from "../pr";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const TARGET_REP_MAXS = [1, 2, 3, 5, 8, 10] as const;
const TREND_THRESHOLD = 0.005;

export type SessionDataPoint = {
  date: number;
  value: number;
  workoutId: number;
  workoutExerciseId: number | null;
};

export type DateRange = {
  startDate: Date | null;
  endDate: Date;
};

export type SessionSetDetail = {
  id: number;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  note: string | null;
};

export type SessionDetails = {
  date: number;
  workoutId: number;
  workoutExerciseId: number | null;
  performedAt: number | null;
  completedAt: number | null;
  sets: SessionSetDetail[];
  totalSets: number;
  totalReps: number;
  totalVolume: number;
  maxWeight: number;
  maxReps: number;
  bestSet: { weight: number; reps: number } | null;
  estimatedE1RM: number | null;
};

export type ExerciseAnalyticsSetScope = "all" | "work";
export type ExerciseAnalyticsMetricType =
  | "maxWeight"
  | "e1rm"
  | "totalVolume"
  | "maxReps"
  | "numSets";

export type ExerciseAnalyticsSet = {
  id: number;
  workoutId: number;
  workoutExerciseId: number | null;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  note: string | null;
  isWarmup: boolean;
  performedAt: number | null;
};

export type ExerciseAnalyticsSession = {
  date: number;
  workoutId: number;
  workoutExerciseId: number | null;
  performedAt: number | null;
  completedAt: number | null;
  sets: ExerciseAnalyticsSet[];
};

export type ExerciseAnalyticsDataset = {
  exerciseId: number;
  formula: E1RMFormulaId;
  sessions: ExerciseAnalyticsSession[];
  prEvents: PREvent[];
};

export type ExerciseAnalyticsSnapshot = {
  latestValue: number | null;
  bestValue: number | null;
  sessionCount: number;
  daysSinceLastSession: number | null;
};

export type ExerciseAnalyticsProgress = {
  hasEnoughData: boolean;
  rangeChange: number | null;
  recentAverage: number | null;
  previousAverage: number | null;
  recentVsPreviousChange: number | null;
  bestVsLatestGap: number | null;
  trendStatus: "improving" | "flat" | "slipping" | "insufficient";
  momentumValue: number | null;
  momentumStatus: "building" | "steady" | "softening" | "insufficient";
  momentumScore: number | null;
  robustSlopePerSession: number | null;
  confidenceScore: number | null;
  confidenceLabel: "high" | "medium" | "low" | "insufficient";
  plateauRiskScore: number | null;
  plateauRiskLabel: "low" | "moderate" | "high" | "insufficient";
  stabilityScore: number | null;
  stabilityLabel: "stable" | "mixed" | "noisy" | "insufficient";
};

export type ExerciseAnalyticsPRSummary = {
  chips: { targetReps: number; weightKg: number | null }[];
  lastPrDate: number | null;
  prSessionsInRange: number;
  newPrEventsInRange: number;
};

export type ExerciseAnalyticsConsistency = {
  hasEnoughData: boolean;
  sessionsPerWeek: number | null;
  averageGapDays: number | null;
  currentWeeklyStreak: number;
  longestWeeklyStreak: number;
  weekdayCounts: number[];
};

export type RepProfileBucket = {
  id: "1-3" | "4-6" | "7-9" | "10-12+";
  label: string;
  bestSet: {
    weightKg: number;
    reps: number;
    date: number;
  } | null;
};

export type EstimatedRepMaxEntry = {
  targetReps: number;
  projectedWeightKg: number | null;
  isMuted: boolean;
};

export type ExerciseAnalyticsOverview = {
  snapshot: ExerciseAnalyticsSnapshot;
  progress: ExerciseAnalyticsProgress;
  prs: ExerciseAnalyticsPRSummary;
  consistency: ExerciseAnalyticsConsistency;
  repProfile: {
    buckets: RepProfileBucket[];
  };
  estimatedRepMaxes: {
    formulaId: E1RMFormulaId;
    sourceSet: {
      weightKg: number;
      reps: number;
      date: number;
      estimated1RMKg: number;
    } | null;
    entries: EstimatedRepMaxEntry[];
  };
};

export type ExerciseAnalyticsQueryOptions = {
  dateRange?: DateRange;
  setScope?: ExerciseAnalyticsSetScope;
  formula?: E1RMFormulaId;
  now?: number;
};

type ExerciseAnalyticsJoinedSetRow = {
  setId: number;
  workoutId: number;
  workoutExerciseId: number | null;
  setIndex: number | null;
  weightKg: number | null;
  reps: number | null;
  note: string | null;
  isWarmup: boolean;
  setPerformedAt: number | null;
  workoutExercisePerformedAt: number | null;
  workoutExerciseCompletedAt: number | null;
  workoutStartedAt: number;
  workoutCompletedAt: number | null;
};

type ExerciseAnalyticsSessionAccumulator = {
  workoutId: number;
  workoutExerciseId: number | null;
  performedAt: number | null;
  completedAt: number | null;
  workoutStartedAt: number;
  workoutCompletedAt: number | null;
  latestSetPerformedAt: number | null;
  sets: ExerciseAnalyticsSet[];
};

type ExerciseAnalyticsSetLookup = {
  set: ExerciseAnalyticsSet;
  sessionDate: number;
  sessionKey: string;
};

type RepProfileBucketDefinition = {
  id: RepProfileBucket["id"];
  label: string;
  minReps: number;
  maxReps: number | null;
};

const REP_PROFILE_BUCKETS: RepProfileBucketDefinition[] = [
  { id: "1-3", label: "1-3 Reps", minReps: 1, maxReps: 3 },
  { id: "4-6", label: "4-6 Reps", minReps: 4, maxReps: 6 },
  { id: "7-9", label: "7-9 Reps", minReps: 7, maxReps: 9 },
  { id: "10-12+", label: "10-12+ Reps", minReps: 10, maxReps: null },
];

function resolveFormulaForExercise(
  exerciseId: number,
  explicitFormula?: E1RMFormulaId
): E1RMFormulaId {
  return explicitFormula ?? getExerciseFormulaOverride(exerciseId) ?? getGlobalFormula();
}

function toSessionKey(workoutId: number, workoutExerciseId: number | null): string {
  return `${workoutId}:${workoutExerciseId ?? "null"}`;
}

function toRepMaxType(reps: number): string {
  return `${reps}rm`;
}

function isWithinDateRange(timestamp: number, range?: DateRange): boolean {
  if (!range) return true;
  if (range.startDate && timestamp < range.startDate.getTime()) return false;
  if (timestamp > range.endDate.getTime()) return false;
  return true;
}

function sortSessionsChronologically(
  sessions: ExerciseAnalyticsSession[]
): ExerciseAnalyticsSession[] {
  return [...sessions].sort((a, b) => a.date - b.date);
}

function filterSessionSets(
  session: ExerciseAnalyticsSession,
  setScope: ExerciseAnalyticsSetScope
): ExerciseAnalyticsSession | null {
  const filteredSets =
    setScope === "work" ? session.sets.filter((set) => !set.isWarmup) : session.sets;

  if (filteredSets.length === 0) return null;

  return {
    ...session,
    sets: filteredSets,
  };
}

function getFilteredSessions(
  sessions: ExerciseAnalyticsSession[],
  options?: Pick<ExerciseAnalyticsQueryOptions, "dateRange" | "setScope">
): ExerciseAnalyticsSession[] {
  const setScope = options?.setScope ?? "all";

  return sessions
    .map((session) => filterSessionSets(session, setScope))
    .filter((session): session is ExerciseAnalyticsSession => session !== null)
    .filter((session) => isWithinDateRange(session.date, options?.dateRange));
}

function buildSetLookup(
  sessions: ExerciseAnalyticsSession[]
): Map<number, ExerciseAnalyticsSetLookup> {
  const lookup = new Map<number, ExerciseAnalyticsSetLookup>();

  for (const session of sessions) {
    const sessionKey = toSessionKey(session.workoutId, session.workoutExerciseId);
    for (const set of session.sets) {
      lookup.set(set.id, {
        set,
        sessionDate: session.date,
        sessionKey,
      });
    }
  }

  return lookup;
}

function buildSessionsFromRows(
  rows: ExerciseAnalyticsJoinedSetRow[]
): ExerciseAnalyticsSession[] {
  const sessionMap = new Map<string, ExerciseAnalyticsSessionAccumulator>();

  for (const row of rows) {
    const key =
      row.workoutExerciseId !== null
        ? `workout-exercise:${row.workoutExerciseId}`
        : `legacy-workout:${row.workoutId}`;

    const accumulator = sessionMap.get(key) ?? {
      workoutId: row.workoutId,
      workoutExerciseId: row.workoutExerciseId,
      performedAt: row.workoutExercisePerformedAt,
      completedAt: row.workoutExerciseCompletedAt,
      workoutStartedAt: row.workoutStartedAt,
      workoutCompletedAt: row.workoutCompletedAt,
      latestSetPerformedAt: row.setPerformedAt,
      sets: [],
    };

    if (
      row.setPerformedAt !== null &&
      (accumulator.latestSetPerformedAt === null ||
        row.setPerformedAt > accumulator.latestSetPerformedAt)
    ) {
      accumulator.latestSetPerformedAt = row.setPerformedAt;
    }

    accumulator.sets.push({
      id: row.setId,
      workoutId: row.workoutId,
      workoutExerciseId: row.workoutExerciseId,
      setIndex: row.setIndex ?? accumulator.sets.length + 1,
      weightKg: row.weightKg,
      reps: row.reps,
      note: row.note,
      isWarmup: row.isWarmup,
      performedAt: row.setPerformedAt,
    });

    sessionMap.set(key, accumulator);
  }

  return Array.from(sessionMap.values())
    .map((session) => {
      const date =
        session.workoutExerciseId !== null
          ? session.performedAt ??
            session.completedAt ??
            session.latestSetPerformedAt ??
            session.workoutCompletedAt ??
            session.workoutStartedAt
          : session.workoutCompletedAt ?? session.workoutStartedAt;

      return {
        date,
        workoutId: session.workoutId,
        workoutExerciseId: session.workoutExerciseId,
        performedAt: session.performedAt,
        completedAt: session.completedAt,
        sets: [...session.sets].sort((a, b) => {
          const setIndexDiff = a.setIndex - b.setIndex;
          if (setIndexDiff !== 0) return setIndexDiff;
          const timeDiff = (a.performedAt ?? 0) - (b.performedAt ?? 0);
          if (timeDiff !== 0) return timeDiff;
          return a.id - b.id;
        }),
      };
    })
    .sort((a, b) => b.date - a.date);
}

function getMetricValueForSession(
  session: ExerciseAnalyticsSession,
  metric: ExerciseAnalyticsMetricType,
  formula: E1RMFormulaId
): number | null {
  switch (metric) {
    case "maxWeight": {
      const weights = session.sets
        .map((set) => set.weightKg)
        .filter((weight): weight is number => typeof weight === "number");
      return weights.length > 0 ? Math.max(...weights) : null;
    }
    case "e1rm": {
      let maxE1RM = 0;
      for (const set of session.sets) {
        if (
          typeof set.weightKg === "number" &&
          typeof set.reps === "number" &&
          set.weightKg > 0 &&
          set.reps > 0
        ) {
          maxE1RM = Math.max(maxE1RM, computeE1rm(formula, set.weightKg, set.reps));
        }
      }
      return maxE1RM > 0 ? maxE1RM : null;
    }
    case "totalVolume": {
      const totalVolume = session.sets.reduce((sum, set) => {
        if (typeof set.weightKg !== "number" || typeof set.reps !== "number") {
          return sum;
        }
        return sum + set.weightKg * set.reps;
      }, 0);
      return totalVolume > 0 ? totalVolume : null;
    }
    case "maxReps": {
      const reps = session.sets
        .map((set) => set.reps)
        .filter((value): value is number => typeof value === "number");
      return reps.length > 0 ? Math.max(...reps) : null;
    }
    case "numSets":
      return session.sets.length;
    default:
      return null;
  }
}

function getMetricPointsFromSessions(
  sessions: ExerciseAnalyticsSession[],
  metric: ExerciseAnalyticsMetricType,
  formula: E1RMFormulaId
): SessionDataPoint[] {
  return sessions
    .map((session) => {
      const value = getMetricValueForSession(session, metric, formula);
      if (value === null) return null;
      return {
        date: session.date,
        value,
        workoutId: session.workoutId,
        workoutExerciseId: session.workoutExerciseId,
      };
    })
    .filter((point): point is SessionDataPoint => point !== null)
    .sort((a, b) => b.date - a.date);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number = 0, max: number = 1): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sortedValues = [...values].sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
  }

  return sortedValues[middleIndex];
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = average(values) ?? 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeEwmaSeries(values: number[], alpha: number = 0.45): number[] {
  if (values.length === 0) return [];

  const series = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    series.push(alpha * values[index] + (1 - alpha) * series[index - 1]);
  }
  return series;
}

function computeTheilSenSlope(values: number[]): number {
  if (values.length < 2) return 0;

  const slopes: number[] = [];
  for (let startIndex = 0; startIndex < values.length - 1; startIndex += 1) {
    for (let endIndex = startIndex + 1; endIndex < values.length; endIndex += 1) {
      slopes.push((values[endIndex] - values[startIndex]) / (endIndex - startIndex));
    }
  }

  return median(slopes) ?? 0;
}

function computeRegressionStats(values: number[]): {
  slope: number;
  intercept: number;
  rSquared: number;
} {
  if (values.length < 2) {
    return {
      slope: 0,
      intercept: values[0] ?? 0,
      rSquared: 0,
    };
  }

  const xMean = (values.length - 1) / 2;
  const yMean = average(values) ?? 0;

  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < values.length; index += 1) {
    const xDiff = index - xMean;
    numerator += xDiff * (values[index] - yMean);
    denominator += xDiff * xDiff;
  }

  if (denominator === 0) {
    return {
      slope: 0,
      intercept: yMean,
      rSquared: 0,
    };
  }

  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;
  const totalSumSquares = values.reduce((sum, value) => sum + (value - yMean) ** 2, 0);

  if (totalSumSquares === 0) {
    return {
      slope,
      intercept,
      rSquared: 1,
    };
  }

  const residualSumSquares = values.reduce((sum, value, index) => {
    const prediction = intercept + slope * index;
    return sum + (value - prediction) ** 2;
  }, 0);

  return {
    slope,
    intercept,
    rSquared: clamp(1 - residualSumSquares / totalSumSquares),
  };
}

function getConfidenceLabel(
  score: number | null
): ExerciseAnalyticsProgress["confidenceLabel"] {
  if (score === null) return "insufficient";
  if (score >= 0.72) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function getPlateauRiskLabel(
  score: number | null
): ExerciseAnalyticsProgress["plateauRiskLabel"] {
  if (score === null) return "insufficient";
  if (score >= 0.7) return "high";
  if (score >= 0.45) return "moderate";
  return "low";
}

function getStabilityLabel(
  score: number | null
): ExerciseAnalyticsProgress["stabilityLabel"] {
  if (score === null) return "insufficient";
  if (score >= 0.72) return "stable";
  if (score >= 0.45) return "mixed";
  return "noisy";
}

function getMomentumStatus(
  momentumValue: number | null,
  baseline: number
): ExerciseAnalyticsProgress["momentumStatus"] {
  if (momentumValue === null) return "insufficient";

  const normalizedMomentum = momentumValue / Math.max(Math.abs(baseline), 1);
  if (normalizedMomentum >= TREND_THRESHOLD / 2) return "building";
  if (normalizedMomentum <= -TREND_THRESHOLD / 2) return "softening";
  return "steady";
}

function getRegressionTrendStatus(values: number[]): ExerciseAnalyticsProgress["trendStatus"] {
  if (values.length < 4) return "insufficient";

  const { slope } = computeRegressionStats(values);
  const yMean = average(values) ?? 0;
  const baseline = Math.max(Math.abs(yMean), 1);
  const normalizedSlope = slope / baseline;

  if (normalizedSlope >= TREND_THRESHOLD) return "improving";
  if (normalizedSlope <= -TREND_THRESHOLD) return "slipping";
  return "flat";
}

function getWeekStartTimestamp(timestamp: number): number {
  const date = new Date(timestamp);
  const utcDay = date.getUTCDay();
  const mondayOffset = utcDay === 0 ? -6 : 1 - utcDay;
  const mondayStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  mondayStart.setUTCDate(mondayStart.getUTCDate() + mondayOffset);
  return mondayStart.getTime();
}

function buildSnapshot(
  filteredSessions: ExerciseAnalyticsSession[],
  metricPoints: SessionDataPoint[],
  now: number
): ExerciseAnalyticsSnapshot {
  const chronologicalPoints = [...metricPoints].sort((a, b) => a.date - b.date);
  const latestValue =
    chronologicalPoints.length > 0 ? chronologicalPoints[chronologicalPoints.length - 1].value : null;
  const bestValue =
    metricPoints.length > 0 ? Math.max(...metricPoints.map((point) => point.value)) : null;
  const mostRecentSessionDate =
    filteredSessions.length > 0 ? Math.max(...filteredSessions.map((session) => session.date)) : null;

  return {
    latestValue,
    bestValue,
    sessionCount: filteredSessions.length,
    daysSinceLastSession:
      mostRecentSessionDate === null
        ? null
        : Math.max(0, Math.floor((now - mostRecentSessionDate) / MS_PER_DAY)),
  };
}

function buildProgress(metricPoints: SessionDataPoint[]): ExerciseAnalyticsProgress {
  const chronologicalPoints = [...metricPoints].sort((a, b) => a.date - b.date);

  if (chronologicalPoints.length < 4) {
    return {
      hasEnoughData: false,
      rangeChange: null,
      recentAverage: null,
      previousAverage: null,
      recentVsPreviousChange: null,
      bestVsLatestGap: null,
      trendStatus: "insufficient",
      momentumValue: null,
      momentumStatus: "insufficient",
      momentumScore: null,
      robustSlopePerSession: null,
      confidenceScore: null,
      confidenceLabel: "insufficient",
      plateauRiskScore: null,
      plateauRiskLabel: "insufficient",
      stabilityScore: null,
      stabilityLabel: "insufficient",
    };
  }

  const values = chronologicalPoints.map((point) => point.value);
  const latestValue = values[values.length - 1];
  const earliestValue = values[0];
  const bestValue = Math.max(...values);
  const windowSize = Math.min(3, Math.floor(values.length / 2));
  const recentValues = values.slice(-windowSize);
  const previousValues = values.slice(-windowSize * 2, -windowSize);
  const recentAverage = average(recentValues);
  const previousAverage = average(previousValues);
  const ewmaSeries = computeEwmaSeries(values);
  const momentumLookback = Math.min(2, ewmaSeries.length - 1);
  const momentumValue =
    momentumLookback > 0
      ? ewmaSeries[ewmaSeries.length - 1] - ewmaSeries[ewmaSeries.length - 1 - momentumLookback]
      : null;
  const robustSlopePerSession = computeTheilSenSlope(values);
  const regressionStats = computeRegressionStats(values);
  const baseline = Math.max(Math.abs(average(values) ?? 0), 1);
  const standardDeviationValue = standardDeviation(values);
  const slopeStrengthScore = clamp(
    (Math.abs(robustSlopePerSession) * Math.max(values.length - 1, 1)) /
      Math.max(standardDeviationValue * 2, baseline * 0.03, 1)
  );
  const stabilityScore = clamp(
    1 - standardDeviationValue / Math.max(baseline * 0.18, 1)
  );
  const confidenceScore = clamp(
    regressionStats.rSquared * 0.55 + slopeStrengthScore * 0.45
  );
  const plateauRiskScore = clamp(
    (1 - slopeStrengthScore) * 0.55 +
      stabilityScore * 0.25 +
      (getRegressionTrendStatus(values) === "flat"
        ? 0.2
        : getRegressionTrendStatus(values) === "improving"
          ? -0.1
          : -0.05)
  );
  const momentumScore =
    momentumValue === null
      ? null
      : clamp(
          Math.abs(momentumValue) / Math.max(standardDeviationValue, baseline * 0.02, 1)
        );
  const trendStatus = getRegressionTrendStatus(values);

  return {
    hasEnoughData: true,
    rangeChange: latestValue - earliestValue,
    recentAverage,
    previousAverage,
    recentVsPreviousChange:
      recentAverage !== null && previousAverage !== null ? recentAverage - previousAverage : null,
    bestVsLatestGap: bestValue - latestValue,
    trendStatus,
    momentumValue,
    momentumStatus: getMomentumStatus(momentumValue, baseline),
    momentumScore,
    robustSlopePerSession,
    confidenceScore,
    confidenceLabel: getConfidenceLabel(confidenceScore),
    plateauRiskScore,
    plateauRiskLabel: getPlateauRiskLabel(plateauRiskScore),
    stabilityScore,
    stabilityLabel: getStabilityLabel(stabilityScore),
  };
}

function buildPRSummary(
  dataset: ExerciseAnalyticsDataset,
  filteredSessions: ExerciseAnalyticsSession[],
  setScope: ExerciseAnalyticsSetScope,
  dateRange?: DateRange
): ExerciseAnalyticsPRSummary {
  const setLookup = buildSetLookup(dataset.sessions);
  const scopedEvents = [...dataset.prEvents]
    .filter((event) => {
      const sourceSet = setLookup.get(event.setId);
      if (!sourceSet) return false;
      if (setScope === "work" && sourceSet.set.isWarmup) return false;
      return true;
    })
    .sort((a, b) => {
      const occurredDiff = b.occurredAt - a.occurredAt;
      if (occurredDiff !== 0) return occurredDiff;
      return b.id - a.id;
    });

  const currentByType = new Map<string, PREvent>();
  for (const event of scopedEvents) {
    if (!currentByType.has(event.type)) {
      currentByType.set(event.type, event);
    }
  }

  const rangedEvents = scopedEvents.filter((event) => isWithinDateRange(event.occurredAt, dateRange));
  const visibleSessionKeys = new Set(
    filteredSessions.map((session) => toSessionKey(session.workoutId, session.workoutExerciseId))
  );
  const prSessionKeys = new Set<string>();

  for (const event of rangedEvents) {
    const sourceSet = setLookup.get(event.setId);
    if (!sourceSet) continue;
    if (!visibleSessionKeys.has(sourceSet.sessionKey)) continue;
    prSessionKeys.add(sourceSet.sessionKey);
  }

  return {
    chips: TARGET_REP_MAXS.map((targetReps) => ({
      targetReps,
      weightKg: currentByType.get(toRepMaxType(targetReps))?.metricValue ?? null,
    })),
    lastPrDate: scopedEvents[0]?.occurredAt ?? null,
    prSessionsInRange: prSessionKeys.size,
    newPrEventsInRange: rangedEvents.length,
  };
}

function buildConsistency(
  filteredSessions: ExerciseAnalyticsSession[],
  dateRange?: DateRange
): ExerciseAnalyticsConsistency {
  const sortedSessions = sortSessionsChronologically(filteredSessions);
  const weekdayCounts = Array.from({ length: 7 }, () => 0);

  for (const session of sortedSessions) {
    const weekday = new Date(session.date).getDay();
    const mondayFirstIndex = weekday === 0 ? 6 : weekday - 1;
    weekdayCounts[mondayFirstIndex] += 1;
  }

  if (sortedSessions.length < 4) {
    return {
      hasEnoughData: false,
      sessionsPerWeek: null,
      averageGapDays: null,
      currentWeeklyStreak: 0,
      longestWeeklyStreak: 0,
      weekdayCounts,
    };
  }

  const sessionDates = sortedSessions.map((session) => session.date);
  const gaps = sessionDates.slice(1).map((date, index) => (date - sessionDates[index]) / MS_PER_DAY);
  const uniqueWeeks = [...new Set(sessionDates.map(getWeekStartTimestamp))].sort((a, b) => a - b);

  let longestWeeklyStreak = 0;
  let currentWeeklyStreak = 0;
  let streak = 0;

  for (let index = 0; index < uniqueWeeks.length; index += 1) {
    if (index === 0 || uniqueWeeks[index] - uniqueWeeks[index - 1] === MS_PER_WEEK) {
      streak += 1;
    } else {
      streak = 1;
    }
    longestWeeklyStreak = Math.max(longestWeeklyStreak, streak);
  }

  streak = 0;
  for (let index = uniqueWeeks.length - 1; index >= 0; index -= 1) {
    if (
      index === uniqueWeeks.length - 1 ||
      uniqueWeeks[index + 1] - uniqueWeeks[index] === MS_PER_WEEK
    ) {
      streak += 1;
    } else {
      break;
    }
  }
  currentWeeklyStreak = streak;

  const rangeStart =
    dateRange?.startDate?.getTime() ?? sortedSessions[0]?.date ?? Date.now();
  const rangeEnd =
    dateRange?.endDate.getTime() ??
    sortedSessions[sortedSessions.length - 1]?.date ??
    Date.now();
  const weeksInRange = Math.max(1, Math.ceil((rangeEnd - rangeStart + MS_PER_DAY) / MS_PER_WEEK));

  return {
    hasEnoughData: true,
    sessionsPerWeek: sortedSessions.length / weeksInRange,
    averageGapDays: average(gaps),
    currentWeeklyStreak,
    longestWeeklyStreak,
    weekdayCounts,
  };
}

function getRepProfileBucketDefinition(reps: number): RepProfileBucketDefinition | null {
  return (
    REP_PROFILE_BUCKETS.find((bucket) => {
      if (reps < bucket.minReps) return false;
      if (bucket.maxReps !== null && reps > bucket.maxReps) return false;
      return true;
    }) ?? null
  );
}

function isBetterRepProfileSet(
  nextSet: { weightKg: number; reps: number; date: number },
  current: { weightKg: number; reps: number; date: number } | null
): boolean {
  if (!current) return true;
  if (nextSet.weightKg !== current.weightKg) return nextSet.weightKg > current.weightKg;
  if (nextSet.reps !== current.reps) return nextSet.reps > current.reps;
  return nextSet.date > current.date;
}

function buildRepProfile(filteredSessions: ExerciseAnalyticsSession[]): {
  buckets: RepProfileBucket[];
} {
  const bucketMap = new Map<RepProfileBucket["id"], RepProfileBucket["bestSet"]>(
    REP_PROFILE_BUCKETS.map((bucket) => [bucket.id, null])
  );

  for (const session of filteredSessions) {
    for (const set of session.sets) {
      if (
        typeof set.weightKg !== "number" ||
        typeof set.reps !== "number" ||
        set.weightKg <= 0 ||
        set.reps <= 0
      ) {
        continue;
      }

      const bucket = getRepProfileBucketDefinition(set.reps);
      if (!bucket) continue;

      const nextSet = {
        weightKg: set.weightKg,
        reps: set.reps,
        date: session.date,
      };

      if (isBetterRepProfileSet(nextSet, bucketMap.get(bucket.id) ?? null)) {
        bucketMap.set(bucket.id, nextSet);
      }
    }
  }

  return {
    buckets: REP_PROFILE_BUCKETS.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      bestSet: bucketMap.get(bucket.id) ?? null,
    })),
  };
}

function projectWeightFromE1RM(
  formula: E1RMFormulaId,
  estimated1RMKg: number,
  targetReps: number
): number {
  switch (formula) {
    case "epley":
      return estimated1RMKg / (1 + targetReps / 30);
    case "brzycki":
      return (estimated1RMKg * (37 - targetReps)) / 36;
    case "oconner":
      return estimated1RMKg / (1 + 0.025 * targetReps);
    case "lombardi":
      return estimated1RMKg / Math.pow(targetReps, 0.1);
    case "mayhew":
      return (estimated1RMKg * (52.2 + 41.9 * Math.exp(-0.055 * targetReps))) / 100;
    case "wathan":
      return (estimated1RMKg * (48.8 + 53.8 * Math.exp(-0.075 * targetReps))) / 100;
    default: {
      let low = 0;
      let high = estimated1RMKg * 2;
      for (let step = 0; step < 24; step += 1) {
        const mid = (low + high) / 2;
        const projected = computeE1rm(formula, mid, targetReps);
        if (projected > estimated1RMKg) {
          high = mid;
        } else {
          low = mid;
        }
      }
      return (low + high) / 2;
    }
  }
}

function buildEstimatedRepMaxes(
  filteredSessions: ExerciseAnalyticsSession[],
  formula: E1RMFormulaId
): ExerciseAnalyticsOverview["estimatedRepMaxes"] {
  let sourceSet: ExerciseAnalyticsOverview["estimatedRepMaxes"]["sourceSet"] = null;

  for (const session of filteredSessions) {
    for (const set of session.sets) {
      if (
        typeof set.weightKg !== "number" ||
        typeof set.reps !== "number" ||
        set.weightKg <= 0 ||
        set.reps <= 0
      ) {
        continue;
      }

      const estimated1RMKg = computeE1rm(formula, set.weightKg, set.reps);
      const nextSourceSet = {
        weightKg: set.weightKg,
        reps: set.reps,
        date: session.date,
        estimated1RMKg,
      };

      if (
        !sourceSet ||
        estimated1RMKg > sourceSet.estimated1RMKg ||
        (estimated1RMKg === sourceSet.estimated1RMKg && set.weightKg > sourceSet.weightKg) ||
        (estimated1RMKg === sourceSet.estimated1RMKg &&
          set.weightKg === sourceSet.weightKg &&
          set.reps > sourceSet.reps) ||
        (estimated1RMKg === sourceSet.estimated1RMKg &&
          set.weightKg === sourceSet.weightKg &&
          set.reps === sourceSet.reps &&
          session.date > sourceSet.date)
      ) {
        sourceSet = nextSourceSet;
      }
    }
  }

  return {
    formulaId: formula,
    sourceSet,
    entries: TARGET_REP_MAXS.map((targetReps) => ({
      targetReps,
      projectedWeightKg:
        sourceSet === null
          ? null
          : targetReps === 1
            ? sourceSet.estimated1RMKg
            : projectWeightFromE1RM(formula, sourceSet.estimated1RMKg, targetReps),
      isMuted: sourceSet === null ? false : Math.abs(targetReps - sourceSet.reps) > 4,
    })),
  };
}

export function buildExerciseAnalyticsOverview(
  dataset: ExerciseAnalyticsDataset,
  metric: ExerciseAnalyticsMetricType,
  options?: ExerciseAnalyticsQueryOptions
): ExerciseAnalyticsOverview {
  const formula = options?.formula ?? dataset.formula;
  const now = options?.now ?? Date.now();
  const setScope = options?.setScope ?? "all";
  const filteredSessions = getFilteredSessions(dataset.sessions, {
    dateRange: options?.dateRange,
    setScope,
  });
  const metricPoints = getMetricPointsFromSessions(filteredSessions, metric, formula);

  return {
    snapshot: buildSnapshot(filteredSessions, metricPoints, now),
    progress: buildProgress(metricPoints),
    prs: buildPRSummary(dataset, filteredSessions, setScope, options?.dateRange),
    consistency: buildConsistency(filteredSessions, options?.dateRange),
    repProfile: buildRepProfile(filteredSessions),
    estimatedRepMaxes: buildEstimatedRepMaxes(filteredSessions, formula),
  };
}

export function getMetricDataPoints(
  dataset: ExerciseAnalyticsDataset,
  metric: ExerciseAnalyticsMetricType,
  options?: ExerciseAnalyticsQueryOptions
): SessionDataPoint[] {
  const formula = options?.formula ?? dataset.formula;
  const filteredSessions = getFilteredSessions(dataset.sessions, {
    dateRange: options?.dateRange,
    setScope: options?.setScope,
  });
  return getMetricPointsFromSessions(filteredSessions, metric, formula);
}

export function getCurrentPRSessionKeysFromDataset(
  dataset: ExerciseAnalyticsDataset,
  setScope: ExerciseAnalyticsSetScope = "all"
): Set<string> {
  const setLookup = buildSetLookup(dataset.sessions);
  const scopedEvents = [...dataset.prEvents]
    .filter((event) => {
      const sourceSet = setLookup.get(event.setId);
      if (!sourceSet) return false;
      if (setScope === "work" && sourceSet.set.isWarmup) return false;
      return true;
    })
    .sort((a, b) => {
      const occurredDiff = b.occurredAt - a.occurredAt;
      if (occurredDiff !== 0) return occurredDiff;
      return b.id - a.id;
    });

  const seenTypes = new Set<string>();
  const keys = new Set<string>();

  for (const event of scopedEvents) {
    if (seenTypes.has(event.type)) continue;
    seenTypes.add(event.type);
    const sourceSet = setLookup.get(event.setId);
    if (!sourceSet) continue;
    keys.add(sourceSet.sessionKey);
  }

  return keys;
}

export async function getExerciseAnalyticsDataset(
  exerciseId: number,
  formula?: E1RMFormulaId
): Promise<ExerciseAnalyticsDataset> {
  const canQueryWorkoutExerciseColumns =
    hasColumn("workout_exercises", "performed_at") &&
    hasColumn("workout_exercises", "completed_at");

  const rows = await db
    .select({
      setId: sets.id,
      workoutId: sets.workoutId,
      workoutExerciseId: sets.workoutExerciseId,
      setIndex: sets.setIndex,
      weightKg: sets.weightKg,
      reps: sets.reps,
      note: sets.note,
      isWarmup: sets.isWarmup,
      setPerformedAt: sets.performedAt,
      workoutExercisePerformedAt: canQueryWorkoutExerciseColumns
        ? workoutExercises.performedAt
        : sql<number | null>`NULL`.as("workout_exercise_performed_at"),
      workoutExerciseCompletedAt: canQueryWorkoutExerciseColumns
        ? workoutExercises.completedAt
        : sql<number | null>`NULL`.as("workout_exercise_completed_at"),
      workoutStartedAt: workouts.startedAt,
      workoutCompletedAt: workouts.completedAt,
    })
    .from(sets)
    .leftJoin(
      workoutExercises,
      and(
        eq(sets.workoutExerciseId, workoutExercises.id),
        eq(sets.workoutId, workoutExercises.workoutId)
      )
    )
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(eq(sets.exerciseId, exerciseId))
    .orderBy(desc(workouts.startedAt), desc(sets.performedAt), desc(sets.id));

  const sessions = buildSessionsFromRows(rows);

  return {
    exerciseId,
    formula: resolveFormulaForExercise(exerciseId, formula),
    sessions,
    prEvents: await getPREventsForExercise(exerciseId),
  };
}

function resolveE1rmQueryOptions(
  formulaOrOptions?: E1RMFormulaId | ExerciseAnalyticsQueryOptions
): ExerciseAnalyticsQueryOptions {
  if (!formulaOrOptions) return {};
  if (typeof formulaOrOptions === "string") {
    return { formula: formulaOrOptions };
  }
  return formulaOrOptions;
}

/**
 * Filter data points by date range
 */
export function filterByDateRange(
  data: SessionDataPoint[],
  range: DateRange
): SessionDataPoint[] {
  const { startDate, endDate } = range;
  return data.filter((point) => {
    if (startDate && point.date < startDate.getTime()) return false;
    if (point.date > endDate.getTime()) return false;
    return true;
  });
}

/**
 * Get detailed session information for a specific workout
 * Includes individual sets for display in modal
 */
export async function getSessionDetails(
  exerciseId: number,
  workoutId: number
): Promise<SessionDetails | null> {
  if (__DEV__) {
    console.log("[getSessionDetails] Querying sets for:", { exerciseId, workoutId });
  }

  const sessionSets = await db
    .select({
      id: sets.id,
      workoutExerciseId: sets.workoutExerciseId,
      setIndex: sets.setIndex,
      weightKg: sets.weightKg,
      reps: sets.reps,
      note: sets.note,
    })
    .from(sets)
    .where(and(eq(sets.exerciseId, exerciseId), eq(sets.workoutId, workoutId)))
    .orderBy(sets.setIndex);

  if (__DEV__) {
    console.log("[getSessionDetails] Query returned:", {
      exerciseId,
      workoutId,
      setsFound: sessionSets.length,
      firstSet: sessionSets[0] ?? null,
    });
  }

  if (sessionSets.length === 0) return null;

  const workout = await db
    .select({
      startedAt: workouts.startedAt,
      completedAt: workouts.completedAt,
    })
    .from(workouts)
    .where(eq(workouts.id, workoutId))
    .limit(1);

  const workoutStartedAt = workout[0]?.startedAt ?? Date.now();
  const workoutCompletedAt = workout[0]?.completedAt ?? null;

  let performedAt: number | null = null;
  let completedAt: number | null = null;

  const canQueryWorkoutExerciseColumns =
    hasColumn("workout_exercises", "performed_at") &&
    hasColumn("workout_exercises", "completed_at");

  if (canQueryWorkoutExerciseColumns) {
    const workoutExerciseIds = [
      ...new Set(
        sessionSets
          .map((set) => set.workoutExerciseId)
          .filter((id): id is number => typeof id === "number")
      ),
    ];

    if (workoutExerciseIds.length > 0) {
      const rows = await db
        .select({
          performedAt: workoutExercises.performedAt,
          completedAt: workoutExercises.completedAt,
        })
        .from(workoutExercises)
        .where(inArray(workoutExercises.id, workoutExerciseIds));

      const anyInProgress = rows.some((row) => row.completedAt === null);
      completedAt = anyInProgress
        ? null
        : rows
            .map((row) => row.completedAt)
            .filter((timestamp): timestamp is number => typeof timestamp === "number")
            .sort((a, b) => b - a)[0] ?? null;

      performedAt =
        rows
          .map((row) => row.performedAt)
          .filter((timestamp): timestamp is number => typeof timestamp === "number")
          .sort((a, b) => b - a)[0] ?? null;
    } else {
      const rows = await db
        .select({
          performedAt: workoutExercises.performedAt,
          completedAt: workoutExercises.completedAt,
        })
        .from(workoutExercises)
        .where(
          and(eq(workoutExercises.workoutId, workoutId), eq(workoutExercises.exerciseId, exerciseId))
        )
        .orderBy(desc(workoutExercises.performedAt), desc(workoutExercises.id))
        .limit(1);

      performedAt = rows[0]?.performedAt ?? null;
      completedAt = rows[0]?.completedAt ?? null;
    }
  } else {
    completedAt = workoutCompletedAt;
  }

  const workoutDate = performedAt ?? completedAt ?? workoutCompletedAt ?? workoutStartedAt ?? Date.now();

  const uniqueWorkoutExerciseIds = [
    ...new Set(
      sessionSets
        .map((set) => set.workoutExerciseId)
        .filter((id): id is number => typeof id === "number")
    ),
  ];
  const workoutExerciseIdForSession =
    uniqueWorkoutExerciseIds.length === 1 ? uniqueWorkoutExerciseIds[0] : null;

  const setDetails: SessionSetDetail[] = sessionSets.map((set, index) => ({
    id: set.id,
    setIndex: set.setIndex ?? index + 1,
    weightKg: set.weightKg,
    reps: set.reps,
    note: set.note,
  }));

  let totalReps = 0;
  let totalVolume = 0;
  let maxWeight = 0;
  let maxReps = 0;
  let bestSet: { weight: number; reps: number } | null = null;
  let maxE1RM = 0;

  const formula = resolveFormulaForExercise(exerciseId);

  for (const set of sessionSets) {
    const weight = set.weightKg ?? 0;
    const reps = set.reps ?? 0;

    totalReps += reps;
    totalVolume += weight * reps;

    if (weight > maxWeight) maxWeight = weight;
    if (reps > maxReps) maxReps = reps;

    if (weight > 0 && reps > 0) {
      const e1rm = computeE1rm(formula, weight, reps);
      if (e1rm > maxE1RM) {
        maxE1RM = e1rm;
        bestSet = { weight, reps };
      }
    }
  }

  return {
    date: workoutDate,
    workoutId,
    workoutExerciseId: workoutExerciseIdForSession,
    performedAt,
    completedAt,
    sets: setDetails,
    totalSets: sessionSets.length,
    totalReps,
    totalVolume,
    maxWeight,
    maxReps,
    bestSet,
    estimatedE1RM: maxE1RM > 0 ? maxE1RM : null,
  };
}

/**
 * Get detailed session information for a specific workout_exercise entry.
 * This is the canonical "session" identifier when multiple sessions occur on the same day/workout.
 */
export async function getSessionDetailsByWorkoutExerciseId(
  workoutExerciseId: number
): Promise<SessionDetails | null> {
  const canQueryWorkoutExerciseColumns =
    hasColumn("workout_exercises", "performed_at") &&
    hasColumn("workout_exercises", "completed_at");

  const workoutExerciseRows = await db
    .select({
      exerciseId: workoutExercises.exerciseId,
      workoutId: workoutExercises.workoutId,
      performedAt: canQueryWorkoutExerciseColumns
        ? workoutExercises.performedAt
        : sql<number | null>`NULL`.as("performed_at"),
      completedAt: canQueryWorkoutExerciseColumns
        ? workoutExercises.completedAt
        : sql<number | null>`NULL`.as("completed_at"),
      workoutStartedAt: workouts.startedAt,
      workoutCompletedAt: workouts.completedAt,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(workoutExercises.id, workoutExerciseId))
    .limit(1);

  const workoutExercise = workoutExerciseRows[0];
  if (!workoutExercise) return null;

  const sessionSets = await db
    .select({
      id: sets.id,
      setIndex: sets.setIndex,
      weightKg: sets.weightKg,
      reps: sets.reps,
      note: sets.note,
      performedAt: sets.performedAt,
    })
    .from(sets)
    .where(eq(sets.workoutExerciseId, workoutExerciseId))
    .orderBy(sets.setIndex, sets.performedAt, sets.id);

  if (sessionSets.length === 0) return null;

  const workoutDate =
    workoutExercise.performedAt ??
    workoutExercise.completedAt ??
    sessionSets
      .map((set) => set.performedAt)
      .filter((timestamp): timestamp is number => typeof timestamp === "number")
      .sort((a, b) => b - a)[0] ??
    workoutExercise.workoutCompletedAt ??
    workoutExercise.workoutStartedAt ??
    Date.now();

  const setDetails: SessionSetDetail[] = sessionSets.map((set, index) => ({
    id: set.id,
    setIndex: set.setIndex ?? index + 1,
    weightKg: set.weightKg,
    reps: set.reps,
    note: set.note,
  }));

  let totalReps = 0;
  let totalVolume = 0;
  let maxWeight = 0;
  let maxReps = 0;
  let bestSet: { weight: number; reps: number } | null = null;
  let maxE1RM = 0;

  const formula = resolveFormulaForExercise(workoutExercise.exerciseId);

  for (const set of sessionSets) {
    const weight = set.weightKg ?? 0;
    const reps = set.reps ?? 0;

    totalReps += reps;
    totalVolume += weight * reps;

    if (weight > maxWeight) maxWeight = weight;
    if (reps > maxReps) maxReps = reps;

    if (weight > 0 && reps > 0) {
      const e1rm = computeE1rm(formula, weight, reps);
      if (e1rm > maxE1RM) {
        maxE1RM = e1rm;
        bestSet = { weight, reps };
      }
    }
  }

  return {
    date: workoutDate,
    workoutId: workoutExercise.workoutId,
    workoutExerciseId,
    performedAt: workoutExercise.performedAt ?? null,
    completedAt: workoutExercise.completedAt ?? null,
    sets: setDetails,
    totalSets: sessionSets.length,
    totalReps,
    totalVolume,
    maxWeight,
    maxReps,
    bestSet,
    estimatedE1RM: maxE1RM > 0 ? maxE1RM : null,
  };
}

/**
 * Get the maximum weight lifted per session for an exercise.
 */
export async function getMaxWeightPerSession(
  exerciseId: number,
  options?: ExerciseAnalyticsQueryOptions
): Promise<SessionDataPoint[]> {
  const dataset = await getExerciseAnalyticsDataset(exerciseId, options?.formula);
  return getMetricDataPoints(dataset, "maxWeight", options);
}

/**
 * Get the best estimated 1RM per session for an exercise.
 * Supports either the legacy formula argument or the new options object.
 */
export async function getEstimated1RMPerSession(
  exerciseId: number,
  formulaOrOptions?: E1RMFormulaId | ExerciseAnalyticsQueryOptions
): Promise<SessionDataPoint[]> {
  const options = resolveE1rmQueryOptions(formulaOrOptions);
  const dataset = await getExerciseAnalyticsDataset(exerciseId, options.formula);
  return getMetricDataPoints(dataset, "e1rm", options);
}

/**
 * Get total volume (weight × reps) per session for an exercise.
 */
export async function getTotalVolumePerSession(
  exerciseId: number,
  options?: ExerciseAnalyticsQueryOptions
): Promise<SessionDataPoint[]> {
  const dataset = await getExerciseAnalyticsDataset(exerciseId, options?.formula);
  return getMetricDataPoints(dataset, "totalVolume", options);
}

/**
 * Get maximum reps per session for an exercise.
 */
export async function getMaxRepsPerSession(
  exerciseId: number,
  options?: ExerciseAnalyticsQueryOptions
): Promise<SessionDataPoint[]> {
  const dataset = await getExerciseAnalyticsDataset(exerciseId, options?.formula);
  return getMetricDataPoints(dataset, "maxReps", options);
}

/**
 * Get number of sets per session for an exercise.
 */
export async function getNumberOfSetsPerSession(
  exerciseId: number,
  options?: ExerciseAnalyticsQueryOptions
): Promise<SessionDataPoint[]> {
  const dataset = await getExerciseAnalyticsDataset(exerciseId, options?.formula);
  return getMetricDataPoints(dataset, "numSets", options);
}

/**
 * Get all card data for the Analytics tab.
 */
export async function getExerciseAnalyticsOverview(
  exerciseId: number,
  metric: ExerciseAnalyticsMetricType,
  options?: ExerciseAnalyticsQueryOptions
): Promise<ExerciseAnalyticsOverview> {
  const dataset = await getExerciseAnalyticsDataset(exerciseId, options?.formula);
  return buildExerciseAnalyticsOverview(dataset, metric, options);
}

/**
 * Compute a simple moving average trend line from session data.
 */
export function computeTrendLine(
  data: SessionDataPoint[],
  windowSize: number = 5
): SessionDataPoint[] {
  if (data.length === 0) return [];

  const sorted = [...data].sort((a, b) => a.date - b.date);

  return sorted.map((point, index) => {
    const startIndex = Math.max(0, index - windowSize + 1);
    const windowPoints = sorted.slice(startIndex, index + 1);
    const sum = windowPoints.reduce((accumulator, current) => accumulator + current.value, 0);
    const averageValue = sum / windowPoints.length;

    return {
      date: point.date,
      value: averageValue,
      workoutId: point.workoutId,
      workoutExerciseId: point.workoutExerciseId,
    };
  });
}
