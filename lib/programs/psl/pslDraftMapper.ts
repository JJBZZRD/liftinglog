import { parseDocument } from "program-specification-language";
import type {
  CompiledExercise,
  CompiledSession,
  CompiledSet,
  IntensityTarget,
  ProgramAst,
  ProgressionRule,
  Weekday,
} from "program-specification-language";
import type {
  ExerciseConfig,
  FlatProgramDraft,
  FlatProgramTimingMode,
  SessionDraft,
  SetConfig,
} from "./pslGenerator";
import { introspectPslSource } from "./pslIntrospection";
import { compilePslSource } from "./pslService";

const BUILDER_PREVIEW_START_DATE = "2026-01-05";
const BUILDER_PREVIEW_END_DATE = "2026-03-30";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveTimingMode(source: string): FlatProgramTimingMode | null {
  const result = introspectPslSource(source);
  if (!result.ok || result.hasBlocks) return null;
  if (result.timingKind === "sequence") return "sequence";
  if (result.timingKind === "weekdays") return "weekdays";
  if (result.timingKind === "interval") return "interval_days";
  if (result.timingKind === "fixed_day") return "fixed_day";
  return null;
}

function buildCompileCalendarOverride(source: string) {
  const result = introspectPslSource(source);
  if (!result.ok) return undefined;
  if (result.requiresEndDateForActivation) {
    return {
      start_date: BUILDER_PREVIEW_START_DATE,
      end_date: BUILDER_PREVIEW_END_DATE,
    };
  }
  return { start_date: BUILDER_PREVIEW_START_DATE };
}

function isSupportedProgression(
  progression: ProgressionRule | undefined,
  units: ProgramAst["units"]
): progression is Extract<ProgressionRule, { type: "increment" }> {
  if (!progression) return true;
  if (progression.type !== "increment") return false;
  if (typeof progression.by !== "number" || !units) return false;
  if (progression.scope !== undefined || progression.criteria !== undefined) return false;
  if (progression.when) {
    if (progression.when.type !== "session_success") return false;
    if (progression.when.equals === false) return false;
  }
  if (progression.cadence) {
    if (progression.cadence.type !== "sessions") return false;
    if (progression.cadence.every !== undefined && progression.cadence.every !== 1) return false;
    if (progression.cadence.on_weekdays && progression.cadence.on_weekdays.length > 0) {
      return false;
    }
  }
  return true;
}

function isSupportedIntensity(intensity: IntensityTarget | undefined): boolean {
  if (!intensity) return true;
  if (intensity.type === "percent_1rm") return intensity.plus_load === undefined;
  return (
    intensity.type === "rpe" ||
    intensity.type === "rir" ||
    intensity.type === "load"
  );
}

function isSupportedSet(set: CompiledSet, units: ProgramAst["units"]): boolean {
  if (!set.reps) return false;
  if (!isSupportedIntensity(set.intensity)) return false;
  if (!isSupportedProgression(set.progression, units)) return false;
  return (
    set.work_type === undefined &&
    set.time_mode === undefined &&
    set.duration_seconds === undefined &&
    set.interval_seconds === undefined &&
    set.target_total_reps === undefined &&
    set.rest_seconds === undefined &&
    set.rest_before_seconds === undefined &&
    set.rest_after_seconds === undefined &&
    set.constraints === undefined &&
    set.repeat === undefined &&
    set.tempo === undefined &&
    set.pause_seconds === undefined &&
    set.eccentric_seconds === undefined &&
    set.note === undefined
  );
}

