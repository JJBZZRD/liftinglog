import { getAcuteSignalReliability, getTrendSignalReliability } from "../availability";
import { buildMetricSignal } from "../aggregate";
import { clamp } from "../baselines";
import { SLEEP_THRESHOLDS } from "../constants";
import type { MetricSignalContext, ReadinessSignal } from "../types";

export function buildSleepSignals(context: MetricSignalContext): ReadinessSignal[] {
  const { availability, baseline } = context;
  const signals: ReadinessSignal[] = [];
  const latestValue = availability.latestEntry?.value ?? null;

  if (availability.acuteEligible && latestValue !== null) {
    const reliability = getAcuteSignalReliability("sleep", availability);

    if (latestValue <= SLEEP_THRESHOLDS.veryPoorHours) {
      const magnitude = clamp(
        (SLEEP_THRESHOLDS.veryPoorHours - latestValue + 0.5) / SLEEP_THRESHOLDS.veryPoorHours
      );
      signals.push(
        buildMetricSignal({
          id: "sleep_very_poor_last_night",
          metric: "sleep",
          kind: "acute",
          polarity: "negative",
          score: -(0.6 + magnitude * 0.3),
          magnitude,
          reliability,
          reason: `Last night's sleep was very low at ${latestValue.toFixed(1)} hours.`,
          evidence: { latestHours: latestValue },
        })
      );
    } else if (latestValue <= SLEEP_THRESHOLDS.poorHours) {
      const magnitude = clamp(
        (SLEEP_THRESHOLDS.poorHours - latestValue + 0.25) / SLEEP_THRESHOLDS.poorHours
      );
      signals.push(
        buildMetricSignal({
          id: "sleep_poor_last_night",
          metric: "sleep",
          kind: "acute",
          polarity: "negative",
          score: -(0.35 + magnitude * 0.2),
          magnitude,
          reliability,
          reason: `Last night's sleep was below a solid recovery range at ${latestValue.toFixed(1)} hours.`,
          evidence: { latestHours: latestValue },
        })
      );
    } else if (latestValue >= SLEEP_THRESHOLDS.goodHours) {
      const magnitude = clamp(
        (latestValue - SLEEP_THRESHOLDS.goodHours + 0.5) / SLEEP_THRESHOLDS.goodHours
      );
      signals.push(
        buildMetricSignal({
          id: "sleep_good_last_night",
          metric: "sleep",
          kind: "acute",
          polarity: "positive",
          score: 0.3 + magnitude * 0.2,
          magnitude,
          reliability,
          reason: `Last night's sleep was supportive at ${latestValue.toFixed(1)} hours.`,
          evidence: { latestHours: latestValue },
        })
      );
    }
  }

  if (
    availability.trendEligible
    && baseline.recentAverage !== null
    && baseline.baselineAverage !== null
  ) {
    const deltaHours = baseline.recentAverage - baseline.baselineAverage;
    const reliability = getTrendSignalReliability("sleep", availability);

    if (deltaHours <= SLEEP_THRESHOLDS.belowBaselineHours) {
      const magnitude = clamp(
        Math.abs(deltaHours) / Math.abs(SLEEP_THRESHOLDS.belowBaselineHours * 2)
      );
      signals.push(
        buildMetricSignal({
          id: "sleep_below_baseline",
          metric: "sleep",
          kind: "trend",
          polarity: "negative",
          score: -(0.3 + magnitude * 0.25),
          magnitude,
          reliability,
          reason: `Recent sleep is averaging ${Math.abs(deltaHours).toFixed(1)} hours below baseline.`,
          evidence: {
            recentAverage: baseline.recentAverage,
            baselineAverage: baseline.baselineAverage,
            deltaHours,
          },
        })
      );
    } else if (deltaHours >= SLEEP_THRESHOLDS.aboveBaselineHours) {
      const magnitude = clamp(deltaHours / (SLEEP_THRESHOLDS.aboveBaselineHours * 2));
      signals.push(
        buildMetricSignal({
          id: "sleep_above_baseline",
          metric: "sleep",
          kind: "trend",
          polarity: "positive",
          score: 0.22 + magnitude * 0.18,
          magnitude,
          reliability,
          reason: `Recent sleep is averaging ${deltaHours.toFixed(1)} hours above baseline.`,
          evidence: {
            recentAverage: baseline.recentAverage,
            baselineAverage: baseline.baselineAverage,
            deltaHours,
          },
        })
      );
    }
  }

  return signals;
}

