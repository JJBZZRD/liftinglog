import type { UserCheckinInput, UserCheckin } from "../db/userCheckins";
import type { UnitPreference } from "../db/settings";
import { formatWeightFromKg } from "../utils/units";

export type UserMetricKey =
  | "bodyweight"
  | "waist"
  | "sleep"
  | "restingHr"
  | "fatigue"
  | "soreness"
  | "stress"
  | "steps";

export type UserMetricAccent = "primary" | "success" | "warning" | "destructive";
export type UserMetricInputMode = "decimal" | "integer" | "score";
export type UserMetricChartVariant = "line" | "bar";

export type UserMetricDefinition = {
  key: UserMetricKey;
  label: string;
  subtitle: string;
  icon: string;
  accent: UserMetricAccent;
  emptyValue: string;
  emptyStateLabel: string;
  inputMode: UserMetricInputMode;
  inputLabel: string;
  inputPlaceholder: string;
  inputHelper: string;
};

export type UserMetricEntry = {
  checkinId: number;
  recordedAt: number;
  value: number;
  sleepStartAt: number | null;
  sleepEndAt: number | null;
  note: string | null;
  context: string | null;
  source: string | null;
};

export const USER_METRIC_DEFINITIONS: UserMetricDefinition[] = [
  {
    key: "bodyweight",
    label: "Bodyweight",
    subtitle: "Track scale weight and keep bodyweight movements in context.",
    icon: "scale-bathroom",
    accent: "primary",
    emptyValue: "--",
    emptyStateLabel: "No bodyweight logged yet",
    inputMode: "decimal",
    inputLabel: "Bodyweight",
    inputPlaceholder: "e.g. 82.4",
    inputHelper: "Saved in kilograms internally and shown in your selected unit.",
  },
  {
    key: "waist",
    label: "Waist",
    subtitle: "A simple body-composition proxy without full nutrition tracking.",
    icon: "tape-measure",
    accent: "success",
    emptyValue: "--",
    emptyStateLabel: "No waist measurement logged yet",
    inputMode: "decimal",
    inputLabel: "Waist circumference",
    inputPlaceholder: "e.g. 84.5",
    inputHelper: "Enter waist in centimeters.",
  },
  {
    key: "sleep",
    label: "Sleep",
    subtitle: "Recovery context for sessions that feel better or worse than expected.",
    icon: "sleep",
    accent: "warning",
    emptyValue: "--",
    emptyStateLabel: "No sleep logged yet",
    inputMode: "decimal",
    inputLabel: "Sleep duration",
    inputPlaceholder: "e.g. 7.5",
    inputHelper: "Enter total sleep in hours. Decimals are supported.",
  },
  {
    key: "restingHr",
    label: "Resting HR",
    subtitle: "A low-friction recovery marker that can explain fatigue or recovery drift.",
    icon: "heart-pulse",
    accent: "destructive",
    emptyValue: "--",
    emptyStateLabel: "No resting heart rate logged yet",
    inputMode: "integer",
    inputLabel: "Resting heart rate",
    inputPlaceholder: "e.g. 58",
    inputHelper: "Enter beats per minute.",
  },
  {
    key: "fatigue",
    label: "Fatigue",
    subtitle: "Subjective daily fatigue tracking for autoregulation and recovery context.",
    icon: "battery-low",
    accent: "warning",
    emptyValue: "--",
    emptyStateLabel: "No fatigue score logged yet",
    inputMode: "score",
    inputLabel: "Fatigue score",
    inputPlaceholder: "",
    inputHelper: "Use a 1-5 score where 1 is low fatigue and 5 is very high fatigue.",
  },
  {
    key: "soreness",
    label: "Soreness",
    subtitle: "Useful context when performance is good despite fatigue or vice versa.",
    icon: "arm-flex",
    accent: "warning",
    emptyValue: "--",
    emptyStateLabel: "No soreness score logged yet",
    inputMode: "score",
    inputLabel: "Soreness score",
    inputPlaceholder: "",
    inputHelper: "Use a 1-5 score.",
  },
  {
    key: "stress",
    label: "Stress",
    subtitle: "Simple day-level stress tracking without full lifestyle logging.",
    icon: "brain",
    accent: "destructive",
    emptyValue: "--",
    emptyStateLabel: "No stress score logged yet",
    inputMode: "score",
    inputLabel: "Stress score",
    inputPlaceholder: "",
    inputHelper: "Use a 1-5 score.",
  },
  {
    key: "steps",
    label: "Steps",
    subtitle: "General activity load that can influence recovery and appetite.",
    icon: "walk",
    accent: "success",
    emptyValue: "--",
    emptyStateLabel: "No steps logged yet",
    inputMode: "integer",
    inputLabel: "Daily steps",
    inputPlaceholder: "e.g. 8500",
    inputHelper: "Enter a whole-number step count.",
  },
];

