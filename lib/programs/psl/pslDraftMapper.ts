import { parseDocument } from "program-specification-language";
import type {
  CompiledExercise,
  CompiledSession,
  CompiledSet,
  ExercisePrescription,
  IntensityTarget,
  ProgramAst,
  ProgressionRule,
  Session,
  SetPrescription,
  Weekday,
} from "program-specification-language";
import type {
  BlockDraft,
  BlockProgramDraft,
  BlockTimingMode,
  ExerciseConfig,
  FlatProgramDraft,
  FlatProgramTimingMode,
  ProgressionConfig,
  SessionDraft,
  SetConfig,
} from "./pslGenerator";
import { introspectPslSource } from "./pslIntrospection";
import { compilePslSource } from "./pslService";
import { getTemplateById } from "./pslTemplates";

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

function isBundledTemplateSource(source: string): boolean {
  let raw: unknown;
  try {
    raw = parseDocument(source);
  } catch {
    return false;
  }

  if (!isRecord(raw) || !isRecord(raw.metadata) || typeof raw.metadata.id !== "string") {
    return false;
  }

  const metadataId = raw.metadata.id.trim();
  if (!metadataId) {
    return false;
  }

  return (
    getTemplateById(metadataId) !== undefined ||
    getTemplateById(metadataId.toLowerCase()) !== undefined
  );
}

function isSupportedProgression(
  progression: ProgressionRule | undefined,
  units: ProgramAst["units"]
): progression is Extract<ProgressionRule, { type: "increment" | "weekly_increment" }> {
  if (!progression) return true;
  if (progression.type !== "increment" && progression.type !== "weekly_increment") {
    return false;
  }
  if (!units || !resolveBuilderProgressionIncrement(progression, units)) {
    return false;
  }
  if ("scope" in progression && progression.scope !== undefined) return false;
  if ("criteria" in progression && progression.criteria !== undefined) return false;

  const when = "when" in progression ? progression.when : undefined;
  if (when) {
    if (when.type !== "session_success") return false;
    if (when.equals === false) return false;
  }

  const cadence = "cadence" in progression ? progression.cadence : undefined;
  if (cadence) {
    if (cadence.type !== "sessions" && cadence.type !== "weeks") {
      return false;
    }
    if (cadence.type === "sessions") {
      if (cadence.every !== undefined && cadence.every !== 1) {
        return false;
      }
      if ("on_weekdays" in cadence && cadence.on_weekdays && cadence.on_weekdays.length > 0) {
        return false;
      }
    } else if (cadence.every !== undefined && cadence.every !== 1 && cadence.every !== 2) {
      return false;
    }
  }
  return true;
}

function normalizeRestSeconds(value: number | undefined): number | undefined {
  return typeof value === "number" && value > 0 ? value : undefined;
}

function isLoadProgressionBy(
  value: unknown
): value is { type: "load"; value: number; unit: "kg" | "lb" } {
  return (
    isRecord(value) &&
    value.type === "load" &&
    typeof value.value === "number" &&
    (value.unit === "kg" || value.unit === "lb")
  );
}

function resolveBuilderProgressionIncrement(
  progression: ProgressionRule,
  units: ProgramAst["units"]
): { by: number; unit: "kg" | "lb" } | null {
  if (!("by" in progression)) {
    return null;
  }

  if (typeof progression.by === "number") {
    if (!units) {
      return null;
    }

    return {
      by: progression.by,
      unit: units,
    };
  }

  const by = progression.by;
  if (isLoadProgressionBy(by)) {
    return {
      by: by.value,
      unit: by.unit,
    };
  }

  return null;
}

