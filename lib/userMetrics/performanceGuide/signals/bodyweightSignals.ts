import { getTrendSignalReliability } from "../availability";
import { buildMetricSignal } from "../aggregate";
import { clamp } from "../baselines";
import { BODYWEIGHT_THRESHOLDS, METRIC_RULES } from "../constants";
import type { MetricSignalContext, ReadinessSignal } from "../types";

export function buildBodyweightSignals(context: MetricSignalContext): ReadinessSignal[] {
  const { availability, baseline } = context;
  if (
    !availability.trendEligible
    || baseline.recentAverage === null
    || baseline.baselineAverage === null
    || baseline.baselineAverage <= 0
  ) {
    return [];
  }

  const weeklyChangeFraction =
    ((baseline.recentAverage - baseline.baselineAverage) / baseline.baselineAverage)
    * (7 / METRIC_RULES.bodyweight.recentWindowDays);
  const reliability = getTrendSignalReliability("bodyweight", availability);

  if (weeklyChangeFraction <= BODYWEIGHT_THRESHOLDS.rapidLossWeeklyFraction) {
    const magnitude = clamp(
      Math.abs(weeklyChangeFraction / (BODYWEIGHT_THRESHOLDS.rapidLossWeeklyFraction * 1.8))
    );

    return [
      buildMetricSignal({
        id: "weight_rapid_drop",
        metric: "bodyweight",
        kind: "trend",
        polarity: "negative",
        score: -(0.55 + magnitude * 0.35),
        magnitude,
        reliability,
        reason: `Bodyweight is dropping quickly versus baseline (${(Math.abs(weeklyChangeFraction) * 100).toFixed(1)}% per week).`,
        evidence: {
          weeklyChangeFraction,
          recentAverage: baseline.recentAverage,
          baselineAverage: baseline.baselineAverage,
        },
      }),
    ];
  }

  if (weeklyChangeFraction <= BODYWEIGHT_THRESHOLDS.gradualLossWeeklyFraction) {
    const magnitude = clamp(
      Math.abs(weeklyChangeFraction / BODYWEIGHT_THRESHOLDS.rapidLossWeeklyFraction)
    );

    return [
      buildMetricSignal({
        id: "weight_gradual_loss",
        metric: "bodyweight",
        kind: "trend",
        polarity: "positive",
        score: 0.15 + magnitude * 0.2,
        magnitude,
        reliability,
        reason: `Bodyweight is trending down at a controlled pace (${(Math.abs(weeklyChangeFraction) * 100).toFixed(1)}% per week).`,
        evidence: {
          weeklyChangeFraction,
          recentAverage: baseline.recentAverage,
          baselineAverage: baseline.baselineAverage,
        },
      }),
    ];
  }

  return [];
}

