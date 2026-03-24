import { createId } from "program-specification-language";
import type {
  IntensityTarget,
  LoadDelta,
  LoadUnit,
  ProgramAst,
  ProgressionRule,
  Session,
  SessionSchedule,
  SetPrescription,
} from "program-specification-language";
import { introspectPslSource } from "./pslIntrospection";
import { compilePslSource } from "./pslService";
import {
  buildTemplateExerciseAliasesMap,
  buildTemplateExerciseRequirement,
  type TemplateExerciseRequirement,
} from "./templateExercises";
import {
  convertWeightFromKg,
  convertWeightToKg,
} from "../../utils/units";

export type TemplateSequenceOverride = {
  repeat: boolean;
  items: {
    sessionId: string;
    restAfterDays: number;
  }[];
};

export type TemplateSourceBuildResult = {
  pslSource: string;
  exerciseRequirements: TemplateExerciseRequirement[];
};

const TEMPLATE_PREVIEW_START_DATE = "2026-01-05";
const TEMPLATE_PREVIEW_END_DATE = "2026-03-30";
const STANDARD_INCREMENT_BY_UNIT: Record<LoadUnit, number> = {
  kg: 2.5,
  lb: 5,
};

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function roundTo(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function roundToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || increment <= 0) {
    return roundTo(value);
  }

  return roundTo(Math.round(value / increment) * increment);
}

function convertProgramLoadValue(
  value: number,
  fromUnit: LoadUnit,
  targetUnit: LoadUnit
): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  if (fromUnit === targetUnit) {
    return roundTo(value);
  }

  const converted = convertWeightFromKg(
    convertWeightToKg(value, fromUnit),
    targetUnit
  );

  return roundToIncrement(converted, STANDARD_INCREMENT_BY_UNIT[targetUnit]);
}

function convertLoadDelta(
  load: LoadDelta,
  targetUnit: LoadUnit
): LoadDelta {
  return {
    value: convertProgramLoadValue(load.value, load.unit, targetUnit),
    unit: targetUnit,
  };
}

function convertIntensityTarget(
  intensity: IntensityTarget,
  programUnits: LoadUnit | undefined,
  targetUnit: LoadUnit
): IntensityTarget {
  switch (intensity.type) {
    case "load":
      return {
        ...intensity,
        value: convertProgramLoadValue(intensity.value, intensity.unit, targetUnit),
        unit: targetUnit,
      };
    case "load_range": {
      const convertedMin = convertProgramLoadValue(
        intensity.min,
        intensity.unit,
        targetUnit
      );
      const convertedMax = convertProgramLoadValue(
        intensity.max,
        intensity.unit,
        targetUnit
      );
      return {
        ...intensity,
        min: Math.min(convertedMin, convertedMax),
        max: Math.max(convertedMin, convertedMax),
        unit: targetUnit,
      };
    }
    case "load_delta_from_set":
      return {
        ...intensity,
        value: convertProgramLoadValue(intensity.value, intensity.unit, targetUnit),
        unit: targetUnit,
      };
    case "percent_1rm":
      return {
        ...intensity,
        ...(intensity.plus_load
          ? { plus_load: convertLoadDelta(intensity.plus_load, targetUnit) }
          : {}),
      };
    case "percent_of_set":
    case "rpe":
    case "rir":
    default:
      return { ...intensity };
  }
}

function convertProgressionRule(
  progression: ProgressionRule | undefined,
  programUnits: LoadUnit | undefined,
  targetUnit: LoadUnit
): ProgressionRule | undefined {
  if (!progression) {
    return progression;
  }

  if (progression.type === "auto_adjust") {
    return {
      ...progression,
      actions: progression.actions.map((action) => {
        if (action.type !== "reduce_load") {
          return { ...action };
        }

        return {
          ...action,
          by:
            typeof action.by === "number"
              ? programUnits
                ? convertProgramLoadValue(action.by, programUnits, targetUnit)
                : action.by
              : convertLoadDelta(action.by, targetUnit),
        };
      }),
    };
  }

  return {
    ...progression,
    by:
      typeof progression.by === "number"
        ? programUnits
          ? convertProgramLoadValue(progression.by, programUnits, targetUnit)
          : progression.by
        : typeof progression.by === "object" &&
            progression.by !== null &&
            "type" in progression.by &&
            progression.by.type === "load"
          ? {
              ...progression.by,
              value: convertProgramLoadValue(
                progression.by.value,
                progression.by.unit,
                targetUnit
              ),
              unit: targetUnit,
            }
          : progression.by,
  };
}

