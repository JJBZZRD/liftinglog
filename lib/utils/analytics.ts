import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getPBEventsForExercise, type PBEvent } from "../db/pbEvents";
import { getExerciseScopeIdsForView } from "../db/exercises";
import {
  getExerciseFormulaOverride,
  getGlobalFormula,
  type E1RMFormulaId,
} from "../db/settings";
import { db } from "../db/connection";
import { hasColumn } from "../db/introspection";
import { exercises, sets, workoutExercises, workouts } from "../db/schema";
import { computeE1rm, projectWeightFromE1rm } from "../pb";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const TARGET_REP_MAXS = [1, 2, 3, 5, 8, 10] as const;
const TREND_THRESHOLD = 0.005;

export type SessionDataPoint = {
  date: number;
  value: number;
  workoutId: number;
  workoutExerciseId: number | null;
  loggedExerciseId?: number;
  loggedExerciseName?: string;
  loggedExerciseVariationLabel?: string | null;
  loggedExerciseParentExerciseId?: number | null;
  loggedExerciseParentName?: string | null;
  isVariation?: boolean;
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
  loggedExerciseId?: number;
  loggedExerciseName?: string;
  loggedExerciseVariationLabel?: string | null;
  loggedExerciseParentExerciseId?: number | null;
  loggedExerciseParentName?: string | null;
  isVariation?: boolean;
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
export type ExerciseAnalyticsBucketId = "1-3" | "4-6" | "7-9" | "10-12+";
export type ExerciseAnalyticsOverlayType =
  | "trendLine"
  | "ewma"
  | "robustTrend"
  | "pbMarkers"
  | "plateauZones"
  | "weeklyBand"
  | "outliers"
  | "repBuckets";

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
  loggedExerciseId?: number;
  loggedExerciseName?: string;
  loggedExerciseVariationLabel?: string | null;
  loggedExerciseParentExerciseId?: number | null;
  loggedExerciseParentName?: string | null;
  isVariation?: boolean;
  performedAt: number | null;
  completedAt: number | null;
  sets: ExerciseAnalyticsSet[];
};

