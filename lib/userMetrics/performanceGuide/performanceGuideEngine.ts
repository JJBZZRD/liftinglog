import {
  aggregateSignals,
  computeConfidence,
  getConfidenceLabel,
  sortBySignalImpact,
} from "./aggregate";
import { computeMetricAvailability } from "./availability";
import { buildMetricBaselines, normalizeMetricEntries } from "./baselines";
import { PERFORMANCE_ZONE_THRESHOLDS } from "./constants";
import { buildReasons, buildMissingDataNotes, buildSummary } from "./explain";
import { buildNarrowDataPattern, buildPatternSignals } from "./patterns";
import { buildBodyweightSignals } from "./signals/bodyweightSignals";
import { buildFatigueSignals } from "./signals/fatigueSignals";
import { buildRhrSignals } from "./signals/rhrSignals";
import { buildSleepSignals } from "./signals/sleepSignals";
import { buildSorenessSignals } from "./signals/sorenessSignals";
import { buildStepsSignals } from "./signals/stepsSignals";
import { buildStressSignals } from "./signals/stressSignals";
import { buildWaistSignals } from "./signals/waistSignals";
import type {
  PerformanceGuideInput,
  PerformanceGuideResult,
  PerformanceZone,
  ReadinessSignal,
} from "./types";

function getPerformanceZone(normalizedScore: number | null): PerformanceZone | null {
  if (normalizedScore === null) {
    return null;
  }

  if (normalizedScore >= PERFORMANCE_ZONE_THRESHOLDS.peak) {
    return "peak";
  }

  if (normalizedScore >= PERFORMANCE_ZONE_THRESHOLDS.ready) {
    return "ready";
  }

  if (normalizedScore >= PERFORMANCE_ZONE_THRESHOLDS.stable) {
    return "stable";
  }

  if (normalizedScore >= PERFORMANCE_ZONE_THRESHOLDS.caution) {
    return "caution";
  }

  return "compromised";
}

export function buildPerformanceGuide(
  input: PerformanceGuideInput,
  options?: { now?: number }
): PerformanceGuideResult {
  const now = options?.now ?? Date.now();
  const normalizedEntries = normalizeMetricEntries(input);
  const baselines = buildMetricBaselines(normalizedEntries, now);
  const availabilityByMetric = computeMetricAvailability(baselines, now);

  const signals: ReadinessSignal[] = [
    ...buildBodyweightSignals({
      availability: availabilityByMetric.bodyweight,
      baseline: baselines.bodyweight,
    }),
    ...buildWaistSignals({
      availability: availabilityByMetric.waist,
      baseline: baselines.waist,
    }),
    ...buildSleepSignals({
      availability: availabilityByMetric.sleep,
      baseline: baselines.sleep,
    }),
    ...buildRhrSignals({
      availability: availabilityByMetric.restingHr,
      baseline: baselines.restingHr,
    }),
    ...buildFatigueSignals({
      availability: availabilityByMetric.fatigue,
      baseline: baselines.fatigue,
    }),
    ...buildSorenessSignals({
      availability: availabilityByMetric.soreness,
      baseline: baselines.soreness,
    }),
    ...buildStressSignals({
      availability: availabilityByMetric.stress,
      baseline: baselines.stress,
    }),
    ...buildStepsSignals({
      availability: availabilityByMetric.steps,
      baseline: baselines.steps,
    }),
  ];
  const primaryPatterns = buildPatternSignals(signals, availabilityByMetric);
  const initialAggregate = aggregateSignals(signals, primaryPatterns);
  const narrowDataPatterns = buildNarrowDataPattern(initialAggregate);
  const patterns = [...primaryPatterns, ...narrowDataPatterns];
  const aggregate = aggregateSignals(signals, patterns);
  const confidence = computeConfidence(availabilityByMetric, aggregate, signals, patterns);
  const confidenceLabel = getConfidenceLabel(confidence, aggregate.availableInfluence > 0);
  const zone = aggregate.availableInfluence > 0
    ? getPerformanceZone(aggregate.normalizedScore)
    : null;
  const sortedSignals = sortBySignalImpact(signals);
  const sortedPatterns = sortBySignalImpact(patterns);
  const reasons = buildReasons(sortedSignals, sortedPatterns);
  const missingDataNotes = buildMissingDataNotes(availabilityByMetric, aggregate);

  return {
    zone,
    normalizedScore: aggregate.availableInfluence > 0 ? aggregate.normalizedScore : null,
    confidence,
    confidenceLabel,
    summary: buildSummary(zone, reasons, confidenceLabel),
    reasons,
    missingDataNotes,
    signals: sortedSignals,
    patterns: sortedPatterns,
    availabilityByMetric,
    contributingMetrics: aggregate.contributingMetrics,
    dominantMetrics: aggregate.dominantMetrics,
    basedMostlyOnSingleMetric: aggregate.basedMostlyOnSingleMetric,
    totalWeightedScore: aggregate.totalWeightedScore,
    availableInfluence: aggregate.availableInfluence,
  };
}

