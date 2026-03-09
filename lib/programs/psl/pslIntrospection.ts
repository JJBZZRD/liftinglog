import { parseDocument } from "program-specification-language";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBlockDurationDays(value: unknown): number | null {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    const weeksMatch = normalized.match(/^(?<n>\d+)\s*(?:w|week|weeks)$/);
    if (weeksMatch?.groups?.n) return Number(weeksMatch.groups.n) * 7;
    const daysMatch = normalized.match(/^(?<n>\d+)\s*(?:d|day|days)$/);
    if (daysMatch?.groups?.n) return Number(daysMatch.groups.n);
    return null;
  }

  if (isRecord(value)) {
    const type = value.type;
    const n = value.value;
    if ((type === "weeks" || type === "days") && typeof n === "number" && Number.isInteger(n) && n >= 1) {
      return type === "weeks" ? n * 7 : n;
    }
  }

  return null;
}

function getScheduleType(value: unknown): "weekdays" | "interval_days" | "unknown" | null {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (normalized.includes("EVERY")) return "interval_days";
    if (normalized.includes("MON") || normalized.includes("TUE") || normalized.includes("WED") || normalized.includes("THU") || normalized.includes("FRI") || normalized.includes("SAT") || normalized.includes("SUN")) {
      return "weekdays";
    }
    return "unknown";
  }

  if (isRecord(value)) {
    const type = value.type;
    if (type === "weekdays" || type === "interval_days") return type;
    return "unknown";
  }

  return null;
}

function summarizeSessionTiming(sessions: unknown): {
  hasSchedule: boolean;
  hasFixedDays: boolean;
  scheduleKinds: Set<"weekdays" | "interval_days" | "unknown">;
} {
  const scheduleKinds = new Set<"weekdays" | "interval_days" | "unknown">();
  let hasSchedule = false;
  let hasFixedDays = false;

  if (!Array.isArray(sessions)) {
    return { hasSchedule, hasFixedDays, scheduleKinds };
  }

  sessions.forEach((session) => {
    if (!isRecord(session)) return;

    if (session.day !== undefined) {
      hasFixedDays = true;
    }

    if (session.schedule !== undefined) {
      hasSchedule = true;
      const scheduleType = getScheduleType(session.schedule);
      if (scheduleType) {
        scheduleKinds.add(scheduleType);
      }
    }
  });

  return { hasSchedule, hasFixedDays, scheduleKinds };
}

export type PslTimingKind =
  | "blocks"
  | "sequence"
  | "weekdays"
  | "interval"
  | "fixed_day"
  | "mixed"
  | "unknown";

export type PslSourceIntrospection =
  | {
      ok: true;
      hasBlocks: boolean;
      hasSequence: boolean;
      sequenceRepeats: boolean;
      usesSchedule: boolean;
      usesFixedDays: boolean;
      requiresEndDateForActivation: boolean;
      timingKind: PslTimingKind;
      totalBlockDays: number | null;
    }
  | {
      ok: false;
      error: string;
      hasBlocks: false;
      hasSequence: false;
      sequenceRepeats: false;
      usesSchedule: false;
      usesFixedDays: false;
      requiresEndDateForActivation: true;
      timingKind: "unknown";
      totalBlockDays: null;
    };

export function introspectPslSource(source: string): PslSourceIntrospection {
  let raw: unknown;
  try {
    raw = parseDocument(source);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      hasBlocks: false,
      hasSequence: false,
      sequenceRepeats: false,
      usesSchedule: false,
      usesFixedDays: false,
      requiresEndDateForActivation: true,
      timingKind: "unknown",
      totalBlockDays: null,
    };
  }

  if (!isRecord(raw)) {
    return {
      ok: true,
      hasBlocks: false,
      hasSequence: false,
      sequenceRepeats: false,
      usesSchedule: false,
      usesFixedDays: false,
      requiresEndDateForActivation: false,
      timingKind: "unknown",
      totalBlockDays: null,
    };
  }

  const blocks = raw.blocks;
  const sessions = raw.sessions;
  const sequence = raw.sequence;

  const hasBlocks = Array.isArray(blocks);
  const hasSequence = isRecord(sequence);
  const sequenceRepeats = hasSequence ? sequence.repeat === true : false;
  const sessionTiming = summarizeSessionTiming(sessions);

  let usesSchedule = sessionTiming.hasSchedule;
  let usesFixedDays = sessionTiming.hasFixedDays;
  if (hasSequence) {
    usesSchedule = sequenceRepeats;
    usesFixedDays = !sequenceRepeats;
  }

  let totalBlockDays: number | null = null;
  if (Array.isArray(blocks)) {
    let sum = 0;
    for (const block of blocks) {
      if (!isRecord(block)) {
        totalBlockDays = null;
        break;
      }
      const days = parseBlockDurationDays(block.duration);
      if (days === null) {
        totalBlockDays = null;
        break;
      }
      sum += days;
    }
    totalBlockDays = sum > 0 ? sum : null;
  }

  let timingKind: PslTimingKind = "unknown";
  if (hasBlocks) {
    timingKind = "blocks";
  } else if (hasSequence) {
    timingKind = "sequence";
  } else if (sessionTiming.hasSchedule && sessionTiming.hasFixedDays) {
    timingKind = "mixed";
  } else if (sessionTiming.scheduleKinds.size > 1 || sessionTiming.scheduleKinds.has("unknown")) {
    timingKind = "mixed";
  } else if (sessionTiming.scheduleKinds.has("weekdays")) {
    timingKind = "weekdays";
  } else if (sessionTiming.scheduleKinds.has("interval_days")) {
    timingKind = "interval";
  } else if (sessionTiming.hasFixedDays) {
    timingKind = "fixed_day";
  }

  return {
    ok: true,
    hasBlocks,
    hasSequence,
    sequenceRepeats,
    usesSchedule,
    usesFixedDays,
    requiresEndDateForActivation: !hasBlocks && usesSchedule,
    timingKind,
    totalBlockDays,
  };
}