export type ExerciseAnalyticsDataset = {
  exerciseId: number;
  formula: E1RMFormulaId;
  sessions: ExerciseAnalyticsSession[];
  pbEvents: PBEvent[];
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

export type ExerciseAnalyticsBucketTrend = {
  id: ExerciseAnalyticsBucketId;
  label: string;
  sessionCount: number;
  latestStrengthKg: number | null;
  bestStrengthKg: number | null;
  normalizedSlope: number | null;
  robustSlopeKg: number | null;
  momentumKg: number | null;
  confidenceScore: number | null;
  confidenceLabel: ExerciseAnalyticsProgress["confidenceLabel"];
  baseWeight: number;
  effectiveWeight: number;
  trendStatus: ExerciseAnalyticsProgress["trendStatus"];
};

export type ExerciseAnalyticsPerformanceProgress = {
  hasEnoughData: boolean;
  materialGainStatus: "improving" | "flat" | "slipping" | "mixed" | "insufficient";
  absoluteProgressScore: number | null;
  daysSinceLastMeaningfulGain: number | null;
  meaningfulGainConfidence: "high" | "low" | "insufficient";
  strongestImprovingBucket: {
    id: ExerciseAnalyticsBucketId;
    label: string;
    normalizedSlope: number | null;
  } | null;
  weakestBucket: {
    id: ExerciseAnalyticsBucketId;
    label: string;
    normalizedSlope: number | null;
  } | null;
  comparabilityScore: number | null;
  comparabilityLabel: "high" | "moderate" | "less-comparable" | "insufficient";
  repRangeDriftFlag: boolean;
  dominantRecentBucket: ExerciseAnalyticsBucketId | null;
  historicalMedianBucket: ExerciseAnalyticsBucketId | null;
  bucketTrends: ExerciseAnalyticsBucketTrend[];
};

export type ExerciseAnalyticsPBSummary = {
  chips: { targetReps: number; weightKg: number | null }[];
  lastPbDate: number | null;
  pbSessionsInRange: number;
  newPbEventsInRange: number;
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
  id: ExerciseAnalyticsBucketId;
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

export type ExerciseAnalyticsChartLineStyle = "solid" | "dashed";
export type ExerciseAnalyticsChartColorToken =
  | "primary"
  | "secondary"
  | "muted"
  | "success"
  | "warning"
  | "gold";
export type ExerciseAnalyticsChartBandPoint = {
  date: number;
  center: number;
  lower: number;
  upper: number;
};
export type ExerciseAnalyticsChartMarkerPoint = SessionDataPoint & {
  variant: "pb" | "positive" | "negative" | ExerciseAnalyticsBucketId;
};

export type ExerciseAnalyticsChartOverlay =
  | {
      overlayType: "trendLine" | "ewma" | "robustTrend";
      kind: "line";
      colorToken: ExerciseAnalyticsChartColorToken;
      style: ExerciseAnalyticsChartLineStyle;
      points: SessionDataPoint[];
    }
  | {
      overlayType: "weeklyBand";
      kind: "band";
      colorToken: ExerciseAnalyticsChartColorToken;
      points: ExerciseAnalyticsChartBandPoint[];
    }
  | {
      overlayType: "plateauZones";
      kind: "zone";
      colorToken: ExerciseAnalyticsChartColorToken;
      ranges: {
        startDate: number;
        endDate: number;
        severity: "moderate" | "high";
      }[];
    }
  | {
      overlayType: "pbMarkers" | "outliers" | "repBuckets";
      kind: "marker";
      colorToken: ExerciseAnalyticsChartColorToken;
      points: ExerciseAnalyticsChartMarkerPoint[];
    };

export type ExerciseAnalyticsOverlayAvailability = {
  type: ExerciseAnalyticsOverlayType;
  enabled: boolean;
  reason?: string;
};

export type ExerciseAnalyticsOverview = {
  snapshot: ExerciseAnalyticsSnapshot;
  metricTrend: ExerciseAnalyticsProgress;
  performanceProgress: ExerciseAnalyticsPerformanceProgress;
  pbs: ExerciseAnalyticsPBSummary;
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

export type ExerciseAnalyticsOverlayQueryOptions = ExerciseAnalyticsQueryOptions & {
  selectedOverlays?: ExerciseAnalyticsOverlayType[];
};

type ExerciseAnalyticsJoinedSetRow = {
  setId: number;
  workoutId: number;
  workoutExerciseId: number | null;
  loggedExerciseId: number;
  loggedExerciseName: string;
  loggedExerciseVariationLabel: string | null;
  loggedExerciseParentExerciseId: number | null;
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
  loggedExerciseId: number;
  loggedExerciseName: string;
  loggedExerciseVariationLabel: string | null;
  loggedExerciseParentExerciseId: number | null;
  loggedExerciseParentName: string | null;
  isVariation: boolean;
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
  id: ExerciseAnalyticsBucketId;
  label: string;
  minReps: number;
  maxReps: number | null;
};

export type ExerciseAnalyticsPerformanceFacts = {
  filteredSessions: ExerciseAnalyticsSession[];
  now: number;
};

type SessionBucketStrength = {
  id: ExerciseAnalyticsBucketId;
  label: string;
  date: number;
  strengthKg: number;
  weightKg: number;
  reps: number;
  setIndex: number;
};

type SessionPerformanceSummary = {
  date: number;
  workoutId: number;
  workoutExerciseId: number | null;
  dominantBucketId: ExerciseAnalyticsBucketId | null;
  bucketBestSets: Partial<Record<ExerciseAnalyticsBucketId, SessionBucketStrength>>;
};

type WeeklyAggregatePoint = {
  date: number;
  value: number;
};

type ExerciseDisplayMeta = {
  exerciseId: number;
  exerciseName: string;
  exerciseVariationLabel: string | null;
  exerciseParentExerciseId: number | null;
  exerciseParentName: string | null;
  isVariation: boolean;
};

const REP_PROFILE_BUCKETS: RepProfileBucketDefinition[] = [
  { id: "1-3", label: "1-3 Reps", minReps: 1, maxReps: 3 },
  { id: "4-6", label: "4-6 Reps", minReps: 4, maxReps: 6 },
  { id: "7-9", label: "7-9 Reps", minReps: 7, maxReps: 9 },
  { id: "10-12+", label: "10-12+ Reps", minReps: 10, maxReps: null },
];

async function listExerciseDisplayMeta(
  exerciseIds: number[]
): Promise<Map<number, ExerciseDisplayMeta>> {
  const uniqueExerciseIds = [
    ...new Set(
      exerciseIds.filter(
        (exerciseId): exerciseId is number =>
          typeof exerciseId === "number" &&
          Number.isInteger(exerciseId) &&
          exerciseId > 0
      )
    ),
  ];
  if (uniqueExerciseIds.length === 0) {
    return new Map();
  }

  const exerciseRows = await db
    .select()
    .from(exercises)
    .where(
      uniqueExerciseIds.length === 1
        ? eq(exercises.id, uniqueExerciseIds[0])
        : inArray(exercises.id, uniqueExerciseIds)
    );

  const parentIds = [
    ...new Set(
      exerciseRows
        .map((exercise) => exercise.parentExerciseId)
        .filter((exerciseId): exerciseId is number => typeof exerciseId === "number")
    ),
  ];
  const parentRows =
    parentIds.length === 0
      ? []
      : await db
          .select({ id: exercises.id, name: exercises.name })
          .from(exercises)
          .where(
            parentIds.length === 1
              ? eq(exercises.id, parentIds[0])
              : inArray(exercises.id, parentIds)
          );
  const parentNameById = new Map(parentRows.map((row) => [row.id, row.name] as const));

  return new Map(
    exerciseRows.map((exercise) => [
      exercise.id,
      {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        exerciseVariationLabel: exercise.variationLabel ?? null,
        exerciseParentExerciseId: exercise.parentExerciseId ?? null,
        exerciseParentName:
          exercise.parentExerciseId !== null
            ? parentNameById.get(exercise.parentExerciseId) ?? null
            : null,
        isVariation: exercise.parentExerciseId !== null,
      },
    ])
  );
}

const BUCKET_CONFIDENCE_WEIGHTS: Record<ExerciseAnalyticsBucketId, number> = {
  "1-3": 1,
  "4-6": 0.95,
  "7-9": 0.88,
  "10-12+": 0.8,
};

const OVERLAY_ORDER: ExerciseAnalyticsOverlayType[] = [
  "trendLine",
  "ewma",
  "robustTrend",
  "pbMarkers",
  "plateauZones",
  "weeklyBand",
  "outliers",
  "repBuckets",
];

const REP_BUCKET_SUPPORTED_METRICS = new Set<ExerciseAnalyticsMetricType>([
  "maxWeight",
  "e1rm",
  "maxReps",
]);

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
      loggedExerciseId: row.loggedExerciseId,
      loggedExerciseName: row.loggedExerciseName,
      loggedExerciseVariationLabel: row.loggedExerciseVariationLabel,
      loggedExerciseParentExerciseId: row.loggedExerciseParentExerciseId,
      loggedExerciseParentName: null,
      isVariation: row.loggedExerciseParentExerciseId !== null,
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
        loggedExerciseId: session.loggedExerciseId,
        loggedExerciseName: session.loggedExerciseName,
        loggedExerciseVariationLabel: session.loggedExerciseVariationLabel,
        loggedExerciseParentExerciseId: session.loggedExerciseParentExerciseId,
        loggedExerciseParentName: session.loggedExerciseParentName,
        isVariation: session.isVariation,
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
      const point: SessionDataPoint = {
        date: session.date,
        value,
        workoutId: session.workoutId,
        workoutExerciseId: session.workoutExerciseId,
        loggedExerciseId: session.loggedExerciseId,
        loggedExerciseName: session.loggedExerciseName,
        loggedExerciseVariationLabel: session.loggedExerciseVariationLabel,
        loggedExerciseParentExerciseId: session.loggedExerciseParentExerciseId,
        loggedExerciseParentName: session.loggedExerciseParentName,
        isVariation: session.isVariation,
      };
      return point;
    })
    .filter((point): point is NonNullable<typeof point> => point !== null)
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

function getProgressStatusFromNormalizedSlope(
  normalizedSlope: number | null
): ExerciseAnalyticsProgress["trendStatus"] {
  if (normalizedSlope === null) return "insufficient";
  if (normalizedSlope >= TREND_THRESHOLD) return "improving";
  if (normalizedSlope <= -TREND_THRESHOLD) return "slipping";
  return "flat";
}

function getRegressionTrendStatus(values: number[]): ExerciseAnalyticsProgress["trendStatus"] {
  if (values.length < 4) return "insufficient";

  const { slope } = computeRegressionStats(values);
  const yMean = average(values) ?? 0;
  const baseline = Math.max(Math.abs(yMean), 1);
  return getProgressStatusFromNormalizedSlope(slope / baseline);
}

function computeStabilityScore(values: number[], baseline?: number): number {
  const resolvedBaseline = Math.max(Math.abs(baseline ?? average(values) ?? 0), 1);
  return clamp(1 - standardDeviation(values) / Math.max(resolvedBaseline * 0.18, 1));
}

function computeRobustIntercept(values: number[], slope: number): number {
  const intercepts = values.map((value, index) => value - slope * index);
  return median(intercepts) ?? values[0] ?? 0;
}

function buildEwmaPoints(points: SessionDataPoint[]): SessionDataPoint[] {
  const chronologicalPoints = [...points].sort((a, b) => a.date - b.date);
  if (chronologicalPoints.length === 0) return [];

  const ewmaSeries = computeEwmaSeries(chronologicalPoints.map((point) => point.value));
  return chronologicalPoints.map((point, index) => ({
    ...point,
    value: ewmaSeries[index],
  }));
}

function buildRobustTrendPoints(points: SessionDataPoint[]): SessionDataPoint[] {
  const chronologicalPoints = [...points].sort((a, b) => a.date - b.date);
  if (chronologicalPoints.length === 0) return [];

  const values = chronologicalPoints.map((point) => point.value);
  const slope = computeTheilSenSlope(values);
  const intercept = computeRobustIntercept(values, slope);

  return chronologicalPoints.map((point, index) => ({
    ...point,
    value: intercept + slope * index,
  }));
}

function getComparabilityLabel(
  score: number | null
): ExerciseAnalyticsPerformanceProgress["comparabilityLabel"] {
  if (score === null) return "insufficient";
  if (score >= 0.72) return "high";
  if (score >= 0.45) return "moderate";
  return "less-comparable";
}

function getBucketIndex(bucketId: ExerciseAnalyticsBucketId | null): number | null {
  if (bucketId === null) return null;
  const bucketIndex = REP_PROFILE_BUCKETS.findIndex((bucket) => bucket.id === bucketId);
  return bucketIndex >= 0 ? bucketIndex : null;
}

function getBucketIdFromIndex(index: number | null): ExerciseAnalyticsBucketId | null {
  if (index === null) return null;
  return REP_PROFILE_BUCKETS[index]?.id ?? null;
}

function weightedMedian(entries: { value: number; weight: number }[]): number | null {
  const weightedEntries = entries
    .filter((entry) => Number.isFinite(entry.value) && entry.weight > 0)
    .sort((a, b) => a.value - b.value);

  if (weightedEntries.length === 0) return null;

  const totalWeight = weightedEntries.reduce((sum, entry) => sum + entry.weight, 0);
  let cumulativeWeight = 0;

  for (const entry of weightedEntries) {
    cumulativeWeight += entry.weight;
    if (cumulativeWeight >= totalWeight / 2) {
      return entry.value;
    }
  }

  return weightedEntries[weightedEntries.length - 1]?.value ?? null;
}

function isBetterBucketStrength(
  nextStrength: SessionBucketStrength,
  currentStrength: SessionBucketStrength | null | undefined
): boolean {
  if (!currentStrength) return true;
  if (nextStrength.strengthKg !== currentStrength.strengthKg) {
    return nextStrength.strengthKg > currentStrength.strengthKg;
  }
  if (nextStrength.weightKg !== currentStrength.weightKg) {
    return nextStrength.weightKg > currentStrength.weightKg;
  }
  if (nextStrength.reps !== currentStrength.reps) {
    return nextStrength.reps > currentStrength.reps;
  }
  return nextStrength.setIndex > currentStrength.setIndex;
}

function buildSessionPerformanceSummary(
  session: ExerciseAnalyticsSession,
  formula: E1RMFormulaId
): SessionPerformanceSummary {
  const bucketBestSets: Partial<Record<ExerciseAnalyticsBucketId, SessionBucketStrength>> = {};
  const bucketCounts = new Map<ExerciseAnalyticsBucketId, number>();

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

    bucketCounts.set(bucket.id, (bucketCounts.get(bucket.id) ?? 0) + 1);

    const bucketStrength: SessionBucketStrength = {
      id: bucket.id,
      label: bucket.label,
      date: session.date,
      strengthKg: computeE1rm(formula, set.weightKg, set.reps),
      weightKg: set.weightKg,
      reps: set.reps,
      setIndex: set.setIndex,
    };

    if (isBetterBucketStrength(bucketStrength, bucketBestSets[bucket.id])) {
      bucketBestSets[bucket.id] = bucketStrength;
    }
  }

  const dominantBucket = Array.from(bucketCounts.entries()).sort((a, b) => {
    const countDiff = b[1] - a[1];
    if (countDiff !== 0) return countDiff;
    const strengthDiff =
      (bucketBestSets[b[0]]?.strengthKg ?? 0) - (bucketBestSets[a[0]]?.strengthKg ?? 0);
    if (strengthDiff !== 0) return strengthDiff;
    return (getBucketIndex(a[0]) ?? 0) - (getBucketIndex(b[0]) ?? 0);
  })[0];

  return {
    date: session.date,
    workoutId: session.workoutId,
    workoutExerciseId: session.workoutExerciseId,
    dominantBucketId: dominantBucket?.[0] ?? null,
    bucketBestSets,
  };
}

