import { getUserMetricDefinition, type UserMetricKey } from "../definitions";
import type { RawThemeColors } from "../../theme/ThemeContext";
import type {
  ConfidenceLabel,
  MetricAvailability,
  MetricType,
  PerformanceGuideResult,
  PerformanceZone,
} from "./types";

export type PerformanceGuideTone =
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "neutral"
  | "muted";

function capitalizeLabel(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getPerformanceGuideMetricLabel(metric: MetricType): string {
  return getUserMetricDefinition(metric)?.label ?? capitalizeLabel(metric);
}

export function formatPerformanceGuideMetricList(metrics: MetricType[]): string {
  return metrics.map(getPerformanceGuideMetricLabel).join(", ");
}

export function getPerformanceGuideZoneLabel(zone: PerformanceZone | null): string {
  if (zone === null) {
    return "Unavailable";
  }

  return capitalizeLabel(zone);
}

export function getPerformanceGuideZoneTone(
  zone: PerformanceZone | null
): PerformanceGuideTone {
  switch (zone) {
    case "peak":
      return "success";
    case "ready":
      return "primary";
    case "stable":
      return "neutral";
    case "caution":
      return "warning";
    case "compromised":
      return "destructive";
    case null:
    default:
      return "muted";
  }
}

export function getPerformanceGuideConfidenceTone(
  confidenceLabel: ConfidenceLabel
): PerformanceGuideTone {
  switch (confidenceLabel) {
    case "high":
      return "success";
    case "medium":
      return "primary";
    case "low":
      return "warning";
    case "insufficient":
    default:
      return "muted";
  }
}

export function getPerformanceGuideConfidenceLabel(
  confidenceLabel: ConfidenceLabel
): string {
  return capitalizeLabel(confidenceLabel);
}

export function getPerformanceGuideInterpretation(
  zone: PerformanceZone | null
): string {
  switch (zone) {
    case "peak":
      return "Broadly supportive recovery signals today.";
    case "ready":
      return "Good setup for normal hard training.";
    case "stable":
      return "Mixed or neutral picture; train normally unless the session feels off.";
    case "caution":
      return "Some recovery strain is present; be conservative with load or volume.";
    case "compromised":
      return "Recovery strain is elevated; favor reduced demand or recovery focus.";
    case null:
    default:
      return "Not enough recent data to estimate performance confidently.";
  }
}

export function getPerformanceGuideTopSummaryLines(
  result: PerformanceGuideResult
): string[] {
  const shouldPreferNote =
    result.zone === null
    || result.confidenceLabel === "low"
    || result.confidenceLabel === "insufficient";

  if (shouldPreferNote && result.missingDataNotes.length > 0) {
    return [result.missingDataNotes[0].message];
  }

  const topReasons = result.reasons.slice(0, 2);
  if (topReasons.length > 0) {
    return topReasons;
  }

  if (result.missingDataNotes.length > 0) {
    return [result.missingDataNotes[0].message];
  }

  return [];
}

export function formatPerformanceGuideScore(
  value: number | null | undefined
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return value.toFixed(2);
}

export function formatPerformanceGuideConfidence(
  value: number | null | undefined
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  return value.toFixed(2);
}

export function getPerformanceGuideToneStyles(
  rawColors: RawThemeColors,
  tone: PerformanceGuideTone
): {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
} {
  switch (tone) {
    case "success":
      return {
        backgroundColor: `${rawColors.success}18`,
        borderColor: `${rawColors.success}33`,
        textColor: rawColors.success,
      };
    case "warning":
      return {
        backgroundColor: `${rawColors.warning}18`,
        borderColor: `${rawColors.warning}33`,
        textColor: rawColors.warning,
      };
    case "destructive":
      return {
        backgroundColor: `${rawColors.destructive}16`,
        borderColor: `${rawColors.destructive}30`,
        textColor: rawColors.destructive,
      };
    case "neutral":
      return {
        backgroundColor: rawColors.surfaceSecondary,
        borderColor: rawColors.borderLight,
        textColor: rawColors.foregroundSecondary,
      };
    case "muted":
      return {
        backgroundColor: rawColors.surfaceSecondary,
        borderColor: rawColors.borderLight,
        textColor: rawColors.foregroundMuted,
      };
    case "primary":
    default:
      return {
        backgroundColor: rawColors.primaryLight,
        borderColor: `${rawColors.primary}2D`,
        textColor: rawColors.primary,
      };
  }
}

export function getPerformanceGuideCoverageStatus(
  availability: MetricAvailability
): {
  label: string;
  detail: string;
} {
  if (!availability.hasAnyData) {
    return {
      label: "No data",
      detail: "No entries logged yet",
    };
  }

  if (!availability.hasRecentData) {
    return {
      label: "Stale",
      detail:
        availability.daysSinceLastEntry === null
          ? "No recent entries"
          : `Last entry ${availability.daysSinceLastEntry}d ago`,
    };
  }

  const countDetail = `Recent ${availability.recentCount}, baseline ${availability.baselineCount}`;
  if (availability.trendEligible) {
    return {
      label: "Trend ready",
      detail: countDetail,
    };
  }

  if (availability.acuteEligible) {
    return {
      label: "Acute only",
      detail: countDetail,
    };
  }

  return {
    label: "Recent, trend limited",
    detail: countDetail,
  };
}

export function buildPerformanceGuideMetricPriority(
  result: PerformanceGuideResult,
  fallbackMetrics: UserMetricKey[]
): UserMetricKey[] {
  const seen = new Set<UserMetricKey>();
  const ordered: UserMetricKey[] = [];

  for (const metric of result.dominantMetrics) {
    if (!seen.has(metric)) {
      seen.add(metric);
      ordered.push(metric);
    }
  }

  for (const metric of result.contributingMetrics) {
    if (!seen.has(metric)) {
      seen.add(metric);
      ordered.push(metric);
    }
  }

  if (ordered.length > 0) {
    return ordered;
  }

  return fallbackMetrics.filter((metric) => {
    if (seen.has(metric)) {
      return false;
    }

    seen.add(metric);
    return true;
  });
}
