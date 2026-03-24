import type {
  CompiledSet,
  CompiledExercise,
  IntensityTarget,
  LoadUnit,
  RepRange,
  SetPrescription,
} from "program-specification-language";
import {
  convertWeightToKg,
  formatEditableWeightFromKg,
} from "../../utils/units";

function formatDisplayLoad(
  value: number,
  unit: LoadUnit,
  displayUnit?: LoadUnit
): string {
  const nextUnit = displayUnit ?? unit;
  const weightKg = convertWeightToKg(value, unit);
  return formatEditableWeightFromKg(weightKg, nextUnit);
}

export function formatIntensity(
  intensity: IntensityTarget | undefined,
  displayUnit?: LoadUnit
): string {
  if (!intensity) return "";

  switch (intensity.type) {
    case "percent_1rm": {
      let s = `@${intensity.value}%`;
      if (intensity.plus_load) {
        const sign = intensity.plus_load.value >= 0 ? "+" : "";
        const nextUnit = displayUnit ?? intensity.plus_load.unit;
        s += `${sign}${formatDisplayLoad(
          intensity.plus_load.value,
          intensity.plus_load.unit,
          nextUnit
        )}${nextUnit}`;
      }
      return s;
    }
    case "rpe":
      return `@RPE${intensity.value}`;
    case "rir":
      return `@RIR${intensity.value}`;
    case "load": {
      const nextUnit = displayUnit ?? intensity.unit;
      return `${formatDisplayLoad(
        intensity.value,
        intensity.unit,
        nextUnit
      )}${nextUnit}`;
    }
    case "load_range": {
      const nextUnit = displayUnit ?? intensity.unit;
      return `${formatDisplayLoad(
        intensity.min,
        intensity.unit,
        nextUnit
      )}-${formatDisplayLoad(
        intensity.max,
        intensity.unit,
        nextUnit
      )}${nextUnit}`;
    }
    case "percent_of_set":
      return `@${intensity.value}% of ${intensity.role}`;
    case "load_delta_from_set": {
      const sign = intensity.value >= 0 ? "+" : "";
      const nextUnit = displayUnit ?? intensity.unit;
      return `${sign}${formatDisplayLoad(
        intensity.value,
        intensity.unit,
        nextUnit
      )}${nextUnit} from ${intensity.role}`;
    }
    default:
      return "";
  }
}

export function formatReps(reps: number | RepRange | undefined): string {
  if (reps === undefined) return "";
  if (typeof reps === "number") return String(reps);
  return `${reps.min}-${reps.max}`;
}

export function formatSetSummary(set: CompiledSet | SetPrescription): string {
  const count = "count" in set ? set.count : 1;
  const repsStr = formatReps(set.reps);
  const intensityStr = formatIntensity(set.intensity);
  const roleStr = set.role && set.role !== "work" ? ` ${set.role}` : "";

  let summary = `${count}x${repsStr}`;
  if (intensityStr) summary += ` ${intensityStr}`;
  if (roleStr) summary += roleStr;
  return summary;
}

export function formatExerciseSummary(exercise: CompiledExercise): string {
  if (exercise.sets.length === 0) return "";

  const first = exercise.sets[0];
  const totalSets = exercise.sets.length;
  const repsStr = formatReps(first.reps);
  const intensityStr = formatIntensity(first.intensity);

  const allSameReps = exercise.sets.every(
    (s) => JSON.stringify(s.reps) === JSON.stringify(first.reps)
  );
  const allSameIntensity = exercise.sets.every(
    (s) => JSON.stringify(s.intensity) === JSON.stringify(first.intensity)
  );

  if (allSameReps && allSameIntensity) {
    let s = `${totalSets}x${repsStr}`;
    if (intensityStr) s += ` ${intensityStr}`;
    return s;
  }

  return exercise.sets
    .map((s) => {
      const r = formatReps(s.reps);
      const i = formatIntensity(s.intensity);
      return i ? `${r} ${i}` : r;
    })
    .join(", ");
}

export type IntensityInputMode = "weight" | "rpe" | "rir" | "percent" | "none";

export function getIntensityInputMode(intensity: IntensityTarget | undefined): IntensityInputMode {
  if (!intensity) return "none";
  switch (intensity.type) {
    case "load":
    case "load_range":
    case "load_delta_from_set":
      return "weight";
    case "percent_1rm":
    case "percent_of_set":
      return "percent";
    case "rpe":
      return "rpe";
    case "rir":
      return "rir";
    default:
      return "none";
  }
}

export function getIntensityDefaultValue(
  intensity: IntensityTarget | undefined,
  displayUnit?: LoadUnit
): string {
  if (!intensity) return "";
  switch (intensity.type) {
    case "load":
      return formatDisplayLoad(intensity.value, intensity.unit, displayUnit);
    case "load_range": {
      const nextUnit = displayUnit ?? intensity.unit;
      return `${formatDisplayLoad(
        intensity.min,
        intensity.unit,
        nextUnit
      )}-${formatDisplayLoad(
        intensity.max,
        intensity.unit,
        nextUnit
      )}`;
    }
    case "rpe":
      return String(intensity.value);
    case "rir":
      return String(intensity.value);
    case "percent_1rm":
      return `${intensity.value}%`;
    case "percent_of_set":
      return `${intensity.value}%`;
    case "load_delta_from_set":
      return formatDisplayLoad(
        Math.abs(intensity.value),
        intensity.unit,
        displayUnit
      );
    default:
      return "";
  }
}

export function getIntensityUnit(
  intensity: IntensityTarget | undefined,
  displayUnit?: LoadUnit
): string {
  if (!intensity) return "";
  switch (intensity.type) {
    case "load":
    case "load_range":
    case "load_delta_from_set":
      return displayUnit ?? intensity.unit;
    case "percent_1rm":
    case "percent_of_set":
      return "%";
    case "rpe":
      return "RPE";
    case "rir":
      return "RIR";
    default:
      return "";
  }
}
