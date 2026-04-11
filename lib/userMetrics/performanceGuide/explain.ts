import type { AggregateSummary } from "./aggregate";
import { MAX_NOTE_COUNT, MAX_REASON_COUNT, METRIC_LABELS, METRIC_RULES } from "./constants";
import type {
  ConfidenceLabel,
  MetricAvailabilityMap,
  MetricType,
  MissingDataNote,
  PatternSignal,
  PerformanceZone,
  ReadinessSignal,
} from "./types";

function capitalizeMetric(metric: MetricType): string {
  const label = METRIC_LABELS[metric];
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

export function buildReasons(
  signals: ReadinessSignal[],
  patterns: PatternSignal[]
): string[] {
  const reasons: string[] = [];
  const seen = new Set<string>();
  const items = [...signals, ...patterns].sort(
    (left, right) => Math.abs(right.weightedScore) - Math.abs(left.weightedScore)
  );

  for (const item of items) {
    if (!item.reason || seen.has(item.reason)) {
      continue;
    }

    seen.add(item.reason);
    reasons.push(item.reason);
    if (reasons.length >= MAX_REASON_COUNT) {
      break;
    }
  }

  return reasons;
}

function pushNote(notes: MissingDataNote[], note: MissingDataNote): void {
  if (notes.some((existing) => existing.message === note.message)) {
    return;
  }

  notes.push(note);
}

export function buildMissingDataNotes(
  availabilityByMetric: MetricAvailabilityMap,
  aggregate: AggregateSummary
): MissingDataNote[] {
  const notes: MissingDataNote[] = [];

  if (aggregate.availableInfluence <= 0) {
    pushNote(notes, {
      id: "no_recent_data",
      metric: "system",
      message: "Not enough recent recovery metrics are available to estimate performance today.",
    });
  }

  for (const metric of ["sleep", "restingHr", "fatigue", "stress", "soreness"] as const) {
    const availability = availabilityByMetric[metric];
    const rules = METRIC_RULES[metric];

    if (availability.hasRecentData && !availability.trendEligible && rules.trendSupported) {
      pushNote(notes, {
        id: `${metric}_trend_unavailable`,
        metric,
        message:
          availability.baselineCount < rules.trendMinBaselineCount
            ? `${capitalizeMetric(metric)} trend unavailable due to limited baseline entries.`
            : `${capitalizeMetric(metric)} trend unavailable due to limited recent entries.`,
      });
    } else if (availability.hasAnyData && !availability.hasRecentData) {
      pushNote(notes, {
        id: `${metric}_stale`,
        metric,
        message: `${capitalizeMetric(metric)} is too stale to influence this guide.`,
      });
    }

    if (notes.length >= MAX_NOTE_COUNT) {
      break;
    }
  }

  const dominantMetric = aggregate.dominantMetrics[0];
  if (aggregate.basedMostlyOnSingleMetric && dominantMetric) {
    pushNote(notes, {
      id: "narrow_data_warning_note",
      metric: "system",
      message: `This guide is based mostly on ${METRIC_LABELS[dominantMetric]} because other recent recovery metrics are limited.`,
    });
  }

  return notes.slice(0, MAX_NOTE_COUNT);
}

export function buildSummary(
  zone: PerformanceZone | null,
  reasons: string[],
  confidenceLabel: ConfidenceLabel
): string {
  if (zone === null) {
    return "Not enough recent data to estimate performance.";
  }

  const zoneLabel = zone.charAt(0).toUpperCase() + zone.slice(1);
  const leadingReason = reasons[0];

  if (!leadingReason) {
    return `${zoneLabel} with ${confidenceLabel} confidence.`;
  }

  return `${zoneLabel}: ${leadingReason}`;
}

