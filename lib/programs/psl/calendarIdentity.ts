import type { ProgramCalendarEntrySnapshot } from "../../db/programCalendar";
import type { CalendarEntry } from "./pslService";

export function toCalendarOccurrenceKey(entry: {
  pslSessionId: string;
  dateIso: string;
  sequence: number;
}): string {
  return `${entry.pslSessionId}__${entry.dateIso}__${entry.sequence}`;
}

/**
 * Proves that replacing pristine calendar occurrences cannot change any
 * persisted explicit exercise binding. Name-only rows do not claim identity.
 */
export async function preservesExplicitExerciseIdentity(
  replaceableEntries: ProgramCalendarEntrySnapshot[],
  replacementEntries: CalendarEntry[]
): Promise<boolean> {
  const explicitExerciseSnapshots = replaceableEntries.flatMap((entry) =>
    entry.exercises.filter(({ exercise }) => exercise.exerciseId !== null)
  );
  if (explicitExerciseSnapshots.length === 0) {
    return true;
  }

  const { listExercisesByNames } = await import("../../db/exercises");
  const replacementExercises = replacementEntries.flatMap(
    (entry) => entry.exercises
  );
  const resolvedExercises = await listExercisesByNames(
    replacementExercises.map((exercise) => exercise.exerciseName)
  );
  const resolvedIdByName = new Map(
    resolvedExercises.map((exercise) => [exercise.name, exercise.id] as const)
  );
  const replacementByOccurrence = new Map(
    replacementEntries.map(
      (entry) => [toCalendarOccurrenceKey(entry), entry] as const
    )
  );

  return replaceableEntries.every((entry) => {
    const replacement = replacementByOccurrence.get(
      toCalendarOccurrenceKey(entry.calendar)
    );
    return entry.exercises.every(({ exercise }) => {
      if (exercise.exerciseId === null) {
        return true;
      }

      const replacementExercise = replacement?.exercises.find(
        (candidate) => candidate.orderIndex === exercise.orderIndex
      );
      return (
        replacementExercise !== undefined &&
        resolvedIdByName.get(replacementExercise.exerciseName) ===
          exercise.exerciseId
      );
    });
  });
}