function toBuilderProgression(
  progression: ProgressionRule | undefined,
  units: ProgramAst["units"]
): ProgressionConfig | undefined {
  if (
    !progression ||
    (progression.type !== "increment" && progression.type !== "weekly_increment") ||
    !units
  ) {
    return undefined;
  }

  const resolvedIncrement = resolveBuilderProgressionIncrement(progression, units);
  if (!resolvedIncrement) {
    return undefined;
  }

  const cadenceRule = "cadence" in progression ? progression.cadence : undefined;
  const when = "when" in progression ? progression.when : undefined;
  let cadence: ProgressionConfig["cadence"] = "every session";
  if (progression.type === "weekly_increment" || cadenceRule?.type === "weeks") {
    cadence = cadenceRule?.every === 2 ? "every 2 weeks" : "every week";
  }

  return {
    type: cadence === "every session" ? "increment" : "weekly_increment",
    by: resolvedIncrement.by,
    unit: resolvedIncrement.unit,
    cadence,
    condition: when?.type === "session_success" ? "if success" : undefined,
  };
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

function isSupportedExercise(
  exercise: CompiledExercise,
  units: ProgramAst["units"],
  allowTemplateIdentity: boolean
): boolean {
  if (!allowTemplateIdentity && exercise.exercise_id !== undefined) return false;
  if (exercise.family !== undefined) return false;
  if (exercise.tags && exercise.tags.length > 0) return false;
  if (exercise.modifiers && Object.keys(exercise.modifiers).length > 0) return false;
  if (exercise.substitutions && exercise.substitutions.length > 0) return false;
  if (exercise.constraints !== undefined) return false;
  if (exercise.warmup !== undefined) return false;
  if (exercise.group_id !== undefined) return false;
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
  if (
    !progression ||
    (progression.type !== "increment" && progression.type !== "weekly_increment")
  ) {
    return "";
  }
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

  const restSeconds = normalizeRestSeconds(set.rest_seconds);
  if (restSeconds !== undefined) {
    builderSet.restSeconds = restSeconds;
  }

  if (set.intensity) {
    builderSet.intensity = set.intensity;
  }

  if (set.role && set.role !== "work") {
    builderSet.role = set.role;
  }

  const progression = toBuilderProgression(set.progression, units);
  if (progression) {
    builderSet.progression = progression;
  }

  return builderSet;
}

function toBuilderExercise(
  exercise: CompiledExercise,
  sessionIndex: number,
  exerciseIndex: number,
  units: ProgramAst["units"],
  defaultRestSeconds?: number
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
    restSeconds: normalizeRestSeconds(exercise.rest_seconds ?? defaultRestSeconds),
    sets: groupedSets,
  };
}

function toBuilderSetFromAst(
  set: SetPrescription,
  units: ProgramAst["units"]
): SetConfig {
  const builderSet: SetConfig = {
    count: set.count,
    reps: typeof set.reps === "number"
      ? set.reps
      : set.reps
        ? { min: set.reps.min, max: set.reps.max }
        : 5,
  };

  const restSeconds = normalizeRestSeconds(set.rest_seconds);
  if (restSeconds !== undefined) {
    builderSet.restSeconds = restSeconds;
  }

  if (set.intensity) {
    builderSet.intensity = set.intensity;
  }

  if (set.role && set.role !== "work") {
    builderSet.role = set.role;
  }

  const progression = toBuilderProgression(set.progression, units);
  if (progression) {
    builderSet.progression = progression;
  }

  return builderSet;
}