function getPerformanceFactsSessionSummaries(
  filteredSessions: ExerciseAnalyticsSession[],
  formula: E1RMFormulaId
): SessionPerformanceSummary[] {
  return sortSessionsChronologically(filteredSessions).map((session) =>
    buildSessionPerformanceSummary(session, formula)
  );
}

function getDaysSinceLastMeaningfulGain(
  sessionSummaries: SessionPerformanceSummary[],
  now: number
): {
  daysSinceLastMeaningfulGain: number | null;
  meaningfulGainConfidence: ExerciseAnalyticsPerformanceProgress["meaningfulGainConfidence"];
} {
  let lastGainDate: number | null = null;
  let lastGainConfidence: ExerciseAnalyticsPerformanceProgress["meaningfulGainConfidence"] =
    "insufficient";

  for (let summaryIndex = 0; summaryIndex < sessionSummaries.length; summaryIndex += 1) {
    const summary = sessionSummaries[summaryIndex];
    const priorSummaries = sessionSummaries.filter(
      (candidate, candidateIndex) =>
        candidateIndex < summaryIndex &&
        candidate.date >= summary.date - 90 * MS_PER_DAY &&
        candidate.date < summary.date
    );

    let foundSameBucketGain = false;
    let foundAdjacentBucketGain = false;

    for (const bucket of REP_PROFILE_BUCKETS) {
      const currentStrength = summary.bucketBestSets[bucket.id];
      if (!currentStrength) continue;

      const priorSameBucketStrengths = priorSummaries
        .map((candidate) => candidate.bucketBestSets[bucket.id]?.strengthKg ?? null)
        .filter((value): value is number => value !== null);

      if (priorSameBucketStrengths.length > 0) {
        const priorBest = Math.max(...priorSameBucketStrengths);
        const threshold = Math.max(1, priorBest * 0.01);
        if (currentStrength.strengthKg - priorBest >= threshold) {
          foundSameBucketGain = true;
          break;
        }
        continue;
      }

      const bucketIndex = getBucketIndex(bucket.id);
      const adjacentBucketIds = [bucketIndex === null ? null : bucketIndex - 1, bucketIndex === null ? null : bucketIndex + 1]
        .map((index) => getBucketIdFromIndex(index))
        .filter((value): value is ExerciseAnalyticsBucketId => value !== null);

      const adjacentStrengths = priorSummaries.flatMap((candidate) =>
        adjacentBucketIds
          .map((bucketId) => candidate.bucketBestSets[bucketId]?.strengthKg ?? null)
          .filter((value): value is number => value !== null)
      );

      if (adjacentStrengths.length === 0) continue;

      const priorBestAdjacent = Math.max(...adjacentStrengths);
      const threshold = Math.max(1, priorBestAdjacent * 0.01);
      if (currentStrength.strengthKg - priorBestAdjacent >= threshold) {
        foundAdjacentBucketGain = true;
      }
    }

    if (foundSameBucketGain || foundAdjacentBucketGain) {
      lastGainDate = summary.date;
      lastGainConfidence = foundSameBucketGain ? "high" : "low";
    }
  }

  return {
    daysSinceLastMeaningfulGain:
      lastGainDate === null ? null : Math.max(0, Math.floor((now - lastGainDate) / MS_PER_DAY)),
    meaningfulGainConfidence: lastGainConfidence,
  };
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

function buildMetricPointLookup(metricPoints: SessionDataPoint[]): Map<string, SessionDataPoint> {
  return new Map(
    metricPoints.map((point) => [
      toSessionKey(point.workoutId, point.workoutExerciseId),
      point,
    ])
  );
}

function getDistinctWeekCount(metricPoints: SessionDataPoint[]): number {
  return new Set(metricPoints.map((point) => getWeekStartTimestamp(point.date))).size;
}

function buildPBMarkerOverlayPoints(
  dataset: ExerciseAnalyticsDataset,
  metricPoints: SessionDataPoint[],
  setScope: ExerciseAnalyticsSetScope
): SessionDataPoint[] {
  const currentPBSessionKeys = getCurrentPBSessionKeysFromDataset(dataset, setScope);
  return [...metricPoints]
    .filter((point) => currentPBSessionKeys.has(toSessionKey(point.workoutId, point.workoutExerciseId)))
    .sort((a, b) => a.date - b.date);
}

function buildWeeklyAggregatePoints(
  metricPoints: SessionDataPoint[],
  metric: ExerciseAnalyticsMetricType
): WeeklyAggregatePoint[] {
  const weeklyMap = new Map<number, WeeklyAggregatePoint>();

  for (const point of [...metricPoints].sort((a, b) => a.date - b.date)) {
    const weekStart = getWeekStartTimestamp(point.date);
    const current = weeklyMap.get(weekStart);

    if (!current) {
      weeklyMap.set(weekStart, {
        date: point.date,
        value: point.value,
      });
      continue;
    }

    weeklyMap.set(weekStart, {
      date: Math.max(current.date, point.date),
      value:
        metric === "totalVolume" || metric === "numSets"
          ? current.value + point.value
          : Math.max(current.value, point.value),
    });
  }

  return Array.from(weeklyMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, point]) => point);
}

