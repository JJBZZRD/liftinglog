import { getTrendSignalReliability } from "../availability";
import { buildMetricSignal } from "../aggregate";
import { clamp } from "../baselines";
import { BODYWEIGHT_THRESHOLDS } from "../constants";
import type { MetricSignalContext, ReadinessSignal } from "../types";

export function buildWaistSignals(context: MetricSignalContext): ReadinessSignal[] {
  const { availability, baseline } = context;
  if (
    !availability.trendEligible
    || baseline.recentAverage === null
    || baseline.baselineAverage === null
  ) {
    return [];
  }

  const delta = baseline.recentAverage - baseline.baselineAverage;
  const reliability = getTrendSignalReliability("waist", availability);

  if (delta <= BODYWEIGHT_THRESHOLDS.waistDropCm) {
    const magnitude = clamp(Math.abs(delta) / Math.abs(BODYWEIGHT_THRESHOLDS.waistDropCm * 2));
    return [
      buildMetricSignal({
        id: "waist_reduction_trend",
        metric: "waist",
        kind: "trend",
        polarity: "positive",
        score: 0.12 + magnitude * 0.18,
        magnitude,
        reliability,
        reason: `Waist measurements are trending down versus baseline (${Math.abs(delta).toFixed(1)} cm).`,
        evidence: {
          recentAverage: baseline.recentAverage,
          baselineAverage: baseline.baselineAverage,
          deltaCm: delta,
        },
      }),
    ];
  }

  if (delta >= BODYWEIGHT_THRESHOLDS.waistRiseCm) {
    const magnitude = clamp(delta / (BODYWEIGHT_THRESHOLDS.waistRiseCm * 2));
    return [
      buildMetricSignal({
        id: "waist_increase_trend",
        metric: "waist",
        kind: "trend",
        polarity: "negative",
        score: -(0.18 + magnitude * 0.2),
        magnitude,
        reliability,
        reason: `Waist measurements are drifting up versus baseline (${delta.toFixed(1)} cm).`,
        evidence: {
          recentAverage: baseline.recentAverage,
          baselineAverage: baseline.baselineAverage,
          deltaCm: delta,
        },
      }),
    ];
  }

  return [];
}