export function getUserMetricDefinition(metricKey: string): UserMetricDefinition | null {
  return USER_METRIC_DEFINITIONS.find((definition) => definition.key === metricKey) ?? null;
}

export function getUserMetricNumericValue(
  checkin: UserCheckin,
  metricKey: UserMetricKey
): number | null {
  switch (metricKey) {
    case "bodyweight":
      return checkin.bodyweightKg;
    case "waist":
      return checkin.waistCm;
    case "sleep":
      return checkin.sleepHours;
    case "restingHr":
      return checkin.restingHrBpm;
    case "fatigue":
      return checkin.fatigueScore;
    case "soreness":
      return checkin.sorenessScore;
    case "stress":
      return checkin.stressScore;
    case "steps":
      return checkin.steps;
    default:
      return null;
  }
}

export function getUserMetricEntries(
  checkins: UserCheckin[],
  metricKey: UserMetricKey
): UserMetricEntry[] {
  return checkins.flatMap((checkin) => {
    const value = getUserMetricNumericValue(checkin, metricKey);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return [];
    }

    return [{
      checkinId: checkin.id,
      recordedAt: checkin.recordedAt,
      value,
      sleepStartAt: checkin.sleepStartAt ?? null,
      sleepEndAt: checkin.sleepEndAt ?? null,
      note: checkin.note ?? null,
      context: checkin.context ?? null,
      source: checkin.source ?? null,
    }];
  });
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

export function formatSleepHours(hoursValue: number): string {
  const totalMinutes = Math.max(0, Math.round(hoursValue * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function getUserMetricChartVariant(metricKey: UserMetricKey): UserMetricChartVariant {
  switch (metricKey) {
    case "sleep":
    case "fatigue":
    case "soreness":
    case "stress":
    case "steps":
      return "bar";
    case "bodyweight":
    case "waist":
    case "restingHr":
    default:
      return "line";
  }
}

export function formatUserMetricValue(
  metricKey: UserMetricKey,
  value: number | null | undefined,
  unitPreference: UnitPreference
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }

  switch (metricKey) {
    case "bodyweight":
      return formatWeightFromKg(value, unitPreference, {
        placeholder: "--",
        maximumFractionDigits: 1,
      });
    case "waist":
      return `${formatNumber(value, 1)} cm`;
    case "sleep":
      return formatSleepHours(value);
    case "restingHr":
      return `${formatNumber(value, 0)} bpm`;
    case "fatigue":
    case "soreness":
    case "stress":
      return `${formatNumber(value, 0)}/5`;
    case "steps":
      return formatNumber(value, 0);
    default:
      return "--";
  }
}

export function parseUserMetricInputValue(
  metricKey: UserMetricKey,
  rawValue: string
): number | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  switch (metricKey) {
    case "restingHr":
    case "steps":
      return Math.round(parsed);
    case "bodyweight":
    case "waist":
    case "sleep":
      return parsed;
    case "fatigue":
    case "soreness":
    case "stress":
      return Math.round(parsed);
    default:
      return null;
  }
}

export function buildUserMetricCheckinInput(
  metricKey: UserMetricKey,
  value: number
): UserCheckinInput {
  switch (metricKey) {
    case "bodyweight":
      return { bodyweight_kg: value };
    case "waist":
      return { waist_cm: value };
    case "sleep":
      return { sleep_hours: value };
    case "restingHr":
      return { resting_hr_bpm: Math.round(value) };
    case "fatigue":
      return { fatigue_score: Math.round(value) };
    case "soreness":
      return { soreness_score: Math.round(value) };
    case "stress":
      return { stress_score: Math.round(value) };
    case "steps":
      return { steps: Math.round(value) };
    default:
      return {};
  }
}

export function getAverageMetricValue(entries: UserMetricEntry[]): number | null {
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  return total / entries.length;
}

export function getMetricRange(entries: UserMetricEntry[]): { low: number; high: number } | null {
  if (entries.length === 0) return null;

  let low = entries[0].value;
  let high = entries[0].value;

  for (const entry of entries) {
    if (entry.value < low) low = entry.value;
    if (entry.value > high) high = entry.value;
  }

  return { low, high };
}