function buildWeeklyBandOverlay(
  metricPoints: SessionDataPoint[],
  metric: ExerciseAnalyticsMetricType
): Extract<ExerciseAnalyticsChartOverlay, { kind: "band" }> | null {
  const weeklyPoints = buildWeeklyAggregatePoints(metricPoints, metric);
  if (weeklyPoints.length < 4) return null;

  const bandPoints = weeklyPoints.map((point, index) => {
    const rollingWindow = weeklyPoints.slice(Math.max(0, index - 3), index + 1);
    const values = rollingWindow.map((entry) => entry.value);
    const center = average(values) ?? point.value;
    const deviation = standardDeviation(values);

    return {
      date: point.date,
      center,
      lower: Math.max(0, center - deviation),
      upper: center + deviation,
    };
  });

  return {
    overlayType: "weeklyBand",
    kind: "band",
    colorToken: "primary",
    points: bandPoints,
  };
}

function buildOutlierOverlayPoints(
  metricPoints: SessionDataPoint[]
): ExerciseAnalyticsChartMarkerPoint[] {
  if (metricPoints.length < 6) return [];

  const chronologicalPoints = [...metricPoints].sort((a, b) => a.date - b.date);
  const values = chronologicalPoints.map((point) => point.value);
  const mean = average(values) ?? 0;
  const deviation = standardDeviation(values);

  if (deviation === 0) return [];

  return chronologicalPoints.flatMap<ExerciseAnalyticsChartMarkerPoint>((point) => {
    const zScore = (point.value - mean) / deviation;
    if (Math.abs(zScore) < 1.75) return [];

    return [
      {
        ...point,
        variant: zScore > 0 ? "positive" : "negative",
      },
    ];
  });
}

