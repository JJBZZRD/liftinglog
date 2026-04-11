import { getTrendSignalReliability } from "../availability";
import { buildMetricSignal } from "../aggregate";
import { clamp } from "../baselines";
import { RHR_THRESHOLDS } from "../constants";
import type { MetricSignalContext, ReadinessSignal } from "../types";

export function buildRhrSignals(context: MetricSignalContext): ReadinessSignal[] {
  const { availability, baseline } = context;
  if (
    !availability.trendEligible
    || baseline.baselineAverage === null
    || availability.latestEntry === null
  ) {
    return [];
  }

  const latestBpm = availability.latestEntry.value;
  const deltaBpm = latestBpm - baseline.baselineAverage;
  const reliability = getTrendSignalReliability("restingHr", availability);

  if (deltaBpm >= RHR_THRESHOLDS.elevatedBpm) {
    const magnitude = clamp(deltaBpm / (RHR_THRESHOLDS.elevatedBpm * 2));
    return [
      buildMetricSignal({
        id: "rhr_elevated_vs_baseline",
        metric: "restingHr",
        kind: "trend",
        polarity: "negative",
        score: -(0.4 + magnitude * 0.25),
        magnitude,
        reliability,
        reason: `Resting HR is elevated ${deltaBpm.toFixed(0)} bpm above baseline.`,
        evidence: {
          latestBpm,
          baselineAverage: baseline.baselineAverage,
          deltaBpm,
        },
      }),
    ];
  }

  if (deltaBpm <= RHR_THRESHOLDS.favorableBpm) {
    const magnitude = clamp(Math.abs(deltaBpm) / Math.abs(RHR_THRESHOLDS.favorableBpm * 2));
    return [
      buildMetricSignal({
        id: "rhr_favorable_vs_baseline",
        metric: "restingHr",
        kind: "trend",
        polarity: "positive",
        score: 0.3 + magnitude * 0.18,
        magnitude,
        reliability,
        reason: `Resting HR is favorable at ${Math.abs(deltaBpm).toFixed(0)} bpm below baseline.`,
        evidence: {
          latestBpm,
          baselineAverage: baseline.baselineAverage,
          deltaBpm,
        },
      }),
    ];
  }

  return [];
}

