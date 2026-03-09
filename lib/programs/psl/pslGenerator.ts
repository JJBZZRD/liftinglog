import type { IntensityTarget, SessionSlot, Weekday } from "program-specification-language";
import { createId } from "program-specification-language";

export type FlatProgramTimingMode = "sequence" | "weekdays" | "fixed_day" | "interval_days";

export interface SetConfig {
  count: number;
  reps: number | { min: number; max: number };
  intensity?: IntensityTarget;
  role?: string;
  restSeconds?: number;
  progression?: ProgressionConfig;
}

export interface ProgressionConfig {
  type: "increment" | "weekly_increment";
  by: number;
  unit: "kg" | "lb";
  condition?: "if success";
  cadence?: "every session" | "every week" | "every 2 weeks";
}

export interface ExerciseConfig {
  exerciseId: number;
  exerciseName: string;
  sets: SetConfig[];
  restSeconds?: number;
}

export interface SessionDraft {
  clientId: string;
  sessionId: string;
  name: string;
  exercises: ExerciseConfig[];
  slot?: SessionSlot;
  weekdays: Weekday[];
  fixedDay: number;
  intervalEvery: number;
  intervalStartOffsetDays: number;
  intervalEndOffsetDays: number | null;
  restAfterDays: number;
}

export interface FlatProgramDraft {
  name: string;
  description?: string;
  units?: "kg" | "lb";
  timingMode: FlatProgramTimingMode;
  sequenceRepeat: boolean;
  sessions: SessionDraft[];
}

const WEEKDAY_ORDER: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function createClientId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getAlphabetLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function maybeYamlString(value: string | undefined): string | undefined {
  return value?.trim() ? yamlString(value.trim()) : undefined;
}

function durationToString(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}

function intensityToShorthand(intensity: IntensityTarget): string {
  switch (intensity.type) {
    case "percent_1rm": {
      let s = `@${intensity.value}%`;
      if (intensity.plus_load) {
        const sign = intensity.plus_load.value >= 0 ? "+" : "-";
        s += `${sign}${Math.abs(intensity.plus_load.value)}${intensity.plus_load.unit}`;
      }
      return s;
    }
    case "rpe":
      return `@RPE${intensity.value}`;
    case "rir":
      return `@RIR${intensity.value}`;
    case "load":
      return `@${intensity.value}${intensity.unit}`;
    case "load_range":
      return `@[${intensity.min},${intensity.max}]${intensity.unit}`;
    case "percent_of_set":
      return `@${intensity.value}% of ${intensity.role}`;
    case "load_delta_from_set": {
      const sign = intensity.value >= 0 ? "+" : "";
      return `${sign}${intensity.value}${intensity.unit} from ${intensity.role}`;
    }
    default:
      return "";
  }
}

function repsToString(reps: number | { min: number; max: number }): string {
  if (typeof reps === "number") return String(reps);
  return `${reps.min}-${reps.max}`;
}

function progressionToShorthand(prog: ProgressionConfig): string {
  const sign = prog.by >= 0 ? "+" : "";
  let s = `${sign}${prog.by}${prog.unit}`;

  if (prog.cadence === "every week" || prog.cadence === "every 2 weeks") {
    s += ` ${prog.cadence}`;
  } else {
    s += " every session";
  }

  if (prog.condition === "if success") {
    s += " if success";
  }

  return s;
}

function setToShorthand(set: SetConfig): string {
  let s = `${set.count}x${repsToString(set.reps)}`;

  if (set.intensity) {
    s += ` ${intensityToShorthand(set.intensity)}`;
  }

  if (set.role && set.role !== "work") {
    s += ` role ${set.role}`;
  }

  if (set.restSeconds) {
    s += ` rest ${durationToString(set.restSeconds)}`;
  }

  if (set.progression) {
    s += `; ${progressionToShorthand(set.progression)}`;
  }

  return s;
}

function resolveUniqueSessionIds(sessions: SessionDraft[]): string[] {
  const used = new Set<string>();

  return sessions.map((session, index) => {
    const base =
      slugify(session.sessionId) ||
      slugify(session.name) ||
      `session-${getAlphabetLetter(index).toLowerCase()}`;
    let candidate = base;
    let suffix = 2;

    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    used.add(candidate);
    return candidate;
  });
}

function sortWeekdays(days: Weekday[]): Weekday[] {
  return [...days].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
}

function buildSequenceDefaults(index: number): Pick<SessionDraft, "name" | "sessionId" | "restAfterDays"> {
  return {
    name: `Program Day ${index + 1}`,
    sessionId: `day-${index + 1}`,
    restAfterDays: index === 2 ? 2 : 1,
  };
}

function buildWeekdayDefaults(index: number): Pick<SessionDraft, "name" | "sessionId" | "weekdays"> {
  const weekdays: Weekday[] = ["MON", "WED", "FRI"];
  return {
    name: `Session ${getAlphabetLetter(index)}`,
    sessionId: `session-${getAlphabetLetter(index).toLowerCase()}`,
    weekdays: weekdays[index] ? [weekdays[index]] : [],
  };
}

function buildFixedDayDefaults(index: number): Pick<SessionDraft, "name" | "sessionId" | "fixedDay"> {
  return {
    name: `Program Day ${index + 1}`,
    sessionId: `day-${index + 1}`,
    fixedDay: index * 2 + 1,
  };
}

