import { getAcuteSignalReliability, getTrendSignalReliability } from "../availability";
import { buildMetricSignal } from "../aggregate";
import { clamp } from "../baselines";
import { STEPS_THRESHOLDS } from "../constants";
import type { MetricSignalContext, ReadinessSignal } from "../types";

export function buildStepsSignals(context: MetricSignalContext): ReadinessSignal[] {
  const { availability, baseline } = context;
  const signals: ReadinessSignal[] = [];
  const latestValue = availability.latestEntry?.value ?? null;

  if (availability.acuteEligible && latestValue !== null) {
    const reliability = getAcuteSignalReliability("steps", availability);
    const baselineReference = baseline.baselineAverage ?? 0;
    const isAcuteSpike =
      latestValue >= STEPS_THRESHOLDS.acuteHighSteps
      || (baselineReference > 0 && latestValue >= baselineReference * STEPS_THRESHOLDS.spikeRatio);

    if (isAcuteSpike) {
      const reference = Math.max(STEPS_THRESHOLDS.acuteHighSteps, baselineReference, 1);
      const magnitude = clamp(latestValue / (reference * 1.5));
      signals.push(
        buildMetricSignal({
          id: "steps_high_today",
          metric: "steps",
          kind: "acute",
          polarity: "negative",
          score: -(0.2 + magnitude * 0.12),
          magnitude,
          reliability,
          reason: `Steps are unusually high today at ${Math.round(latestValue).toLocaleString()} steps.`,
          evidence: {
            latestSteps: latestValue,
            baselineAverage: baseline.baselineAverage,
          },
        })
      );
    }
  }

  if (
    availability.trendEligible
    && baseline.recentAverage !== null
    && baseline.baselineAverage !== null
    && baseline.baselineAverage > 0
  ) {
    const ratio = baseline.recentAverage / baseline.baselineAverage;
    const delta = baseline.recentAverage - baseline.baselineAverage;
    const reliability = getTrendSignalReliability("steps", availability);

    if (
      ratio >= STEPS_THRESHOLDS.elevatedRecentRatio
      && delta >= STEPS_THRESHOLDS.elevatedAbsoluteDelta
    ) {
      const magnitude = clamp(
        Math.max(
          ratio / STEPS_THRESHOLDS.elevatedRecentRatio,
          delta / (STEPS_THRESHOLDS.elevatedAbsoluteDelta * 2)
        )
      );
      signals.push(
        buildMetricSignal({
          id: "steps_high_trend",
          metric: "steps",
          kind: "trend",
          polarity: "negative",
          score: -(0.14 + magnitude * 0.1),
          magnitude,
          reliability,
          reason: `Recent steps are running high versus baseline by ${Math.round(delta).toLocaleString()} steps.`,
          evidence: {
            recentAverage: baseline.recentAverage,
            baselineAverage: baseline.baselineAverage,
            ratio,
            delta,
          },
        })
      );
    }
  }

  return signals;
}