function convertSetPrescription(
  set: SetPrescription,
  programUnits: LoadUnit | undefined,
  targetUnit: LoadUnit
): SetPrescription {
  return {
    ...set,
    ...(set.intensity
      ? {
          intensity: convertIntensityTarget(
            set.intensity,
            programUnits,
            targetUnit
          ),
        }
      : {}),
    progression: convertProgressionRule(
      set.progression,
      programUnits,
      targetUnit
    ),
  };
}

function convertProgramAstUnits(
  ast: ProgramAst,
  targetUnit: LoadUnit
): ProgramAst {
  const currentUnit = ast.units;
  if (!currentUnit || currentUnit === targetUnit) {
    return {
      ...ast,
      units: targetUnit,
    };
  }

  return {
    ...ast,
    units: targetUnit,
    sessions: ast.sessions.map((session) => ({
      ...session,
      exercises: session.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) =>
          convertSetPrescription(set, currentUnit, targetUnit)
        ),
      })),
    })),
  };
}

function getTemplateCalendarOverride(source: string) {
  const introspection = introspectPslSource(source);
  if (!introspection.ok || introspection.requiresEndDateForActivation) {
    return {
      start_date: TEMPLATE_PREVIEW_START_DATE,
      end_date: TEMPLATE_PREVIEW_END_DATE,
    };
  }

  return {
    start_date: TEMPLATE_PREVIEW_START_DATE,
  };
}

