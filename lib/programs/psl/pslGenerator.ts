import type { Weekday, IntensityTarget, ProgressionRule } from "program-specification-language";
import { createId } from "program-specification-language";

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
  exerciseName: string;
  exerciseId?: string;
  sets: SetConfig[];
  restSeconds?: number;
}

export interface DayConfig {
  day: Weekday;
  exercises: ExerciseConfig[];
}

export interface ProgramConfig {
  name: string;
  description?: string;
  units?: "kg" | "lb";
  startDate?: string;
  endDate?: string;
  days: DayConfig[];
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
      return `@${intensity.value < 0 ? "" : ""}${intensity.value}% of ${intensity.role}`;
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
    if (set.restSeconds >= 60 && set.restSeconds % 60 === 0) {
      s += ` rest ${set.restSeconds / 60}m`;
    } else {
      s += ` rest ${set.restSeconds}s`;
    }
  }

  if (set.progression) {
    s += `; ${progressionToShorthand(set.progression)}`;
  }

  return s;
}

function indent(text: string, level: number): string {
  return "  ".repeat(level) + text;
}

export function generatePslFromConfig(config: ProgramConfig): string {
  const lines: string[] = [];
  const progId = createId("prog", config.name);

  lines.push('language_version: "0.2"');
  lines.push("metadata:");
  lines.push(`  id: ${progId}`);
  lines.push(`  name: ${config.name}`);
  if (config.description) {
    lines.push(`  description: ${config.description}`);
  }

  if (config.units) {
    lines.push(`units: ${config.units}`);
  }

  if (config.startDate) {
    lines.push("calendar:");
    lines.push(`  start_date: "${config.startDate}"`);
    if (config.endDate) {
      lines.push(`  end_date: "${config.endDate}"`);
    }
  }

  lines.push("sessions:");

  for (const day of config.days) {
    const sessionId = createId("session", `${config.name}-${day.day}`);
    lines.push(`  - id: ${sessionId}`);
    lines.push(`    name: ${day.day}`);
    lines.push(`    schedule: "${day.day}"`);
    lines.push("    exercises:");

    for (const ex of day.exercises) {
      if (ex.sets.length === 1 && !ex.exerciseId) {
        const shorthand = setToShorthand(ex.sets[0]);
        let exLine = `      - "${ex.exerciseName}: ${shorthand}`;
        if (ex.restSeconds) {
          if (ex.restSeconds >= 60 && ex.restSeconds % 60 === 0) {
            exLine += `; rest ${ex.restSeconds / 60}m`;
          } else {
            exLine += `; rest ${ex.restSeconds}s`;
          }
        }
        exLine += '"';
        lines.push(exLine);
      } else {
        lines.push(`      - exercise: ${ex.exerciseName}`);
        if (ex.exerciseId) {
          lines.push(`        exercise_id: ${ex.exerciseId}`);
        }
        if (ex.restSeconds) {
          if (ex.restSeconds >= 60 && ex.restSeconds % 60 === 0) {
            lines.push(`        rest: "${ex.restSeconds / 60}m"`);
          } else {
            lines.push(`        rest: "${ex.restSeconds}s"`);
          }
        }
        lines.push("        sets:");
        for (const set of ex.sets) {
          lines.push(`          - "${setToShorthand(set)}"`);
        }
      }
    }
  }

  return lines.join("\n") + "\n";
}

export { createId };