function buildIntervalDefaults(index: number): Pick<SessionDraft, "name" | "sessionId" | "intervalEvery" | "intervalStartOffsetDays" | "intervalEndOffsetDays"> {
  return {
    name: `Session ${getAlphabetLetter(index)}`,
    sessionId: `session-${getAlphabetLetter(index).toLowerCase()}`,
    intervalEvery: 2,
    intervalStartOffsetDays: index * 2,
    intervalEndOffsetDays: null,
  };
}

export function createDefaultSessionDraft(mode: FlatProgramTimingMode, index: number): SessionDraft {
  const base: SessionDraft = {
    clientId: createClientId(),
    sessionId: `session-${getAlphabetLetter(index).toLowerCase()}`,
    name: `Session ${getAlphabetLetter(index)}`,
    exercises: [],
    weekdays: [],
    fixedDay: index + 1,
    intervalEvery: 2,
    intervalStartOffsetDays: index * 2,
    intervalEndOffsetDays: null,
    restAfterDays: 1,
  };

  if (mode === "sequence") {
    return { ...base, ...buildSequenceDefaults(index) };
  }

  if (mode === "weekdays") {
    return { ...base, ...buildWeekdayDefaults(index) };
  }

  if (mode === "fixed_day") {
    return { ...base, ...buildFixedDayDefaults(index) };
  }

  return { ...base, ...buildIntervalDefaults(index) };
}

export function createDefaultFlatProgramDraft(
  timingMode: FlatProgramTimingMode,
  options: { name?: string; description?: string; units?: "kg" | "lb" } = {}
): FlatProgramDraft {
  const sessionCount = timingMode === "interval_days" ? 1 : 3;
  return {
    name: options.name?.trim() || "My Program",
    description: options.description?.trim() || undefined,
    units: options.units ?? "kg",
    timingMode,
    sequenceRepeat: true,
    sessions: Array.from({ length: sessionCount }, (_, index) => createDefaultSessionDraft(timingMode, index)),
  };
}

export function serializeFlatProgramDraftToPsl(draft: FlatProgramDraft): string {
  const lines: string[] = [];
  const programId = createId("prog", draft.name);
  const resolvedSessionIds = resolveUniqueSessionIds(draft.sessions);

  lines.push('language_version: "0.3"');
  lines.push("metadata:");
  lines.push(`  id: ${programId}`);
  lines.push(`  name: ${yamlString(draft.name.trim() || "My Program")}`);
  const description = maybeYamlString(draft.description);
  if (description) {
    lines.push(`  description: ${description}`);
  }

  if (draft.units) {
    lines.push(`units: ${draft.units}`);
  }

  if (draft.sessions.length === 0) {
    lines.push("sessions: []");
  } else {
    lines.push("sessions:");
    draft.sessions.forEach((session, index) => {
      lines.push(`  - id: ${resolvedSessionIds[index]}`);
      lines.push(`    name: ${yamlString(session.name.trim() || `Session ${getAlphabetLetter(index)}`)}`);
      if (session.slot !== undefined) {
        lines.push(`    slot: ${typeof session.slot === "string" ? session.slot : session.slot}`);
      }

      if (draft.timingMode === "weekdays") {
        lines.push("    schedule:");
        const weekdays = sortWeekdays(session.weekdays);
        lines.push("      type: weekdays");
        lines.push(`      days: [${weekdays.join(", ")}]`);
      } else if (draft.timingMode === "fixed_day") {
        lines.push(`    day: ${Math.max(1, session.fixedDay || 1)}`);
      } else if (draft.timingMode === "interval_days") {
        lines.push("    schedule:");
        lines.push("      type: interval_days");
        lines.push(`      every: ${Math.max(1, session.intervalEvery || 1)}`);
        lines.push(`      start_offset_days: ${Math.max(0, session.intervalStartOffsetDays || 0)}`);
        if (session.intervalEndOffsetDays !== null && session.intervalEndOffsetDays !== undefined) {
          lines.push(`      end_offset_days: ${Math.max(0, session.intervalEndOffsetDays)}`);
        }
      }

      if (session.exercises.length === 0) {
        lines.push("    exercises: []");
        return;
      }

      lines.push("    exercises:");
      session.exercises.forEach((exercise) => {
        lines.push(`      - exercise: ${yamlString(exercise.exerciseName)}`);
        if (exercise.restSeconds) {
          lines.push(`        rest: ${yamlString(durationToString(exercise.restSeconds))}`);
        }
        lines.push("        sets:");
        exercise.sets.forEach((set) => {
          lines.push(`          - ${yamlString(setToShorthand(set))}`);
        });
      });
    });
  }

  if (draft.timingMode === "sequence") {
    lines.push("sequence:");
    lines.push(`  repeat: ${draft.sequenceRepeat ? "true" : "false"}`);
    lines.push("  items:");
    draft.sessions.forEach((session, index) => {
      lines.push(`    - session_id: ${resolvedSessionIds[index]}`);
      const restAfterDays =
        !draft.sequenceRepeat && index === draft.sessions.length - 1
          ? 0
          : Math.max(0, session.restAfterDays || 0);
      lines.push(`      rest_after_days: ${restAfterDays}`);
    });
  }

  return `${lines.join("\n")}\n`;
}

export function buildStarterPslSource(
  timingMode: FlatProgramTimingMode,
  options: { name?: string; description?: string; units?: "kg" | "lb" } = {}
): string {
  return serializeFlatProgramDraftToPsl(createDefaultFlatProgramDraft(timingMode, options));
}
