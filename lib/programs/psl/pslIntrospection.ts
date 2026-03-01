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

function sessionsUseSchedule(sessions: unknown): boolean {
  if (!Array.isArray(sessions)) return false;
  return sessions.some((s) => isRecord(s) && s.schedule !== undefined);
}

export type PslSourceIntrospection = {
  ok: true;
  hasBlocks: boolean;
  usesSchedule: boolean;
  totalBlockDays: number | null;
} | {
  ok: false;
  error: string;
  hasBlocks: false;
  usesSchedule: false;
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
      usesSchedule: false,
      totalBlockDays: null,
    };
  }

  if (!isRecord(raw)) {
    return {
      ok: true,
      hasBlocks: false,
      usesSchedule: false,
      totalBlockDays: null,
    };
  }

  const blocks = raw.blocks;
  const sessions = raw.sessions;

  const hasBlocks = Array.isArray(blocks);
  const usesSchedule =
    sessionsUseSchedule(sessions) ||
    (Array.isArray(blocks) &&
      blocks.some((b) => isRecord(b) && sessionsUseSchedule(b.sessions)));

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

  return {
    ok: true,
    hasBlocks,
    usesSchedule,
    totalBlockDays,
  };
}