function buildRepBucketOverlayPoints(
  metricPoints: SessionDataPoint[],
  sessionSummaries: SessionPerformanceSummary[]
): ExerciseAnalyticsChartMarkerPoint[] {
  const metricPointLookup = buildMetricPointLookup(metricPoints);

  return sessionSummaries.flatMap<ExerciseAnalyticsChartMarkerPoint>((summary) => {
    if (!summary.dominantBucketId) return [];
    const metricPoint = metricPointLookup.get(
      toSessionKey(summary.workoutId, summary.workoutExerciseId)
    );
    if (!metricPoint) return [];

    return [
      {
        ...metricPoint,
        variant: summary.dominantBucketId,
      },
    ];
  });
}

function buildPlateauZoneOverlay(
  metricPoints: SessionDataPoint[]
): Extract<ExerciseAnalyticsChartOverlay, { kind: "zone" }> | null {
  const chronologicalPoints = [...metricPoints].sort((a, b) => a.date - b.date);
  if (chronologicalPoints.length < 6) return null;

  const candidateRanges: {
    startDate: number;
    endDate: number;
    severity: "moderate" | "high";
  }[] = [];

  for (let index = 0; index <= chronologicalPoints.length - 6; index += 1) {
    const windowPoints = chronologicalPoints.slice(index, index + 6);
    const values = windowPoints.map((point) => point.value);
    const baseline = Math.max(Math.abs(average(values) ?? 0), 1);
    const normalizedSlope = Math.abs(computeTheilSenSlope(values) / baseline);
    const stabilityScore = computeStabilityScore(values, baseline);

    if (normalizedSlope > TREND_THRESHOLD * 0.5 || stabilityScore < 0.45) {
      continue;
    }

    candidateRanges.push({
      startDate: windowPoints[0].date,
      endDate: windowPoints[windowPoints.length - 1].date,
      severity: stabilityScore >= 0.72 ? "high" : "moderate",
    });
  }

  if (candidateRanges.length === 0) return null;

  const mergedRanges = candidateRanges.reduce<typeof candidateRanges>((ranges, range) => {
    const previous = ranges[ranges.length - 1];
    if (!previous || range.startDate > previous.endDate) {
      ranges.push(range);
      return ranges;
    }

    previous.endDate = Math.max(previous.endDate, range.endDate);
    previous.severity =
      previous.severity === "high" || range.severity === "high" ? "high" : "moderate";
    return ranges;
  }, []);

  return {
    overlayType: "plateauZones",
    kind: "zone",
    colorToken: "warning",
    ranges: mergedRanges,
  };
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

export function buildExerciseAnalyticsPerformanceProgress(
  facts: ExerciseAnalyticsPerformanceFacts,
  formula: E1RMFormulaId
): ExerciseAnalyticsPerformanceProgress {
  const sessionSummaries = getPerformanceFactsSessionSummaries(facts.filteredSessions, formula);
  const totalSessions = sessionSummaries.length;

  const bucketTrends: ExerciseAnalyticsBucketTrend[] = REP_PROFILE_BUCKETS.map((bucket) => {
    const bucketSamples = sessionSummaries
      .map((summary) => summary.bucketBestSets[bucket.id] ?? null)
      .filter((value): value is SessionBucketStrength => value !== null);
    const values = bucketSamples.map((sample) => sample.strengthKg);
    const sessionCount = bucketSamples.length;
    const baseWeight = BUCKET_CONFIDENCE_WEIGHTS[bucket.id];

    if (sessionCount < 4) {
      return {
        id: bucket.id,
        label: bucket.label,
        sessionCount,
        latestStrengthKg: bucketSamples[bucketSamples.length - 1]?.strengthKg ?? null,
        bestStrengthKg: values.length > 0 ? Math.max(...values) : null,
        normalizedSlope: null,
        robustSlopeKg: null,
        momentumKg: null,
        confidenceScore: null,
        confidenceLabel: "insufficient",
        baseWeight,
        effectiveWeight: 0,
        trendStatus: "insufficient",
      };
    }

    const robustSlopeKg = computeTheilSenSlope(values);
    const baseline = Math.max(Math.abs(median(values) ?? average(values) ?? 0), 1);
    const normalizedSlope = robustSlopeKg / baseline;
    const ewmaSeries = computeEwmaSeries(values);
    const momentumLookback = Math.min(2, ewmaSeries.length - 1);
    const momentumKg =
      momentumLookback > 0
        ? ewmaSeries[ewmaSeries.length - 1] - ewmaSeries[ewmaSeries.length - 1 - momentumLookback]
        : null;
    const regressionStats = computeRegressionStats(values);
    const standardDeviationValue = standardDeviation(values);
    const slopeStrengthScore = clamp(
      (Math.abs(robustSlopeKg) * Math.max(values.length - 1, 1)) /
        Math.max(standardDeviationValue * 2, baseline * 0.03, 1)
    );
    const confidenceScore = clamp(
      regressionStats.rSquared * 0.55 + slopeStrengthScore * 0.45
    );
    const effectiveWeight = baseWeight * clamp(sessionCount / Math.max(totalSessions, 4));

    return {
      id: bucket.id,
      label: bucket.label,
      sessionCount,
      latestStrengthKg: bucketSamples[bucketSamples.length - 1]?.strengthKg ?? null,
      bestStrengthKg: Math.max(...values),
      normalizedSlope,
      robustSlopeKg,
      momentumKg,
      confidenceScore,
      confidenceLabel: getConfidenceLabel(confidenceScore),
      baseWeight,
      effectiveWeight,
      trendStatus: getProgressStatusFromNormalizedSlope(normalizedSlope),
    };
  });

  const eligibleBucketTrends = bucketTrends.filter(
    (bucket) => bucket.normalizedSlope !== null && bucket.effectiveWeight > 0
  );
  const dominantBucketIndices = sessionSummaries
    .map((summary) => getBucketIndex(summary.dominantBucketId))
    .filter((value): value is number => value !== null);
  const recentDominantBucketIndices = dominantBucketIndices.slice(-4);
  const historicalMedianBucket = getBucketIdFromIndex(
    dominantBucketIndices.length === 0
      ? null
      : Math.round(median(dominantBucketIndices) ?? dominantBucketIndices[dominantBucketIndices.length - 1])
  );
  const dominantRecentBucket = getBucketIdFromIndex(
    recentDominantBucketIndices.length === 0
      ? null
      : Math.round(
          median(recentDominantBucketIndices) ??
            recentDominantBucketIndices[recentDominantBucketIndices.length - 1]
        )
  );
  const repRangeDriftFlag =
    historicalMedianBucket !== null &&
    dominantRecentBucket !== null &&
    Math.abs(
      (getBucketIndex(historicalMedianBucket) ?? 0) -
        (getBucketIndex(dominantRecentBucket) ?? 0)
    ) > 1;
  const averageBucketConfidence = average(
    eligibleBucketTrends
      .map((bucket) => bucket.confidenceScore)
      .filter((value): value is number => value !== null)
  );
  const comparabilityScore =
    totalSessions < 4
      ? null
      : clamp(
          (averageBucketConfidence ?? 0) * 0.6 +
            (eligibleBucketTrends.length / REP_PROFILE_BUCKETS.length) * 0.4 -
            (repRangeDriftFlag ? 0.35 : 0)
        );
  const absoluteProgressScore = weightedMedian(
    eligibleBucketTrends.map((bucket) => ({
      value: bucket.normalizedSlope ?? 0,
      weight: bucket.effectiveWeight,
    }))
  );

  const strongestPositiveInfluence = Math.max(
    0,
    ...eligibleBucketTrends.map((bucket) =>
      bucket.normalizedSlope !== null && bucket.normalizedSlope > 0
        ? bucket.normalizedSlope * bucket.effectiveWeight
        : 0
    )
  );
  const strongestNegativeInfluence = Math.max(
    0,
    ...eligibleBucketTrends.map((bucket) =>
      bucket.normalizedSlope !== null && bucket.normalizedSlope < 0
        ? Math.abs(bucket.normalizedSlope * bucket.effectiveWeight)
        : 0
    )
  );

  let materialGainStatus: ExerciseAnalyticsPerformanceProgress["materialGainStatus"] =
    "insufficient";
  if (totalSessions >= 4 && eligibleBucketTrends.length > 0) {
    const hasMixedOpposition =
      strongestPositiveInfluence > 0 &&
      strongestNegativeInfluence > 0 &&
      (Math.min(strongestPositiveInfluence, strongestNegativeInfluence) /
        Math.max(strongestPositiveInfluence, strongestNegativeInfluence) >=
        0.75 ||
        (strongestPositiveInfluence >= TREND_THRESHOLD * 0.6 &&
          strongestNegativeInfluence >= TREND_THRESHOLD * 0.6));

    if (hasMixedOpposition) {
      materialGainStatus = "mixed";
    } else if (absoluteProgressScore !== null && absoluteProgressScore >= TREND_THRESHOLD) {
      materialGainStatus = "improving";
    } else if (absoluteProgressScore !== null && absoluteProgressScore <= -TREND_THRESHOLD) {
      materialGainStatus = "slipping";
    } else {
      materialGainStatus = "flat";
    }
  }

  const strongestImprovingBucket = eligibleBucketTrends
    .filter((bucket) => (bucket.normalizedSlope ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.normalizedSlope ?? 0) * b.effectiveWeight -
        (a.normalizedSlope ?? 0) * a.effectiveWeight
    )[0];
  const weakestBucket = eligibleBucketTrends.sort(
    (a, b) =>
      (a.normalizedSlope ?? Number.POSITIVE_INFINITY) * a.effectiveWeight -
      (b.normalizedSlope ?? Number.POSITIVE_INFINITY) * b.effectiveWeight
  )[0];
  const meaningfulGain = getDaysSinceLastMeaningfulGain(sessionSummaries, facts.now);

  return {
    hasEnoughData: totalSessions >= 4 && eligibleBucketTrends.length > 0,
    materialGainStatus,
    absoluteProgressScore,
    daysSinceLastMeaningfulGain: meaningfulGain.daysSinceLastMeaningfulGain,
    meaningfulGainConfidence: meaningfulGain.meaningfulGainConfidence,
    strongestImprovingBucket: strongestImprovingBucket
      ? {
          id: strongestImprovingBucket.id,
          label: strongestImprovingBucket.label,
          normalizedSlope: strongestImprovingBucket.normalizedSlope,
        }
      : null,
    weakestBucket: weakestBucket
      ? {
          id: weakestBucket.id,
          label: weakestBucket.label,
          normalizedSlope: weakestBucket.normalizedSlope,
        }
      : null,
    comparabilityScore,
    comparabilityLabel: repRangeDriftFlag
      ? "less-comparable"
      : getComparabilityLabel(comparabilityScore),
    repRangeDriftFlag,
    dominantRecentBucket,
    historicalMedianBucket,
    bucketTrends,
  };
}

function buildPBSummary(
  dataset: ExerciseAnalyticsDataset,
  filteredSessions: ExerciseAnalyticsSession[],
  setScope: ExerciseAnalyticsSetScope,
  dateRange?: DateRange
): ExerciseAnalyticsPBSummary {
  const setLookup = buildSetLookup(dataset.sessions);
  const scopedEvents = [...dataset.pbEvents]
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

  const currentByType = new Map<string, PBEvent>();
  for (const event of scopedEvents) {
    if (!currentByType.has(event.type)) {
      currentByType.set(event.type, event);
    }
  }

  const rangedEvents = scopedEvents.filter((event) => isWithinDateRange(event.occurredAt, dateRange));
  const visibleSessionKeys = new Set(
    filteredSessions.map((session) => toSessionKey(session.workoutId, session.workoutExerciseId))
  );
  const pbSessionKeys = new Set<string>();

  for (const event of rangedEvents) {
    const sourceSet = setLookup.get(event.setId);
    if (!sourceSet) continue;
    if (!visibleSessionKeys.has(sourceSet.sessionKey)) continue;
    pbSessionKeys.add(sourceSet.sessionKey);
  }

  return {
    chips: TARGET_REP_MAXS.map((targetReps) => ({
      targetReps,
      weightKg: currentByType.get(toRepMaxType(targetReps))?.metricValue ?? null,
    })),
    lastPbDate: scopedEvents[0]?.occurredAt ?? null,
    pbSessionsInRange: pbSessionKeys.size,
    newPbEventsInRange: rangedEvents.length,
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
            : projectWeightFromE1rm(formula, sourceSet.estimated1RMKg, targetReps),
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
  const performanceFacts: ExerciseAnalyticsPerformanceFacts = {
    filteredSessions,
    now,
  };

  return {
    snapshot: buildSnapshot(filteredSessions, metricPoints, now),
    metricTrend: buildProgress(metricPoints),
    performanceProgress: buildExerciseAnalyticsPerformanceProgress(performanceFacts, formula),
    pbs: buildPBSummary(dataset, filteredSessions, setScope, options?.dateRange),
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

export function getCurrentPBSessionKeysFromDataset(
  dataset: ExerciseAnalyticsDataset,
  setScope: ExerciseAnalyticsSetScope = "all"
): Set<string> {
  const setLookup = buildSetLookup(dataset.sessions);
  const scopedEvents = [...dataset.pbEvents]
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

export function getAvailableExerciseAnalyticsOverlays(
  dataset: ExerciseAnalyticsDataset,
  metric: ExerciseAnalyticsMetricType,
  options?: ExerciseAnalyticsQueryOptions
): ExerciseAnalyticsOverlayAvailability[] {
  const formula = options?.formula ?? dataset.formula;
  const setScope = options?.setScope ?? "all";
  const filteredSessions = getFilteredSessions(dataset.sessions, {
    dateRange: options?.dateRange,
    setScope,
  });
  const metricPoints = getMetricPointsFromSessions(filteredSessions, metric, formula).sort(
    (a, b) => a.date - b.date
  );
  const distinctWeeks = getDistinctWeekCount(metricPoints);
  const hasVariance = standardDeviation(metricPoints.map((point) => point.value)) > 0;
  const pbMarkerPoints = buildPBMarkerOverlayPoints(dataset, metricPoints, setScope);
  const sessionSummaries = getPerformanceFactsSessionSummaries(filteredSessions, formula);
  const repBucketPoints = buildRepBucketOverlayPoints(metricPoints, sessionSummaries);

  return OVERLAY_ORDER.map((type) => {
    switch (type) {
      case "trendLine":
        return {
          type,
          enabled: metricPoints.length >= 2,
          reason: metricPoints.length >= 2 ? undefined : "Need 2 sessions in range",
        };
      case "ewma":
        return {
          type,
          enabled: metricPoints.length >= 3,
          reason: metricPoints.length >= 3 ? undefined : "Need 3 sessions in range",
        };
      case "robustTrend":
      case "plateauZones":
        return {
          type,
          enabled: metricPoints.length >= 6,
          reason: metricPoints.length >= 6 ? undefined : "Need 6 sessions in range",
        };
      case "pbMarkers":
        return {
          type,
          enabled: pbMarkerPoints.length > 0,
          reason: pbMarkerPoints.length > 0 ? undefined : "No PB sessions in range",
        };
      case "weeklyBand":
        return {
          type,
          enabled: distinctWeeks >= 4,
          reason: distinctWeeks >= 4 ? undefined : "Need 4 weeks in range",
        };
      case "outliers":
        return {
          type,
          enabled: metricPoints.length >= 6 && hasVariance,
          reason:
            metricPoints.length < 6
              ? "Need 6 sessions in range"
              : hasVariance
                ? undefined
                : "Need variation in range",
        };
      case "repBuckets":
        return {
          type,
          enabled: REP_BUCKET_SUPPORTED_METRICS.has(metric) && repBucketPoints.length >= 4,
          reason: !REP_BUCKET_SUPPORTED_METRICS.has(metric)
            ? "Not available for this metric"
            : repBucketPoints.length >= 4
              ? undefined
              : "Need 4 sessions in range",
        };
      default:
        return {
          type,
          enabled: false,
          reason: "Unavailable",
        };
    }
  });
}

export function buildExerciseAnalyticsChartOverlays(
  dataset: ExerciseAnalyticsDataset,
  metric: ExerciseAnalyticsMetricType,
  options?: ExerciseAnalyticsOverlayQueryOptions
): ExerciseAnalyticsChartOverlay[] {
  const formula = options?.formula ?? dataset.formula;
  const setScope = options?.setScope ?? "all";
  const filteredSessions = getFilteredSessions(dataset.sessions, {
    dateRange: options?.dateRange,
    setScope,
  });
  const metricPoints = getMetricPointsFromSessions(filteredSessions, metric, formula).sort(
    (a, b) => a.date - b.date
  );
  const availability = new Map(
    getAvailableExerciseAnalyticsOverlays(dataset, metric, options).map((entry) => [
      entry.type,
      entry,
    ])
  );
  const sessionSummaries = getPerformanceFactsSessionSummaries(filteredSessions, formula);
  const selectedOverlayTypes =
    options && "selectedOverlays" in options && options.selectedOverlays
      ? options.selectedOverlays
      : OVERLAY_ORDER;

  const overlays: ExerciseAnalyticsChartOverlay[] = [];

  for (const overlayType of selectedOverlayTypes) {
    if (!availability.get(overlayType)?.enabled) continue;

    switch (overlayType) {
      case "trendLine": {
        const points = computeTrendLine(metricPoints, 5);
        if (points.length > 0) {
          overlays.push({
            overlayType,
            kind: "line",
            colorToken: "muted",
            style: "dashed",
            points,
          });
        }
        break;
      }
      case "ewma": {
        const points = buildEwmaPoints(metricPoints);
        if (points.length > 0) {
          overlays.push({
            overlayType,
            kind: "line",
            colorToken: "secondary",
            style: "solid",
            points,
          });
        }
        break;
      }
      case "robustTrend": {
        const points = buildRobustTrendPoints(metricPoints);
        if (points.length > 0) {
          overlays.push({
            overlayType,
            kind: "line",
            colorToken: "success",
            style: "dashed",
            points,
          });
        }
        break;
      }
      case "pbMarkers": {
        const points = buildPBMarkerOverlayPoints(dataset, metricPoints, setScope).map((point) => ({
          ...point,
          variant: "pb" as const,
        }));
        if (points.length > 0) {
          overlays.push({
            overlayType,
            kind: "marker",
            colorToken: "gold",
            points,
          });
        }
        break;
      }
      case "plateauZones": {
        const zoneOverlay = buildPlateauZoneOverlay(metricPoints);
        if (zoneOverlay && zoneOverlay.ranges.length > 0) {
          overlays.push(zoneOverlay);
        }
        break;
      }
      case "weeklyBand": {
        const bandOverlay = buildWeeklyBandOverlay(metricPoints, metric);
        if (bandOverlay && bandOverlay.points.length > 0) {
          overlays.push(bandOverlay);
        }
        break;
      }
      case "outliers": {
        const points = buildOutlierOverlayPoints(metricPoints);
        if (points.length > 0) {
          overlays.push({
            overlayType,
            kind: "marker",
            colorToken: "warning",
            points,
          });
        }
        break;
      }
      case "repBuckets": {
        const points = buildRepBucketOverlayPoints(metricPoints, sessionSummaries);
        if (points.length > 0) {
          overlays.push({
            overlayType,
            kind: "marker",
            colorToken: "primary",
            points,
          });
        }
        break;
      }
    }
  }

  return overlays;
}

export async function getExerciseAnalyticsDataset(
  exerciseId: number,
  formula?: E1RMFormulaId
): Promise<ExerciseAnalyticsDataset> {
  const scopedExerciseIds = await getExerciseScopeIdsForView(exerciseId);
  if (scopedExerciseIds.length === 0) {
    return {
      exerciseId,
      formula: resolveFormulaForExercise(exerciseId, formula),
      sessions: [],
      pbEvents: [],
    };
  }

  const canQueryWorkoutExerciseColumns =
    hasColumn("workout_exercises", "performed_at") &&
    hasColumn("workout_exercises", "completed_at");

  const rows = await db
    .select({
      setId: sets.id,
      workoutId: sets.workoutId,
      workoutExerciseId: sets.workoutExerciseId,
      loggedExerciseId: sets.exerciseId,
      loggedExerciseName: exercises.name,
      loggedExerciseVariationLabel: exercises.variationLabel,
      loggedExerciseParentExerciseId: exercises.parentExerciseId,
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
    .innerJoin(exercises, eq(sets.exerciseId, exercises.id))
    .leftJoin(
      workoutExercises,
      and(
        eq(sets.workoutExerciseId, workoutExercises.id),
        eq(sets.workoutId, workoutExercises.workoutId)
      )
    )
    .innerJoin(workouts, eq(sets.workoutId, workouts.id))
    .where(
      scopedExerciseIds.length === 1
        ? eq(sets.exerciseId, scopedExerciseIds[0])
        : inArray(sets.exerciseId, scopedExerciseIds)
    )
    .orderBy(desc(workouts.startedAt), desc(sets.performedAt), desc(sets.id));

  const needsDisplayMeta = rows.some(
    (row) => typeof row.loggedExerciseParentExerciseId === "number"
  );
  const exerciseMetaById = needsDisplayMeta
    ? await listExerciseDisplayMeta(scopedExerciseIds)
    : new Map<number, ExerciseDisplayMeta>();
  const sessions = buildSessionsFromRows(rows).map((session) => {
    const meta = exerciseMetaById.get(session.loggedExerciseId);
    return {
      ...session,
      loggedExerciseName: meta?.exerciseName ?? session.loggedExerciseName,
      loggedExerciseVariationLabel:
        meta?.exerciseVariationLabel ?? session.loggedExerciseVariationLabel,
      loggedExerciseParentExerciseId:
        meta?.exerciseParentExerciseId ?? session.loggedExerciseParentExerciseId,
      loggedExerciseParentName: meta?.exerciseParentName ?? null,
      isVariation: meta?.isVariation ?? session.isVariation,
    };
  });

  return {
    exerciseId,
    formula: resolveFormulaForExercise(exerciseId, formula),
    sessions,
    pbEvents: await getPBEventsForExercise(scopedExerciseIds),
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
  const scopedExerciseIds = await getExerciseScopeIdsForView(exerciseId);
  if (scopedExerciseIds.length === 0) {
    return null;
  }

  if (__DEV__) {
    console.log("[getSessionDetails] Querying sets for:", {
      exerciseId,
      scopedExerciseIds,
      workoutId,
    });
  }

  const sessionSets = await db
    .select({
      id: sets.id,
      exerciseId: sets.exerciseId,
      workoutExerciseId: sets.workoutExerciseId,
      setIndex: sets.setIndex,
      weightKg: sets.weightKg,
      reps: sets.reps,
      note: sets.note,
    })
    .from(sets)
    .where(
      and(
        scopedExerciseIds.length === 1
          ? eq(sets.exerciseId, scopedExerciseIds[0])
          : inArray(sets.exerciseId, scopedExerciseIds),
        eq(sets.workoutId, workoutId)
      )
    )
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
  const loggedExerciseIdForSession = sessionSets[0]?.exerciseId ?? exerciseId;
  const exerciseMetaById = await listExerciseDisplayMeta([loggedExerciseIdForSession]);
  const loggedExercise = exerciseMetaById.get(loggedExerciseIdForSession);

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
    loggedExerciseId: loggedExerciseIdForSession,
    loggedExerciseName: loggedExercise?.exerciseName ?? "Exercise",
    loggedExerciseVariationLabel: loggedExercise?.exerciseVariationLabel ?? null,
    loggedExerciseParentExerciseId: loggedExercise?.exerciseParentExerciseId ?? null,
    loggedExerciseParentName: loggedExercise?.exerciseParentName ?? null,
    isVariation: loggedExercise?.isVariation ?? false,
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
  const exerciseMetaById = await listExerciseDisplayMeta([workoutExercise.exerciseId]);
  const loggedExercise = exerciseMetaById.get(workoutExercise.exerciseId);

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
    loggedExerciseId: workoutExercise.exerciseId,
    loggedExerciseName: loggedExercise?.exerciseName ?? "Exercise",
    loggedExerciseVariationLabel: loggedExercise?.exerciseVariationLabel ?? null,
    loggedExerciseParentExerciseId: loggedExercise?.exerciseParentExerciseId ?? null,
    loggedExerciseParentName: loggedExercise?.exerciseParentName ?? null,
    isVariation: loggedExercise?.isVariation ?? false,
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
      ...point,
      value: averageValue,
    };
  });
}
