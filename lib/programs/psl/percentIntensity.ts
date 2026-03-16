import type {
  LoadUnit,
  MaterializedSession,
  RoundingPolicy,
} from "program-specification-language";
import { listExercisesByNames } from "../../db/exercises";
import {
  getEstimated1RMPerSession,
  getMaxWeightPerSession,
} from "../../utils/analytics";
import {
  convertWeightFromKg,
  convertWeightToKg,
} from "../../utils/units";

export type PercentIntensitySelectionMode =
  | "history_e1rm"
  | "history_single"
  | "custom";

export type PercentIntensityRequirement = {
  key: string;
  exerciseName: string;
  exerciseId: string | null;
  units: LoadUnit;
  rounding?: RoundingPolicy;
};

export type PercentIntensityHistoryOption = PercentIntensityRequirement & {
  libraryExerciseId: number | null;
  libraryExerciseName: string | null;
  bestEstimated1rmKg: number | null;
  bestSingleKg: number | null;
};

export type StoredPercentIntensityConfigEntry = {
  key: string;
  exerciseName: string;
  sourceExerciseId: number | null;
  sourceExerciseName: string | null;
  mode: PercentIntensitySelectionMode;
  baselineKg: number;
};

type PercentIntensityConfigEnvelope = {
  version: 1;
  entries: StoredPercentIntensityConfigEntry[];
};

function getRequirementKey(exercise: {
  exercise: string;
  exercise_id?: string;
}): string {
  return exercise.exercise_id?.trim() || exercise.exercise.trim();
}

function getRequirementUnits(
  exercise: {
    units?: LoadUnit;
    sets: Array<{
      intensity?: {
        type?: string;
        plus_load?: {
          unit?: LoadUnit;
        };
      };
    }>;
  },
  fallbackUnit: LoadUnit
): LoadUnit {
  if (exercise.units === "kg" || exercise.units === "lb") {
    return exercise.units;
  }

  const plusLoadUnit = exercise.sets.find(
    (set) => set.intensity?.type === "percent_1rm"
  )?.intensity?.plus_load?.unit;

  if (plusLoadUnit === "kg" || plusLoadUnit === "lb") {
    return plusLoadUnit;
  }

  return fallbackUnit;
}

function getMaxPointValue(points: Array<{ value: number }>): number | null {
  if (points.length === 0) {
    return null;
  }

  return points.reduce(
    (best, point) => (point.value > best ? point.value : best),
    points[0].value
  );
}

function roundValue(value: number, increment: number, mode: "nearest" | "down" | "up"): number {
  const scaled = value / increment;
  const rounded =
    mode === "up"
      ? Math.ceil(scaled)
      : mode === "down"
        ? Math.floor(scaled)
        : Math.round(scaled);
  return Math.round(rounded * increment * 10000) / 10000;
}

function applyRoundingPolicy(
  value: number,
  unit: LoadUnit,
  rounding: RoundingPolicy | undefined
): number {
  const increment =
    typeof rounding?.round_to === "number" && rounding.round_to > 0
      ? rounding.round_to
      : unit === "lb"
        ? 5
        : 2.5;
  const mode = rounding?.mode ?? "nearest";
  return roundValue(value, increment, mode);
}

function convertPercentIntensityToLoad(params: {
  baselineKg: number;
  units: LoadUnit;
  rounding?: RoundingPolicy;
  intensity: {
    value: number;
    plus_load?: {
      value: number;
      unit: LoadUnit;
    };
  };
}) {
  const baselineInTargetUnit = convertWeightFromKg(params.baselineKg, params.units);
  const plusLoad =
    params.intensity.plus_load == null
      ? 0
      : convertWeightFromKg(
          convertWeightToKg(
            params.intensity.plus_load.value,
            params.intensity.plus_load.unit
          ),
          params.units
        );

  const resolvedValue = applyRoundingPolicy(
    baselineInTargetUnit * (params.intensity.value / 100) + plusLoad,
    params.units,
    params.rounding
  );

  return {
    type: "load" as const,
    value: resolvedValue,
    unit: params.units,
  };
}

