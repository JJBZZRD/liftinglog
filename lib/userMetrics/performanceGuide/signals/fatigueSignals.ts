import { getAcuteSignalReliability, getTrendSignalReliability } from "../availability";
import { buildMetricSignal } from "../aggregate";
import { clamp } from "../baselines";
import { SCORE_METRIC_THRESHOLDS } from "../constants";
import type { MetricSignalContext, ReadinessSignal } from "../types";

export function buildFatigueSignals(context: MetricSignalContext): ReadinessSignal[] {
  const { availability, baseline } = context;
  const signals: ReadinessSignal[] = [];
  const latestValue = availability.latestEntry?.value ?? null;

  if (availability.acuteEligible && latestValue !== null) {
    const reliability = getAcuteSignalReliability("fatigue", availability);

    if (latestValue >= SCORE_METRIC_THRESHOLDS.veryHigh) {
      signals.push(
        buildMetricSignal({
          id: "fatigue_very_high_today",
          metric: "fatigue",
          kind: "acute",
          polarity: "negative",
          score: -0.88,
          magnitude: 1,
          reliability,
          reason: "Fatigue is very high today.",
          evidence: { latestScore: latestValue },
        })
      );
    } else if (latestValue >= SCORE_METRIC_THRESHOLDS.high) {
      const magnitude = clamp(latestValue / SCORE_METRIC_THRESHOLDS.veryHigh);
      signals.push(
        buildMetricSignal({
          id: "fatigue_high_today",
          metric: "fatigue",
          kind: "acute",
          polarity: "negative",
          score: -(0.45 + magnitude * 0.2),
          magnitude,
          reliability,
          reason: `Fatigue is elevated today at ${latestValue.toFixed(0)}/5.`,
          evidence: { latestScore: latestValue },
        })
      );
    } else if (latestValue <= SCORE_METRIC_THRESHOLDS.low) {
      const magnitude = clamp((SCORE_METRIC_THRESHOLDS.low + 1 - latestValue) / 2);
      signals.push(
        buildMetricSignal({
          id: "fatigue_low_today",
          metric: "fatigue",
          kind: "acute",
          polarity: "positive",
          score: 0.28 + magnitude * 0.18,
          magnitude,
          reliability,
          reason: `Fatigue is low today at ${latestValue.toFixed(0)}/5.`,
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
    const reliability = getTrendSignalReliability("fatigue", availability);

    if (delta >= SCORE_METRIC_THRESHOLDS.trendDelta) {
      const magnitude = clamp(delta / (SCORE_METRIC_THRESHOLDS.trendDelta * 2));
      signals.push(
        buildMetricSignal({
          id: "fatigue_high_trend",
          metric: "fatigue",
          kind: "trend",
          polarity: "negative",
          score: -(0.26 + magnitude * 0.2),
          magnitude,
          reliability,
          reason: `Recent fatigue is running ${delta.toFixed(1)} points above baseline.`,
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
          id: "fatigue_easing_trend",
          metric: "fatigue",
          kind: "trend",
          polarity: "positive",
          score: 0.18 + magnitude * 0.16,
          magnitude,
          reliability,
          reason: `Recent fatigue is easing versus baseline by ${Math.abs(delta).toFixed(1)} points.`,
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

