import { getAcuteSignalReliability, getTrendSignalReliability } from "../availability";
import { buildMetricSignal } from "../aggregate";
import { clamp } from "../baselines";
import { SCORE_METRIC_THRESHOLDS } from "../constants";
import type { MetricSignalContext, ReadinessSignal } from "../types";

export function buildSorenessSignals(context: MetricSignalContext): ReadinessSignal[] {
  const { availability, baseline } = context;
  const signals: ReadinessSignal[] = [];
  const latestValue = availability.latestEntry?.value ?? null;

  if (availability.acuteEligible && latestValue !== null) {
    const reliability = getAcuteSignalReliability("soreness", availability);

    if (latestValue >= SCORE_METRIC_THRESHOLDS.high) {
      const magnitude = clamp(latestValue / SCORE_METRIC_THRESHOLDS.veryHigh);
      signals.push(
        buildMetricSignal({
          id: "soreness_high_today",
          metric: "soreness",
          kind: "acute",
          polarity: "negative",
          score: -(0.35 + magnitude * 0.2),
          magnitude,
          reliability,
          reason: `Soreness is high today at ${latestValue.toFixed(0)}/5.`,
          evidence: { latestScore: latestValue },
        })
      );
    } else if (latestValue <= SCORE_METRIC_THRESHOLDS.low) {
      const magnitude = clamp((SCORE_METRIC_THRESHOLDS.low + 1 - latestValue) / 2);
      signals.push(
        buildMetricSignal({
          id: "soreness_low_today",
          metric: "soreness",
          kind: "acute",
          polarity: "positive",
          score: 0.12 + magnitude * 0.1,
          magnitude,
          reliability,
          reason: `Soreness is low today at ${latestValue.toFixed(0)}/5.`,
          evidence: { latestScore: latestValue },
        })
      );
    }
  }

  if (
    availability.trendEligible
    && baseline.recentAverage !== null
    && baseline.baselineAverage !== null
  ) {
    const delta = baseline.recentAverage - baseline.baselineAverage;
    const reliability = getTrendSignalReliability("soreness", availability);

    if (delta >= SCORE_METRIC_THRESHOLDS.trendDelta) {
      const magnitude = clamp(delta / (SCORE_METRIC_THRESHOLDS.trendDelta * 2));
      signals.push(
        buildMetricSignal({
          id: "soreness_high_trend",
          metric: "soreness",
          kind: "trend",
          polarity: "negative",
          score: -(0.18 + magnitude * 0.15),
          magnitude,
          reliability,
          reason: `Recent soreness is running above baseline by ${delta.toFixed(1)} points.`,
          evidence: {
            recentAverage: baseline.recentAverage,
            baselineAverage: baseline.baselineAverage,
            delta,
          },
        })
      );
    }
  }

  return signals;
}

