import {
  parseDocument,
  validateAst,
  compileProgram,
  materialize,
} from "program-specification-language";
import type {
  ProgramAst,
  CompiledProgram,
  MaterializedSession,
  CompiledExercise,
  CompiledSet,
  ValidationResult,
  Diagnostic,
} from "program-specification-language";

export interface PslCompileResult {
  valid: boolean;
  diagnostics: Diagnostic[];
  ast?: ProgramAst;
  compiled?: CompiledProgram;
  materialized?: MaterializedSession[];
}

export function compilePslSource(source: string): PslCompileResult {
  let raw: unknown;
  try {
    raw = parseDocument(source);
  } catch (e) {
    return {
      valid: false,
      diagnostics: [{
        path: "",
        message: `YAML parse error: ${e instanceof Error ? e.message : String(e)}`,
        severity: "error",
      }],
    };
  }

  const validation: ValidationResult<ProgramAst> = validateAst(raw);
  if (!validation.valid || !validation.value) {
    return {
      valid: false,
      diagnostics: validation.diagnostics,
    };
  }

  const ast = validation.value;
  const compiled = compileProgram(ast);
  const materialized = materialize(compiled);

  return {
    valid: true,
    diagnostics: validation.diagnostics,
    ast,
    compiled,
    materialized,
  };
}

export interface CalendarEntry {
  pslSessionId: string;
  sessionName: string;
  dateIso: string;
  sequence: number;
  exercises: CalendarExerciseEntry[];
}

export interface CalendarExerciseEntry {
  exerciseName: string;
  orderIndex: number;
  sets: CalendarSetEntry[];
}

export interface CalendarSetEntry {
  setIndex: number;
  prescribedReps: string | null;
  prescribedIntensityJson: string | null;
  prescribedRole: string | null;
}

function formatRepsForStorage(reps: CompiledSet["reps"]): string | null {
  if (!reps) return null;
  if (reps.min === reps.max) return String(reps.min);
  return `${reps.min}-${reps.max}`;
}

export function extractCalendarEntries(materialized: MaterializedSession[]): CalendarEntry[] {
  return materialized.map((session, idx) => ({
    pslSessionId: session.id,
    sessionName: session.name,
    dateIso: session.date_iso ?? `day-${session.day ?? idx + 1}`,
    sequence: session.sequence,
    exercises: session.exercises.map((ex: CompiledExercise, exIdx: number) => ({
      exerciseName: ex.exercise,
      orderIndex: exIdx,
      sets: ex.sets.map((set: CompiledSet) => ({
        setIndex: set.index,
        prescribedReps: formatRepsForStorage(set.reps),
        prescribedIntensityJson: set.intensity ? JSON.stringify(set.intensity) : null,
        prescribedRole: set.role ?? null,
      })),
    })),
  }));
}

export function getDateIsoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDateForDisplay(dateIso: string): string {
  const today = getDateIsoToday();
  if (dateIso === today) return "Today";

  const d = new Date(dateIso + "T00:00:00");
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
  };
  return d.toLocaleDateString(undefined, options);
}