function isSupportedExercise(exercise: CompiledExercise, units: ProgramAst["units"]): boolean {
  if (exercise.exercise_id !== undefined) return false;
  if (exercise.family !== undefined) return false;
  if (exercise.tags && exercise.tags.length > 0) return false;
  if (exercise.modifiers && Object.keys(exercise.modifiers).length > 0) return false;
  if (exercise.substitutions && exercise.substitutions.length > 0) return false;
  if (exercise.constraints !== undefined) return false;
  if (exercise.warmup !== undefined) return false;
  if (exercise.group_id !== undefined) return false;
  if (exercise.rest_seconds !== undefined) return false;
  if (exercise.rest_before_seconds !== undefined) return false;
  if (exercise.rest_after_seconds !== undefined) return false;
  if (exercise.tempo !== undefined) return false;
  if (exercise.pause_seconds !== undefined) return false;
  if (exercise.eccentric_seconds !== undefined) return false;
  if (exercise.rounding !== undefined) return false;
  if (exercise.units !== undefined && exercise.units !== units) return false;
  return exercise.sets.every((set) => isSupportedSet(set, units));
}

function isSupportedSession(session: CompiledSession, mode: FlatProgramTimingMode): boolean {
  if (session.slot !== undefined) return false;
  if (session.rest_default_seconds !== undefined) return false;
  if (session.groups && session.groups.length > 0) return false;
  if (session.constraints !== undefined) return false;
  if (session.modifiers !== undefined) return false;
  if (session.block_id !== undefined) return false;

  if (mode === "weekdays") {
    if (!session.schedule || session.schedule.type !== "weekdays") return false;
    if (session.day !== undefined) return false;
    if (
      session.schedule.start_offset_days !== undefined ||
      session.schedule.end_offset_days !== undefined
    ) {
      return false;
    }
  }

  if (mode === "fixed_day") {
    if (typeof session.day !== "number") return false;
    if (session.schedule !== undefined) return false;
  }

  if (mode === "interval_days") {
    if (!session.schedule || session.schedule.type !== "interval_days") return false;
    if (session.day !== undefined) return false;
  }

  return true;
}

function getBuilderProgressionSignature(progression: ProgressionRule | undefined): string {
  if (!progression || progression.type !== "increment") return "";
  return JSON.stringify({
    type: progression.type,
    by: progression.by,
    when: progression.when,
    cadence: progression.cadence,
  });
}

function getSetSignature(set: CompiledSet): string {
  return JSON.stringify({
    reps: set.reps,
    intensity: set.intensity,
    role: set.role,
    progression: set.progression && getBuilderProgressionSignature(set.progression),
  });
}

function toRepsValue(set: CompiledSet): SetConfig["reps"] {
  if (!set.reps) return 5;
  if (set.reps.min === set.reps.max) return set.reps.min;
  return { min: set.reps.min, max: set.reps.max };
}

function toBuilderSet(
  set: CompiledSet,
  units: ProgramAst["units"]
): SetConfig {
  const builderSet: SetConfig = {
    count: 1,
    reps: toRepsValue(set),
  };

  if (set.intensity) {
    builderSet.intensity = set.intensity;
  }

  if (set.role && set.role !== "work") {
    builderSet.role = set.role;
  }

  if (set.progression && units) {
    const progression = set.progression as { by: number };
    builderSet.progression = {
      type: "increment",
      by: progression.by,
      unit: units,
      cadence: "every session",
      condition: "if success",
    };
  }

  return builderSet;
}

function toBuilderExercise(
  exercise: CompiledExercise,
  sessionIndex: number,
  exerciseIndex: number,
  units: ProgramAst["units"]
): ExerciseConfig {
  const groupedSets: SetConfig[] = [];
  let previousSignature: string | null = null;

  exercise.sets.forEach((set) => {
    const signature = getSetSignature(set);
    const nextSet = toBuilderSet(set, units);
    const previousSet = groupedSets[groupedSets.length - 1];
    if (previousSet && signature === previousSignature) {
      previousSet.count += 1;
      return;
    }
    groupedSets.push(nextSet);
    previousSignature = signature;
  });

  return {
    exerciseId: (sessionIndex + 1) * 1000 + exerciseIndex + 1,
    exerciseName: exercise.exercise,
    sets: groupedSets,
  };
}