function toBuilderExerciseFromAst(
  exercise: ExercisePrescription,
  sessionIndex: number,
  exerciseIndex: number,
  units: ProgramAst["units"],
  defaultRestSeconds?: number
): ExerciseConfig {
  return {
    exerciseId: (sessionIndex + 1) * 1000 + exerciseIndex + 1,
    exerciseName: exercise.exercise,
    restSeconds: normalizeRestSeconds(exercise.rest_seconds ?? defaultRestSeconds),
    sets: exercise.sets.map((set) => toBuilderSetFromAst(set, units)),
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

function getScheduleType(value: unknown): "weekdays" | "interval_days" | "unknown" | null {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (normalized.includes("EVERY")) return "interval_days";
    if (
      normalized.includes("MON") ||
      normalized.includes("TUE") ||
      normalized.includes("WED") ||
      normalized.includes("THU") ||
      normalized.includes("FRI") ||
      normalized.includes("SAT") ||
      normalized.includes("SUN")
    ) {
      return "weekdays";
    }
    return "unknown";
  }

  if (isRecord(value)) {
    if (value.type === "weekdays" || value.type === "interval_days") {
      return value.type;
    }
    return "unknown";
  }

  return null;
}

function parseRawBlockDuration(
  value: unknown
): { durationValue: number; durationUnit: "weeks" | "days"; totalDays: number } | null {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    const weeksMatch = normalized.match(/^(?<n>\d+)\s*(?:w|week|weeks)$/);
    if (weeksMatch?.groups?.n) {
      const durationValue = Number(weeksMatch.groups.n);
      return { durationValue, durationUnit: "weeks", totalDays: durationValue * 7 };
    }
    const daysMatch = normalized.match(/^(?<n>\d+)\s*(?:d|day|days)$/);
    if (daysMatch?.groups?.n) {
      const durationValue = Number(daysMatch.groups.n);
      return { durationValue, durationUnit: "days", totalDays: durationValue };
    }
    return null;
  }

  if (isRecord(value)) {
    if (
      (value.type === "weeks" || value.type === "days") &&
      typeof value.value === "number" &&
      Number.isInteger(value.value) &&
      value.value >= 1
    ) {
      return {
        durationValue: value.value,
        durationUnit: value.type,
        totalDays: value.type === "weeks" ? value.value * 7 : value.value,
      };
    }
  }

  return null;
}

function resolveBlockTimingMode(rawSessions: unknown): BlockTimingMode | null {
  if (!Array.isArray(rawSessions) || rawSessions.length === 0) {
    return "weekdays";
  }

  let detected: BlockTimingMode | null = null;

  for (const rawSession of rawSessions) {
    if (!isRecord(rawSession)) {
      return null;
    }

    let current: BlockTimingMode | null = null;
    if (typeof rawSession.day === "number") {
      current = "fixed_day";
    } else if (rawSession.schedule !== undefined) {
      const scheduleType = getScheduleType(rawSession.schedule);
      if (scheduleType === "weekdays") {
        current = "weekdays";
      } else if (scheduleType === "interval_days") {
        current = "interval_days";
      } else {
        return null;
      }
    }

    if (!current) {
      return null;
    }

    if (detected && detected !== current) {
      return null;
    }

    detected = current;
  }

  return detected;
}

