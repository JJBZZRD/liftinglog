import { buildPatternSignal, type AggregateSummary } from "./aggregate";
import { average, clamp } from "./baselines";
import { PATTERN_WEIGHTS } from "./constants";
import type { MetricAvailabilityMap, PatternSignal, ReadinessSignal } from "./types";

function findSignal(signals: ReadinessSignal[], signalId: string): ReadinessSignal | null {
  return signals.find((signal) => signal.id === signalId) ?? null;
}

function averageReliability(signals: Array<ReadinessSignal | null>): number {
  return clamp(
    average(
      signals
        .filter((signal): signal is ReadinessSignal => signal !== null)
        .map((signal) => signal.reliability)
    ) ?? 0
  );
}

export function buildPatternSignals(
  signals: ReadinessSignal[],
  availabilityByMetric: MetricAvailabilityMap
): PatternSignal[] {
  const patterns: PatternSignal[] = [];
  const rapidDropSignal = findSignal(signals, "weight_rapid_drop");
  const strainSignals = signals.filter(
    (signal) =>
      signal.polarity === "negative"
      && ["sleep", "restingHr", "fatigue", "soreness", "stress"].includes(signal.metric)
      && signal.id !== "weight_rapid_drop"
  );

  if (rapidDropSignal && strainSignals.length > 0) {
    patterns.push(
      buildPatternSignal({
        id: "aggressive_cut_warning",
        metrics: ["bodyweight", ...new Set(strainSignals.map((signal) => signal.metric))],
        polarity: "negative",
        score: -0.82,
        magnitude: 1,
        reliability: averageReliability([rapidDropSignal, ...strainSignals]),
        weight: PATTERN_WEIGHTS.aggressiveCutWarning,
        reason: "Rapid weight loss is lining up with recovery strain.",
        evidence: {
          rapidDropSignalId: rapidDropSignal.id,
          strainSignalIds: strainSignals.map((signal) => signal.id),
        },
      })
    );
  }

  const poorSleepSignal = findSignal(signals, "sleep_very_poor_last_night");
  const poorRecoveryPartners = [
    findSignal(signals, "stress_high_today"),
    findSignal(signals, "fatigue_high_today"),
    findSignal(signals, "fatigue_very_high_today"),
  ].filter((signal): signal is ReadinessSignal => signal !== null);

  if (poorSleepSignal && poorRecoveryPartners.length > 0) {
    patterns.push(
      buildPatternSignal({
        id: "acute_poor_recovery_day",
        metrics: ["sleep", ...new Set(poorRecoveryPartners.map((signal) => signal.metric))],
        polarity: "negative",
        score: -0.78,
        magnitude: 1,
        reliability: averageReliability([poorSleepSignal, ...poorRecoveryPartners]),
        weight: PATTERN_WEIGHTS.acutePoorRecoveryDay,
        reason: "Very poor sleep is stacking with other recovery strain today.",
        evidence: {
          sleepSignalId: poorSleepSignal.id,
          partnerSignalIds: poorRecoveryPartners.map((signal) => signal.id),
        },
      })
    );
  }

  const positiveSleepSignal =
    findSignal(signals, "sleep_good_last_night")
    ?? findSignal(signals, "sleep_above_baseline");
  const primingSignal =
    findSignal(signals, "fatigue_low_today")
    ?? findSignal(signals, "rhr_favorable_vs_baseline");
  const strongNegativeSignals = signals.filter(
    (signal) => signal.polarity === "negative" && Math.abs(signal.score) >= 0.7
  );
  const noStrongNegativeRecoveryFlags =
    strongNegativeSignals.length === 0
    && availabilityByMetric.sleep.hasRecentData;

  if (positiveSleepSignal && primingSignal && noStrongNegativeRecoveryFlags) {
    patterns.push(
      buildPatternSignal({
        id: "primed_for_performance",
        metrics: [...new Set([positiveSleepSignal.metric, primingSignal.metric])],
        polarity: "positive",
        score: 0.66,
        magnitude: 1,
        reliability: averageReliability([positiveSleepSignal, primingSignal]),
        weight: PATTERN_WEIGHTS.primedForPerformance,
        reason: "Sleep and recovery markers look supportive for performance.",
        evidence: {
          positiveSignalIds: [positiveSleepSignal.id, primingSignal.id],
        },
      })
    );
  }

  return patterns;
}

export function buildNarrowDataPattern(
  aggregate: AggregateSummary
): PatternSignal[] {
  const dominantMetric = aggregate.dominantMetrics[0];
  if (!aggregate.basedMostlyOnSingleMetric || !dominantMetric) {
    return [];
  }

  return [
    buildPatternSignal({
      id: "narrow_data_warning",
      metrics: [dominantMetric],
      polarity: "neutral",
      score: 0,
      magnitude: 1,
      reliability: 1,
      weight: PATTERN_WEIGHTS.narrowDataWarning,
      reason: `This guide is based mostly on ${dominantMetric === "restingHr" ? "resting HR" : dominantMetric} because other recent recovery metrics are limited.`,
      evidence: {
        dominantMetric,
        dominantShare: aggregate.dominantShare,
      },
    }),
  ];
}

