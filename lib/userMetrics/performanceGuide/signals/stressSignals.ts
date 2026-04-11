import { getAcuteSignalReliability, getTrendSignalReliability } from "../availability";
import { buildMetricSignal } from "../aggregate";
import { clamp } from "../baselines";
import { SCORE_METRIC_THRESHOLDS } from "../constants";
import type { MetricSignalContext, ReadinessSignal } from "../types";

export function buildStressSignals(context: MetricSignalContext): ReadinessSignal[] {
  const { availability, baseline } = context;
  const signals: ReadinessSignal[] = [];
  const latestValue = availability.latestEntry?.value ?? null;

  if (availability.acuteEligible && latestValue !== null) {
    const reliability = getAcuteSignalReliability("stress", availability);

    if (latestValue >= SCORE_METRIC_THRESHOLDS.high) {
      const magnitude = clamp(latestValue / SCORE_METRIC_THRESHOLDS.veryHigh);
      signals.push(
        buildMetricSignal({
          id: "stress_high_today",
          metric: "stress",
          kind: "acute",
          polarity: "negative",
          score: -(0.38 + magnitude * 0.2),
          magnitude,
          reliability,
          reason: `Stress is high today at ${latestValue.toFixed(0)}/5.`,
          evidence: { latestScore: latestValue },
        })
      );
    } else if (latestValue <= SCORE_METRIC_THRESHOLDS.low) {
      const magnitude = clamp((SCORE_METRIC_THRESHOLDS.low + 1 - latestValue) / 2);
      signals.push(
        buildMetricSignal({
          id: "stress_low_today",
          metric: "stress",
          kind: "acute",
          polarity: "positive",
          score: 0.2 + magnitude * 0.12,
          magnitude,
          reliability,
          reason: `Stress is low today at ${latestValue.toFixed(0)}/5.`,
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
    const reliability = getTrendSignalReliability("stress", availability);

    if (delta >= SCORE_METRIC_THRESHOLDS.trendDelta) {
      const magnitude = clamp(delta / (SCORE_METRIC_THRESHOLDS.trendDelta * 2));
      signals.push(
        buildMetricSignal({
          id: "stress_high_trend",
          metric: "stress",
          kind: "trend",
          polarity: "negative",
          score: -(0.24 + magnitude * 0.18),
          magnitude,
          reliability,
          reason: `Recent stress is running ${delta.toFixed(1)} points above baseline.`,
          evidence: {
            recentAverage: baseline.recentAverage,
            baselineAverage: baseline.baselineAverage,
            delta,
          },
        })
      );
    } else if (delta <= -SCORE_METRIC_THRESHOLDS.trendDelta) {
      const magnitude = clamp(Math.abs(delta) / (SCORE_METRIC_THRESHOLDS.trendDelta * 2));
      signals.push(
        buildMetricSignal({
          id: "stress_easing_trend",
          metric: "stress",
          kind: "trend",
          polarity: "positive",
          score: 0.16 + magnitude * 0.12,
          magnitude,
          reliability,
          reason: `Recent stress is easing by ${Math.abs(delta).toFixed(1)} points versus baseline.`,
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