function createDraftSessionBase(
  sessionId: string,
  name: string,
  exercises: ExerciseConfig[],
  index: number
): SessionDraft {
  return {
    clientId: `edit-${sessionId}-${index}`,
    sessionId,
    name,
    exercises,
    weekdays: [],
    fixedDay: index + 1,
    intervalEvery: 2,
    intervalStartOffsetDays: 0,
    intervalEndOffsetDays: null,
    restAfterDays: 1,
  };
}

function getRawSequenceItems(source: string): Array<{ sessionId: string; restAfterDays: number }> | null {
  let raw: unknown;
  try {
    raw = parseDocument(source);
  } catch {
    return null;
  }

  if (!isRecord(raw) || !isRecord(raw.sequence) || !Array.isArray(raw.sequence.items)) {
    return null;
  }

  const items: Array<{ sessionId: string; restAfterDays: number }> = [];
  for (const item of raw.sequence.items) {
    if (!isRecord(item) || typeof item.session_id !== "string") return null;
    items.push({
      sessionId: item.session_id,
      restAfterDays:
        typeof item.rest_after_days === "number" && item.rest_after_days >= 0
          ? item.rest_after_days
          : 0,
    });
  }

  return items;
}

export function deserializeFlatProgramDraftFromPsl(source: string): FlatProgramDraft | null {
  const timingMode = resolveTimingMode(source);
  if (!timingMode) return null;

  const compileResult = compilePslSource(source, {
    calendarOverride: buildCompileCalendarOverride(source),
  });
  if (!compileResult.valid || !compileResult.ast || !compileResult.compiled) return null;

  const { ast, compiled } = compileResult;
  if (ast.rounding !== undefined) return null;
  if (ast.exercise_aliases && Object.keys(ast.exercise_aliases).length > 0) return null;
  if (compiled.sessions.some((session) => !isSupportedSession(session, timingMode))) return null;
  if (
    compiled.sessions.some((session) =>
      session.exercises.some((exercise) => !isSupportedExercise(exercise, ast.units))
    )
  ) {
    return null;
  }

  const sessions: SessionDraft[] = [];

  if (timingMode === "sequence") {
    const rawItems = getRawSequenceItems(source);
    if (!rawItems || rawItems.length !== compiled.sessions.length) return null;

    const seen = new Set<string>();
    const sessionMap = new Map(compiled.sessions.map((session) => [session.id, session]));

    rawItems.forEach((item, index) => {
      if (seen.has(item.sessionId)) return;
      seen.add(item.sessionId);
      const session = sessionMap.get(item.sessionId);
      if (!session) return;
      sessions.push({
        ...createDraftSessionBase(
          session.id,
          session.name,
          session.exercises.map((exercise, exerciseIndex) =>
            toBuilderExercise(exercise, index, exerciseIndex, ast.units)
          ),
          index
        ),
        restAfterDays: item.restAfterDays,
      });
    });
    if (sessions.length !== rawItems.length) return null;
  } else {
    compiled.sessions.forEach((session, sessionIndex) => {
      const draftSession = createDraftSessionBase(
        session.id,
        session.name,
        session.exercises.map((exercise, exerciseIndex) =>
          toBuilderExercise(exercise, sessionIndex, exerciseIndex, ast.units)
        ),
        sessionIndex
      );

      if (timingMode === "weekdays" && session.schedule?.type === "weekdays") {
        draftSession.weekdays = [...session.schedule.days] as Weekday[];
      }

      if (timingMode === "fixed_day" && typeof session.day === "number") {
        draftSession.fixedDay = session.day;
      }

      if (timingMode === "interval_days" && session.schedule?.type === "interval_days") {
        draftSession.intervalEvery = session.schedule.every;
        draftSession.intervalStartOffsetDays = session.schedule.start_offset_days ?? 0;
        draftSession.intervalEndOffsetDays = session.schedule.end_offset_days ?? null;
      }

      sessions.push(draftSession);
    });
  }

  return {
    name: ast.metadata.name,
    description: ast.metadata.description,
    units: ast.units ?? "kg",
    timingMode,
    sequenceRepeat: timingMode === "sequence" ? introspectPslSource(source).sequenceRepeats : true,
    sessions,
  };
}
