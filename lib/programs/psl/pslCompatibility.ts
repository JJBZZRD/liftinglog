import type { ProgramAst, Session, ExercisePrescription, SetPrescription } from "program-specification-language";

export type PslCompatibilityWarning = {
  code:
    | "time_prescriptions"
    | "non_load_intensity"
    | "load_range_intensity"
    | "role_based_intensity"
    | "progression_auto_adjust"
    | "constraints"
    | "repeat_until"
    | "warmups"
    | "substitutions"
    | "groups"
    | "tempo";
  message: string;
  paths: string[];
};

function addWarning(
  warnings: PslCompatibilityWarning[],
  warning: PslCompatibilityWarning
) {
  const existing = warnings.find((w) => w.code === warning.code);
  if (existing) {
    existing.paths.push(...warning.paths);
    return;
  }
  warnings.push(warning);
}

export function getPslCompatibilityWarnings(ast: ProgramAst | undefined): PslCompatibilityWarning[] {
  if (!ast) return [];

  const warnings: PslCompatibilityWarning[] = [];

  ast.sessions.forEach((session: Session, sIdx: number) => {
    const sessionPath = `$.sessions[${sIdx}]`;

    if (session.groups && session.groups.length > 0) {
      addWarning(warnings, {
        code: "groups",
        message: "Session groups (superset/circuit/giant_set) are not fully represented in the current logging UI.",
        paths: [`${sessionPath}.groups`],
      });
    }

    if (session.constraints) {
      addWarning(warnings, {
        code: "constraints",
        message: "Constraints are validated/compiled but are not currently enforced or surfaced in the logging UI.",
        paths: [`${sessionPath}.constraints`],
      });
    }

    session.exercises.forEach((exercise: ExercisePrescription, eIdx: number) => {
      const exPath = `${sessionPath}.exercises[${eIdx}]`;

      if (exercise.group_id) {
        addWarning(warnings, {
          code: "groups",
          message: "Exercise group_id (superset/circuit/giant_set) is not fully represented in the current logging UI.",
          paths: [`${exPath}.group_id`],
        });
      }

      if (exercise.warmup) {
        addWarning(warnings, {
          code: "warmups",
          message: "Warmup prescriptions are not currently surfaced in the guided UI or logging UI.",
          paths: [`${exPath}.warmup`],
        });
      }

      if (exercise.substitutions && exercise.substitutions.length > 0) {
        addWarning(warnings, {
          code: "substitutions",
          message: "Exercise substitutions are stored in PSL but selection is not handled in the current UI/runtime.",
          paths: [`${exPath}.substitutions`],
        });
      }

      if (exercise.constraints) {
        addWarning(warnings, {
          code: "constraints",
          message: "Exercise-level constraints are validated/compiled but are not currently enforced or surfaced in the logging UI.",
          paths: [`${exPath}.constraints`],
        });
      }

      if (exercise.tempo || exercise.pause_seconds !== undefined || exercise.eccentric_seconds !== undefined) {
        addWarning(warnings, {
          code: "tempo",
          message: "Tempo/execution metadata is not currently surfaced in the logging UI.",
          paths: [
            ...(exercise.tempo ? [`${exPath}.tempo`] : []),
            ...(exercise.pause_seconds !== undefined ? [`${exPath}.pause_seconds`] : []),
            ...(exercise.eccentric_seconds !== undefined ? [`${exPath}.eccentric_seconds`] : []),
          ],
        });
      }

      exercise.sets.forEach((set: SetPrescription, setIdx: number) => {
        const setPath = `${exPath}.sets[${setIdx}]`;

        if (set.work_type === "time" || set.duration_seconds !== undefined || set.time_mode !== undefined) {
          addWarning(warnings, {
            code: "time_prescriptions",
            message: "Time-based prescriptions (AMRAP/EMOM/for_time/density) are not fully supported in the logging UI.",
            paths: [setPath],
          });
        }

        if (set.intensity) {
          if (set.intensity.type === "load_range") {
            addWarning(warnings, {
              code: "load_range_intensity",
              message: "Load ranges are not fully supported by the current logging inputs (which expect a single numeric load).",
              paths: [`${setPath}.intensity`],
            });
          } else if (set.intensity.type === "percent_of_set" || set.intensity.type === "load_delta_from_set") {
            addWarning(warnings, {
              code: "role_based_intensity",
              message: "Role-referenced intensities are not currently realized in the logging UI/runtime.",
              paths: [`${setPath}.intensity`],
            });
          } else if (set.intensity.type !== "load") {
            addWarning(warnings, {
              code: "non_load_intensity",
              message: "Non-load intensity targets (e.g. %1RM, RPE, RIR) are not fully supported by the current logging inputs.",
              paths: [`${setPath}.intensity`],
            });
          }
        }

        if (set.progression?.type === "auto_adjust") {
          addWarning(warnings, {
            code: "progression_auto_adjust",
            message: "auto_adjust progression rules are validated/compiled but not executed in the current runtime.",
            paths: [`${setPath}.progression`],
          });
        }

        if (set.constraints) {
          addWarning(warnings, {
            code: "constraints",
            message: "Set-level constraints are validated/compiled but are not currently enforced or surfaced in the logging UI.",
            paths: [`${setPath}.constraints`],
          });
        }

        if (set.repeat) {
          addWarning(warnings, {
            code: "repeat_until",
            message: "Repeat/until termination specs are not currently supported in the guided UI or logging UI.",
            paths: [`${setPath}.repeat`],
          });
        }

        if (set.tempo || set.pause_seconds !== undefined || set.eccentric_seconds !== undefined) {
          addWarning(warnings, {
            code: "tempo",
            message: "Tempo/execution metadata is not currently surfaced in the logging UI.",
            paths: [
              ...(set.tempo ? [`${setPath}.tempo`] : []),
              ...(set.pause_seconds !== undefined ? [`${setPath}.pause_seconds`] : []),
              ...(set.eccentric_seconds !== undefined ? [`${setPath}.eccentric_seconds`] : []),
            ],
          });
        }
      });
    });
  });

  return warnings.map((w) => ({ ...w, paths: Array.from(new Set(w.paths)) }));
}