function isSupportedAstSet(set: SetPrescription, units: ProgramAst["units"]): boolean {
  if (!set.reps) return false;
  if (!isSupportedIntensity(set.intensity)) return false;
  if (!isSupportedProgression(set.progression, units)) return false;
  return (
    set.work_type === undefined &&
    set.time_mode === undefined &&
    set.duration_seconds === undefined &&
    set.interval_seconds === undefined &&
    set.target_total_reps === undefined &&
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

function isSupportedAstExercise(
  exercise: ExercisePrescription,
  units: ProgramAst["units"],
  allowTemplateIdentity: boolean
): boolean {
  if (!allowTemplateIdentity && exercise.exercise_id !== undefined) return false;
  if (exercise.family !== undefined) return false;
  if (exercise.tags && exercise.tags.length > 0) return false;
  if (exercise.modifiers && Object.keys(exercise.modifiers).length > 0) return false;
  if (exercise.substitutions && exercise.substitutions.length > 0) return false;
  if (exercise.constraints !== undefined) return false;
  if (exercise.warmup !== undefined) return false;
  if (exercise.group_id !== undefined) return false;
  if (exercise.rest_before_seconds !== undefined) return false;
  if (exercise.rest_after_seconds !== undefined) return false;
  if (exercise.tempo !== undefined) return false;
  if (exercise.pause_seconds !== undefined) return false;
  if (exercise.eccentric_seconds !== undefined) return false;
  if (exercise.rounding !== undefined) return false;
  if (exercise.units !== undefined && exercise.units !== units) return false;
  return exercise.sets.every((set) => isSupportedAstSet(set, units));
}

function isSupportedBlockSession(
  session: Session,
  mode: BlockTimingMode
): boolean {
  if (session.groups && session.groups.length > 0) return false;
  if (session.constraints !== undefined) return false;

  if (mode === "weekdays") {
    return !!session.schedule && session.schedule.type === "weekdays";
  }

  if (mode === "fixed_day") {
    return typeof session.day === "number" && session.schedule === undefined;
  }

  return !!session.schedule && session.schedule.type === "interval_days";
}

function getRawSequenceItems(source: string): { sessionId: string; restAfterDays: number }[] | null {
  let raw: unknown;
  try {
    raw = parseDocument(source);
  } catch {
    return null;
  }

  if (!isRecord(raw) || !isRecord(raw.sequence) || !Array.isArray(raw.sequence.items)) {
    return null;
  }

  const items: { sessionId: string; restAfterDays: number }[] = [];
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
  const allowTemplateIdentity = isBundledTemplateSource(source);

  const compileResult = compilePslSource(source, {
    calendarOverride: buildCompileCalendarOverride(source),
  });
  if (!compileResult.valid || !compileResult.ast || !compileResult.compiled) return null;

  const { ast, compiled } = compileResult;
  if (ast.rounding !== undefined) return null;
  if (
    !allowTemplateIdentity &&
    ast.exercise_aliases &&
    Object.keys(ast.exercise_aliases).length > 0
  ) {
    return null;
  }
  if (compiled.sessions.some((session) => !isSupportedSession(session, timingMode))) return null;
  if (
    compiled.sessions.some((session) =>
      session.exercises.some((exercise) =>
        !isSupportedExercise(exercise, ast.units, allowTemplateIdentity)
      )
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
            toBuilderExercise(
              exercise,
              index,
              exerciseIndex,
              ast.units,
              session.rest_default_seconds
            )
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
          toBuilderExercise(
            exercise,
            sessionIndex,
            exerciseIndex,
            ast.units,
            session.rest_default_seconds
          )
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

type RawBlockMeta = {
  id: string;
  name: string;
  timingMode: BlockTimingMode;
  durationValue: number;
  durationUnit: "weeks" | "days";
  totalDays: number;
  deload: boolean;
  sessionIds: string[];
};

function getRawBlockMeta(source: string): RawBlockMeta[] | null {
  let raw: unknown;
  try {
    raw = parseDocument(source);
  } catch {
    return null;
  }

  if (!isRecord(raw) || !Array.isArray(raw.blocks)) {
    return null;
  }

  const blocks: RawBlockMeta[] = [];
  for (const block of raw.blocks) {
    if (!isRecord(block) || typeof block.id !== "string") {
      return null;
    }

    const parsedDuration = parseRawBlockDuration(block.duration);
    if (!parsedDuration) {
      return null;
    }

    const timingMode = resolveBlockTimingMode(block.sessions);
    if (!timingMode) {
      return null;
    }

    const sessionIds = Array.isArray(block.sessions)
      ? block.sessions
          .map((session) =>
            isRecord(session) && typeof session.id === "string" ? session.id : null
          )
          .filter((value): value is string => value !== null)
      : [];

    blocks.push({
      id: block.id,
      name: typeof block.name === "string" ? block.name : block.id,
      timingMode,
      durationValue: parsedDuration.durationValue,
      durationUnit: parsedDuration.durationUnit,
      totalDays: parsedDuration.totalDays,
      deload: block.deload === true,
      sessionIds,
    });
  }

  return blocks;
}

export function deserializeBlockProgramDraftFromPsl(
  source: string
): BlockProgramDraft | null {
  const introspection = introspectPslSource(source);
  if (!introspection.ok || !introspection.hasBlocks) {
    return null;
  }
  const allowTemplateIdentity = isBundledTemplateSource(source);

  const rawBlocks = getRawBlockMeta(source);
  if (!rawBlocks) {
    return null;
  }

  const compileResult = compilePslSource(source, {
    calendarOverride: buildCompileCalendarOverride(source),
  });
  if (!compileResult.valid || !compileResult.ast) {
    return null;
  }

  const { ast } = compileResult;
  if (ast.rounding !== undefined) return null;
  if (
    !allowTemplateIdentity &&
    ast.exercise_aliases &&
    Object.keys(ast.exercise_aliases).length > 0
  ) {
    return null;
  }

  const sessionsByBlock = new Map<string, Session[]>();
  ast.sessions.forEach((session) => {
    if (!session.block_id) {
      return;
    }

    const existing = sessionsByBlock.get(session.block_id);
    if (existing) {
      existing.push(session);
      return;
    }

    sessionsByBlock.set(session.block_id, [session]);
  });

  const blocks: BlockDraft[] = [];
  let blockStartOffsetDays = 0;

  for (let blockIndex = 0; blockIndex < rawBlocks.length; blockIndex += 1) {
    const rawBlock = rawBlocks[blockIndex];
    const blockSessions = sessionsByBlock.get(rawBlock.id) ?? [];
    const sessionsById = new Map<string, Session>(
      blockSessions.map((session) => [
        session.id.startsWith(`${rawBlock.id}.`)
          ? session.id.slice(rawBlock.id.length + 1)
          : session.id,
        session,
      ])
    );

    const sessions: SessionDraft[] = [];

    for (let sessionIndex = 0; sessionIndex < rawBlock.sessionIds.length; sessionIndex += 1) {
      const rawSessionId = rawBlock.sessionIds[sessionIndex];
      const session = sessionsById.get(rawSessionId);
      if (!session || !isSupportedBlockSession(session, rawBlock.timingMode)) {
        return null;
      }

      if (
        session.exercises.some((exercise) =>
          !isSupportedAstExercise(exercise, ast.units, allowTemplateIdentity)
        )
      ) {
        return null;
      }

      const draftSession = createDraftSessionBase(
        rawSessionId,
        session.name,
        session.exercises.map((exercise, exerciseIndex) =>
          toBuilderExerciseFromAst(
            exercise,
            sessionIndex,
            exerciseIndex,
            ast.units,
            session.rest_default_seconds
          )
        ),
        sessionIndex
      );

      if (rawBlock.timingMode === "weekdays" && session.schedule?.type === "weekdays") {
        draftSession.weekdays = [...session.schedule.days] as Weekday[];
      }

      if (rawBlock.timingMode === "fixed_day" && typeof session.day === "number") {
        draftSession.fixedDay = Math.max(1, session.day - blockStartOffsetDays);
      }

      if (rawBlock.timingMode === "interval_days" && session.schedule?.type === "interval_days") {
        draftSession.intervalEvery = session.schedule.every;
        draftSession.intervalStartOffsetDays = Math.max(
          0,
          (session.schedule.start_offset_days ?? blockStartOffsetDays) - blockStartOffsetDays
        );
        draftSession.intervalEndOffsetDays =
          session.schedule.end_offset_days !== undefined
            ? Math.max(0, session.schedule.end_offset_days - blockStartOffsetDays)
            : null;
      }

      sessions.push(draftSession);
    }

    blocks.push({
      clientId: `edit-${rawBlock.id}-${blockIndex}`,
      blockId: rawBlock.id,
      name: rawBlock.name,
      durationValue: rawBlock.durationValue,
      durationUnit: rawBlock.durationUnit,
      deload: rawBlock.deload,
      timingMode: rawBlock.timingMode,
      sessions,
    });

    blockStartOffsetDays += rawBlock.totalDays;
  }

  return {
    name: ast.metadata.name,
    description: ast.metadata.description,
    units: ast.units ?? "kg",
    blocks,
  };
}
