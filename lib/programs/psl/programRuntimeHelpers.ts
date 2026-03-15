import type { SessionCompletion } from "program-specification-language";
import type {
  ProgramCalendarEntrySnapshot,
  ProgramCalendarSetSnapshot,
} from "../../db/programCalendar";
import { convertWeightFromKg } from "../../utils/units";

function parseSessionCompletionOverrideExerciseIds(
  value: string | null | undefined
): number[] {
  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return [
      ...new Set(
        parsed.filter(
          (entry): entry is number =>
            typeof entry === "number" && Number.isInteger(entry) && entry > 0
        )
      ),
    ];
  } catch {
    return [];
  }
}

function parseLoadUnit(
  prescribedIntensityJson: string | null | undefined,
  fallbackUnit: "kg" | "lb"
): "kg" | "lb" {
  if (!prescribedIntensityJson) {
    return fallbackUnit;
  }

  try {
    const parsed = JSON.parse(prescribedIntensityJson) as { unit?: unknown; type?: unknown };
    if (
      (parsed.type === "load" || parsed.type === "load_range") &&
      (parsed.unit === "kg" || parsed.unit === "lb")
    ) {
      return parsed.unit;
    }
  } catch {
    return fallbackUnit;
  }

  return fallbackUnit;
}

function hasLinkedLoggedData(set: ProgramCalendarSetSnapshot): boolean {
  return (
    set.setId !== null &&
    set.linkedSetReps !== null &&
    set.linkedSetReps > 0 &&
    set.linkedSetWeightKg !== null &&
    set.linkedSetWeightKg > 0
  );
}

function buildSetCompletion(
  set: ProgramCalendarSetSnapshot,
  fallbackUnit: "kg" | "lb"
) {
  if (!hasLinkedLoggedData(set)) {
    return null;
  }

  const unit = parseLoadUnit(set.prescribedIntensityJson, fallbackUnit);
  const loadValue =
    set.linkedSetWeightKg !== null
      ? convertWeightFromKg(set.linkedSetWeightKg, unit)
      : null;

  return {
    index: set.setIndex,
    ...(loadValue !== null ? { load: { value: loadValue, unit } } : {}),
    ...(typeof set.linkedSetRpe === "number" ? { rpe: set.linkedSetRpe } : {}),
    ...(typeof set.linkedSetRir === "number" ? { rir: set.linkedSetRir } : {}),
    ...(typeof set.linkedSetReps === "number" ? { reps_completed: set.linkedSetReps } : {}),
  };
}

export function isPristineProgramCalendarEntry(
  entry: ProgramCalendarEntrySnapshot
): boolean {
  if (entry.calendar.status !== "pending") {
    return false;
  }

  if (
    parseSessionCompletionOverrideExerciseIds(
      entry.calendar.completionOverrideExerciseIdsJson
    ).length > 0
  ) {
    return false;
  }

  return entry.exercises.every(({ exercise, sets }) => {
    if (exercise.status !== "pending" || exercise.workoutExerciseId !== null) {
      return false;
    }

    return sets.every(
      (set) =>
        !set.isUserAdded &&
        !set.isLogged &&
        set.setId === null &&
        set.actualWeight === null &&
        set.actualReps === null &&
        set.actualRpe === null &&
        set.loggedAt === null
    );
  });
}

function deriveSessionSuccess(entry: ProgramCalendarEntrySnapshot): boolean | undefined {
  if (entry.calendar.status !== "complete") {
    return undefined;
  }

  const overriddenExerciseIds = parseSessionCompletionOverrideExerciseIds(
    entry.calendar.completionOverrideExerciseIdsJson
  );
  if (overriddenExerciseIds.length > 0) {
    return false;
  }

  const prescribedSets = entry.exercises.flatMap(({ sets }) =>
    sets.filter((set) => !set.isUserAdded)
  );
  if (prescribedSets.length === 0) {
    return false;
  }

  return prescribedSets.every((set) => hasLinkedLoggedData(set));
}

export function buildSessionCompletionFromSnapshot(
  entry: ProgramCalendarEntrySnapshot,
  fallbackUnit: "kg" | "lb"
): SessionCompletion | null {
  const exercises = entry.exercises
    .map(({ exercise, sets }) => {
      const setCompletions = sets
        .filter((set) => !set.isUserAdded)
        .map((set) => buildSetCompletion(set, fallbackUnit))
        .filter((set): set is NonNullable<typeof set> => set !== null);

      if (setCompletions.length === 0) {
        return null;
      }

      return {
        exercise: exercise.exerciseName,
        sets: setCompletions,
      };
    })
    .filter((exercise): exercise is NonNullable<typeof exercise> => exercise !== null);

  const success = deriveSessionSuccess(entry);
  if (exercises.length === 0 && success === undefined) {
    return null;
  }

  return {
    session_id: entry.calendar.pslSessionId,
    date_iso: entry.calendar.dateIso,
    ...(success !== undefined ? { success } : {}),
    ...(exercises.length > 0 ? { exercises } : {}),
  };
}