export function collectPercentIntensityRequirements(
  materialized: MaterializedSession[],
  fallbackUnit: LoadUnit
): PercentIntensityRequirement[] {
  const requirements = new Map<string, PercentIntensityRequirement>();

  for (const session of materialized) {
    for (const exercise of session.exercises) {
      const hasPercentIntensity = exercise.sets.some(
        (set) => set.intensity?.type === "percent_1rm"
      );
      if (!hasPercentIntensity) {
        continue;
      }

      const key = getRequirementKey(exercise);
      if (requirements.has(key)) {
        continue;
      }

      requirements.set(key, {
        key,
        exerciseName: exercise.exercise,
        exerciseId: exercise.exercise_id ?? null,
        units: getRequirementUnits(exercise, fallbackUnit),
        rounding: exercise.rounding,
      });
    }
  }

  return Array.from(requirements.values());
}

export async function loadPercentIntensityHistoryOptions(
  requirements: PercentIntensityRequirement[]
): Promise<PercentIntensityHistoryOption[]> {
  if (requirements.length === 0) {
    return [];
  }

  const exerciseRows = await listExercisesByNames(
    requirements.map((requirement) => requirement.exerciseName)
  );
  const exerciseByName = new Map(
    exerciseRows.map((exercise) => [exercise.name, exercise] as const)
  );

  return Promise.all(
    requirements.map(async (requirement) => {
      const exercise = exerciseByName.get(requirement.exerciseName) ?? null;
      if (!exercise) {
        return {
          ...requirement,
          libraryExerciseId: null,
          libraryExerciseName: null,
          bestEstimated1rmKg: null,
          bestSingleKg: null,
        };
      }

      const [e1rmPoints, singlePoints] = await Promise.all([
        getEstimated1RMPerSession(exercise.id),
        getMaxWeightPerSession(exercise.id),
      ]);

      return {
        ...requirement,
        libraryExerciseId: exercise.id,
        libraryExerciseName: exercise.name,
        bestEstimated1rmKg: getMaxPointValue(e1rmPoints),
        bestSingleKg: getMaxPointValue(singlePoints),
      };
    })
  );
}

export function parseStoredPercentIntensityConfig(
  value: string | null | undefined
): StoredPercentIntensityConfigEntry[] {
  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as Partial<PercentIntensityConfigEnvelope>;
    if (!Array.isArray(parsed.entries)) {
      return [];
    }

    return parsed.entries.filter(
      (entry): entry is StoredPercentIntensityConfigEntry =>
        typeof entry?.key === "string" &&
        entry.key.trim() !== "" &&
        typeof entry.exerciseName === "string" &&
        entry.exerciseName.trim() !== "" &&
        (entry.mode === "history_e1rm" ||
          entry.mode === "history_single" ||
          entry.mode === "custom") &&
        typeof entry.baselineKg === "number" &&
        Number.isFinite(entry.baselineKg) &&
        entry.baselineKg > 0 &&
        (entry.sourceExerciseId === null ||
          typeof entry.sourceExerciseId === "number") &&
        (entry.sourceExerciseName === null ||
          typeof entry.sourceExerciseName === "string")
    );
  } catch {
    return [];
  }
}

export function serializeStoredPercentIntensityConfig(
  entries: StoredPercentIntensityConfigEntry[]
): string | null {
  if (entries.length === 0) {
    return null;
  }

  return JSON.stringify({
    version: 1,
    entries,
  } satisfies PercentIntensityConfigEnvelope);
}

export function resolvePercentIntensityMaterialized(
  materialized: MaterializedSession[],
  options: {
    fallbackUnit: LoadUnit;
    configEntries: StoredPercentIntensityConfigEntry[];
  }
): MaterializedSession[] {
  if (materialized.length === 0) {
    return materialized;
  }

  const configByKey = new Map(
    options.configEntries.map((entry) => [entry.key, entry] as const)
  );

  return materialized.map((session) => ({
    ...session,
    exercises: session.exercises.map((exercise) => {
      const requirementKey = getRequirementKey(exercise);
      const resolvedUnits = getRequirementUnits(exercise, options.fallbackUnit);
      const config = configByKey.get(requirementKey);

      return {
        ...exercise,
        sets: exercise.sets.map((set) => {
          if (set.intensity?.type !== "percent_1rm" || !config) {
            return { ...set };
          }

          return {
            ...set,
            intensity: convertPercentIntensityToLoad({
              baselineKg: config.baselineKg,
              units: resolvedUnits,
              rounding: exercise.rounding,
              intensity: set.intensity,
            }),
          };
        }),
      };
    }),
  }));
}