function durationToString(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  if (remainderSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m${remainderSeconds}s`;
}

function repsToString(reps: SetPrescription["reps"]): string {
  if (typeof reps === "number") return String(reps);
  if (reps) return `${reps.min}-${reps.max}`;
  return "?";
}

function intensityToShorthand(intensity: IntensityTarget): string {
  switch (intensity.type) {
    case "percent_1rm": {
      let value = `@${intensity.value}%`;
      if (intensity.plus_load) {
        const sign = intensity.plus_load.value >= 0 ? "+" : "-";
        value += `${sign}${Math.abs(intensity.plus_load.value)}${intensity.plus_load.unit}`;
      }
      return value;
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
      return `@${sign}${intensity.value}${intensity.unit} from ${intensity.role}`;
    }
    default:
      return "";
  }
}

function progressionToShorthand(
  progression: ProgressionRule | undefined,
  defaultUnit: ProgramAst["units"]
): string | null {
  if (!progression || progression.type === "auto_adjust") {
    return null;
  }

  let byText: string | null = null;
  if (typeof progression.by === "number") {
    if (!defaultUnit) return null;
    const sign = progression.by >= 0 ? "+" : "";
    byText = `${sign}${progression.by}${defaultUnit}`;
  } else if (
    typeof progression.by === "object" &&
    progression.by !== null &&
    "type" in progression.by &&
    progression.by.type === "load"
  ) {
    const sign = progression.by.value >= 0 ? "+" : "";
    byText = `${sign}${progression.by.value}${progression.by.unit}`;
  }

  if (!byText) return null;

  let cadenceText = "";
  if (progression.cadence?.type === "weeks") {
    cadenceText = progression.cadence.every && progression.cadence.every > 1
      ? `every ${progression.cadence.every} weeks`
      : "every week";
  } else if (progression.cadence?.type === "sessions") {
    if (
      progression.cadence.on_weekdays &&
      progression.cadence.on_weekdays.length > 0
    ) {
      return null;
    }
    cadenceText = progression.cadence.every && progression.cadence.every > 1
      ? `every ${progression.cadence.every} sessions`
      : "every session";
  } else {
    cadenceText = progression.type === "weekly_increment" ? "every week" : "every session";
  }

  let conditionText = "";
  if (progression.when?.type === "session_success") {
    conditionText = progression.when.equals === false ? " if not success" : " if success";
  } else if (
    progression.when?.type === "metric_vs_target" &&
    progression.when.target === "value"
  ) {
    conditionText = ` if ${progression.when.metric}${progression.when.op}target`;
  }

  return `${byText} ${cadenceText}${conditionText}`;
}

function setToShorthand(
  set: SetPrescription,
  defaultUnit: ProgramAst["units"]
): string {
  let value = `${set.count}x${repsToString(set.reps)}`;

  if (set.intensity) {
    value += ` ${intensityToShorthand(set.intensity)}`;
  }

  if (set.role && set.role !== "work") {
    value += ` role ${set.role}`;
  }

  if (typeof set.rest_seconds === "number" && set.rest_seconds > 0) {
    value += ` rest ${durationToString(set.rest_seconds)}`;
  }

  const progression = progressionToShorthand(set.progression, defaultUnit);
  if (progression) {
    value += `; ${progression}`;
  }

  return value;
}

function renderSchedule(
  lines: string[],
  schedule: SessionSchedule,
  indent: string
) {
  lines.push(`${indent}schedule:`);
  lines.push(`${indent}  type: ${schedule.type}`);

  if (schedule.type === "weekdays") {
    lines.push(`${indent}  days: [${schedule.days.join(", ")}]`);
  } else {
    lines.push(`${indent}  every: ${schedule.every}`);
  }

  if (schedule.start_offset_days !== undefined) {
    lines.push(`${indent}  start_offset_days: ${schedule.start_offset_days}`);
  }

  if (schedule.end_offset_days !== undefined) {
    lines.push(`${indent}  end_offset_days: ${schedule.end_offset_days}`);
  }
}

function normalizeSequenceOverride(
  sessions: Session[],
  sequenceOverride: TemplateSequenceOverride | undefined
): TemplateSequenceOverride | null {
  if (!sequenceOverride) return null;

  const sessionIds = new Set(sessions.map((session) => session.id));
  if (sequenceOverride.items.length !== sessions.length) {
    return null;
  }

  const seen = new Set<string>();
  for (const item of sequenceOverride.items) {
    if (!sessionIds.has(item.sessionId) || seen.has(item.sessionId)) {
      return null;
    }
    seen.add(item.sessionId);
  }

  return sequenceOverride;
}

export function buildTemplatePslSource(params: {
  name: string;
  rawPslSource: string;
  sequenceOverride?: TemplateSequenceOverride;
  exerciseNameOverrides?: Record<string, string>;
  programNameOverride?: string;
  programDescriptionOverride?: string;
  exerciseRequirementOverrides?: Record<
    string,
    Partial<TemplateExerciseRequirement>
  >;
  targetUnit?: LoadUnit;
}): TemplateSourceBuildResult {
  const compileResult = compilePslSource(params.rawPslSource, {
    calendarOverride: getTemplateCalendarOverride(params.rawPslSource),
  });

  if (!compileResult.valid || !compileResult.ast) {
    const errorMessage = compileResult.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.message)
      .join("\n");
    throw new Error(
      errorMessage || `Failed to build template source for ${params.name}.`
    );
  }

  const ast =
    params.targetUnit && compileResult.ast.units && compileResult.ast.units !== params.targetUnit
      ? convertProgramAstUnits(compileResult.ast, params.targetUnit)
      : params.targetUnit && !compileResult.ast.units
        ? { ...compileResult.ast, units: params.targetUnit }
        : compileResult.ast;
  const sequenceOverride = normalizeSequenceOverride(
    ast.sessions,
    params.sequenceOverride
  );
  const exerciseRequirementsMap = new Map<string, TemplateExerciseRequirement>();
  const applyRequirementOverrides = (
    requirement: TemplateExerciseRequirement
  ): TemplateExerciseRequirement => ({
    ...requirement,
    ...(params.exerciseRequirementOverrides?.[requirement.exerciseId] ?? {}),
  });

  ast.sessions.forEach((session) => {
    session.exercises.forEach((exercise) => {
      const requirement = applyRequirementOverrides(
        buildTemplateExerciseRequirement(exercise.exercise, exercise.aliases ?? [])
      );
      if (!exerciseRequirementsMap.has(requirement.exerciseId)) {
        exerciseRequirementsMap.set(requirement.exerciseId, requirement);
      }
    });
  });

  const exerciseRequirements = [...exerciseRequirementsMap.values()];
  const activeExerciseNamesById = params.exerciseNameOverrides ?? {};
  const exerciseAliases = buildTemplateExerciseAliasesMap(
    exerciseRequirements,
    activeExerciseNamesById
  );
  const resolvedProgramName =
    params.programNameOverride?.trim() || ast.metadata.name || params.name;
  const resolvedProgramDescription =
    params.programDescriptionOverride?.trim() ||
    ast.metadata.description?.trim() ||
    "";
  const lines: string[] = [];

  lines.push('language_version: "0.3"');
  lines.push("metadata:");
  lines.push(`  id: ${ast.metadata.id || createId("prog", params.name)}`);
  lines.push(`  name: ${yamlString(resolvedProgramName)}`);
  if (resolvedProgramDescription) {
    lines.push(`  description: ${yamlString(resolvedProgramDescription)}`);
  }
  if (ast.metadata.author?.trim()) {
    lines.push(`  author: ${yamlString(ast.metadata.author.trim())}`);
  }

  if (ast.units) {
    lines.push(`units: ${ast.units}`);
  }

  if (Object.keys(exerciseAliases).length > 0) {
    lines.push("exercise_aliases:");
    Object.entries(exerciseAliases)
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([alias, exerciseId]) => {
        lines.push(`  ${yamlString(alias)}: ${exerciseId}`);
      });
  }

  lines.push("sessions:");
  ast.sessions.forEach((session) => {
    lines.push(`  - id: ${session.id}`);
    lines.push(`    name: ${yamlString(session.name)}`);

    if (session.slot !== undefined) {
      lines.push(
        `    slot: ${
          typeof session.slot === "string" ? session.slot : session.slot
        }`
      );
    }

    if (!sequenceOverride) {
      if (typeof session.day === "number") {
        lines.push(`    day: ${session.day}`);
      } else if (session.schedule) {
        renderSchedule(lines, session.schedule, "    ");
      }
    }

    if (
      typeof session.rest_default_seconds === "number" &&
      session.rest_default_seconds > 0
    ) {
      lines.push(
        `    rest_default: ${yamlString(durationToString(session.rest_default_seconds))}`
      );
    }

    if (session.exercises.length === 0) {
      lines.push("    exercises: []");
      return;
    }

    lines.push("    exercises:");
    session.exercises.forEach((exercise) => {
      const requirement = applyRequirementOverrides(
        buildTemplateExerciseRequirement(exercise.exercise, exercise.aliases ?? [])
      );
      const activeExerciseName =
        activeExerciseNamesById[requirement.exerciseId]?.trim() ||
        requirement.canonicalName;
      const aliases = [...requirement.aliases];
      if (
        activeExerciseName !== requirement.canonicalName &&
        requirement.includeCanonicalAliasOnOverride !== false
      ) {
        aliases.unshift(requirement.canonicalName);
      }
      const dedupedAliases = Array.from(
        new Set(
          aliases.filter(
            (alias) =>
              alias.trim().length > 0 &&
              alias.trim().toLowerCase() !== activeExerciseName.trim().toLowerCase()
          )
        )
      );

      lines.push(`      - exercise: ${yamlString(activeExerciseName)}`);
      lines.push(`        exercise_id: ${requirement.exerciseId}`);
      if (dedupedAliases.length > 0) {
        lines.push(
          `        aliases: [${dedupedAliases
            .map((alias) => yamlString(alias))
            .join(", ")}]`
        );
      }
      if (
        typeof exercise.rest_seconds === "number" &&
        exercise.rest_seconds > 0
      ) {
        lines.push(
          `        rest: ${yamlString(durationToString(exercise.rest_seconds))}`
        );
      }
      lines.push("        sets:");
      exercise.sets.forEach((set) => {
        lines.push(
          `          - ${yamlString(setToShorthand(set, ast.units))}`
        );
      });
    });
  });

  if (sequenceOverride) {
    lines.push("sequence:");
    lines.push(`  repeat: ${sequenceOverride.repeat ? "true" : "false"}`);
    lines.push("  items:");
    sequenceOverride.items.forEach((item) => {
      lines.push(`    - session_id: ${item.sessionId}`);
      lines.push(`      rest_after_days: ${Math.max(0, item.restAfterDays)}`);
    });
  }

  return {
    pslSource: `${lines.join("\n")}\n`,
    exerciseRequirements,
  };
}
