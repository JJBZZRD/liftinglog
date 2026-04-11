import {
  CONFIDENCE_THRESHOLDS,
  CORE_METRICS,
  METRIC_RULES,
  METRIC_TYPES,
} from "./constants";
import { getMetricRecencyScore } from "./availability";
import { clamp } from "./baselines";
import type {
  ConfidenceLabel,
  MetricAvailabilityMap,
  MetricType,
  PatternSignal,
  ReadinessSignal,
  SignalPolarity,
} from "./types";

export type AggregateSummary = {
  totalWeightedScore: number;
  availableInfluence: number;
  normalizedScore: number | null;
  contributionByMetric: Record<MetricType, number>;
  contributingMetrics: MetricType[];
  dominantMetrics: MetricType[];
  dominantShare: number;
  basedMostlyOnSingleMetric: boolean;
};

type WeightedSignalLike = ReadinessSignal | PatternSignal;

type MetricSignalBuildArgs = {
  id: string;
  metric: MetricType;
  kind: ReadinessSignal["kind"];
  polarity: SignalPolarity;
  score: number;
  magnitude: number;
  reliability: number;
  reason: string;
  evidence?: Record<string, unknown>;
};

type PatternSignalBuildArgs = {
  id: string;
  metrics: MetricType[];
  polarity: SignalPolarity;
  score: number;
  magnitude: number;
  reliability: number;
  weight: number;
  reason: string;
  evidence?: Record<string, unknown>;
};

function getSignalInfluence(signal: WeightedSignalLike): number {
  if ("metric" in signal) {
    return Math.abs(signal.score) * signal.reliability * signal.metricWeight;
  }

  return Math.abs(signal.score) * signal.reliability * signal.weight;
}

export function buildMetricSignal({
  id,
  metric,
  kind,
  polarity,
  score,
  magnitude,
  reliability,
  reason,
  evidence,
}: MetricSignalBuildArgs): ReadinessSignal {
  const metricWeight = METRIC_RULES[metric].weight;
  const normalizedScore = clamp(score, -1, 1);
  const normalizedMagnitude = clamp(magnitude);
  const normalizedReliability = clamp(reliability);

  return {
    id,
    metric,
    kind,
    polarity,
    score: normalizedScore,
    magnitude: normalizedMagnitude,
    reliability: normalizedReliability,
    metricWeight,
    weightedScore: normalizedScore * normalizedReliability * metricWeight,
    reason,
    evidence,
  };
}

export function buildPatternSignal({
  id,
  metrics,
  polarity,
  score,
  magnitude,
  reliability,
  weight,
  reason,
  evidence,
}: PatternSignalBuildArgs): PatternSignal {
  const normalizedScore = clamp(score, -1, 1);
  const normalizedMagnitude = clamp(magnitude);
  const normalizedReliability = clamp(reliability);
  const normalizedWeight = Math.max(0, weight);

  return {
    id,
    metrics,
    polarity,
    score: normalizedScore,
    magnitude: normalizedMagnitude,
    reliability: normalizedReliability,
    weight: normalizedWeight,
    weightedScore: normalizedScore * normalizedReliability * normalizedWeight,
    reason,
    evidence,
  };
}

export function aggregateSignals(
  signals: ReadinessSignal[],
  patterns: PatternSignal[]
): AggregateSummary {
  const contributionByMetric = Object.fromEntries(
    METRIC_TYPES.map((metric) => [metric, 0])
  ) as Record<MetricType, number>;

  let totalWeightedScore = 0;
  let availableInfluence = 0;

  for (const signal of signals) {
    const influence = getSignalInfluence(signal);
    totalWeightedScore += signal.weightedScore;
    availableInfluence += influence;
    contributionByMetric[signal.metric] += influence;
  }

  for (const pattern of patterns) {
    const influence = getSignalInfluence(pattern);
    totalWeightedScore += pattern.weightedScore;
    availableInfluence += influence;

    if (influence === 0 || pattern.metrics.length === 0) {
      continue;
    }

    const splitInfluence = influence / pattern.metrics.length;
    for (const metric of pattern.metrics) {
      contributionByMetric[metric] += splitInfluence;
    }
  }

  const contributingMetrics = METRIC_TYPES.filter((metric) => contributionByMetric[metric] > 0);
  const sortedMetrics = [...contributingMetrics].sort(
    (left, right) => contributionByMetric[right] - contributionByMetric[left]
  );
  const dominantShare =
    availableInfluence > 0 && sortedMetrics.length > 0
      ? contributionByMetric[sortedMetrics[0]] / availableInfluence
      : 0;
  const dominantMetrics = sortedMetrics.filter((metric, index) => {
    if (availableInfluence <= 0) {
      return false;
    }

    if (index === 0) {
      return true;
    }

    return contributionByMetric[metric] / availableInfluence >= 0.2;
  }).slice(0, 3);

  return {
    totalWeightedScore,
    availableInfluence,
    normalizedScore:
      availableInfluence > 0 ? totalWeightedScore / availableInfluence : null,
    contributionByMetric,
    contributingMetrics,
    dominantMetrics,
    dominantShare,
    basedMostlyOnSingleMetric:
      sortedMetrics.length > 0
      && dominantShare >= 0.68
      && contributingMetrics.length <= 2,
  };
}

export function computeConfidence(
  availabilityByMetric: MetricAvailabilityMap,
  aggregate: AggregateSummary,
  signals: ReadinessSignal[],
  patterns: PatternSignal[]
): number {
  if (aggregate.availableInfluence <= 0 || aggregate.contributingMetrics.length === 0) {
    return 0;
  }

  const signalReliabilities = [...signals, ...patterns]
    .map((signal) => {
      const influence = getSignalInfluence(signal);
      if (influence <= 0) {
        return null;
      }

      return {
        reliability: signal.reliability,
        influence,
      };
    })
    .filter((value): value is { reliability: number; influence: number } => value !== null);

  const weightedReliability =
    signalReliabilities.length === 0
      ? 0
      : signalReliabilities.reduce(
        (sum, signal) => sum + signal.reliability * (signal.influence / aggregate.availableInfluence),
        0
      );
  const metricCoverage = aggregate.contributingMetrics.length / METRIC_TYPES.length;
  const coreCoverage =
    CORE_METRICS.filter((metric) => aggregate.contributionByMetric[metric] > 0).length
    / CORE_METRICS.length;
  const recencyScore = aggregate.contributingMetrics.reduce((sum, metric) => {
    const contribution = aggregate.contributionByMetric[metric];
    const weight = contribution / aggregate.availableInfluence;
    return sum + getMetricRecencyScore(metric, availabilityByMetric[metric]) * weight;
  }, 0);
  const breadthScore =
    aggregate.contributingMetrics.length >= 4
      ? 1
      : aggregate.contributingMetrics.length === 3
        ? 0.75
        : aggregate.contributingMetrics.length === 2
          ? 0.45
          : 0.15;
  const dominancePenalty = aggregate.basedMostlyOnSingleMetric ? 0.15 : 0;

  return clamp(
    metricCoverage * 0.4
      + weightedReliability * 0.25
      + recencyScore * 0.15
      + coreCoverage * 0.15
      + breadthScore * 0.05
      - dominancePenalty
  );
}

export function getConfidenceLabel(
  confidence: number,
  hasUsableSignals: boolean
): ConfidenceLabel {
  if (!hasUsableSignals || confidence <= 0) {
    return "insufficient";
  }

  if (confidence >= CONFIDENCE_THRESHOLDS.high) {
    return "high";
  }

  if (confidence >= CONFIDENCE_THRESHOLDS.medium) {
    return "medium";
  }

  return "low";
}

export function sortBySignalImpact<T extends { weightedScore: number }>(values: T[]): T[] {
  return [...values].sort(
    (left, right) => Math.abs(right.weightedScore) - Math.abs(left.weightedScore)
  );
}
