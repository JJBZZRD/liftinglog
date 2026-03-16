import type { SessionCompletion } from "program-specification-language";
import {
  deleteCalendarEntriesByIds,
  getProgramCalendarSnapshot,
  insertCalendarEntries,
} from "../../db/programCalendar";
import { getPslProgramById, type PslProgramRow } from "../../db/pslPrograms";
import { getDateIsoToday, compilePslSource, extractCalendarEntries } from "./pslService";
import {
  parseStoredPercentIntensityConfig,
  resolvePercentIntensityMaterialized,
} from "./percentIntensity";
import {
  buildSessionCompletionFromSnapshot,
  isPristineProgramCalendarEntry,
} from "./programRuntimeHelpers";

type CalendarOverride = {
  start_date: string;
  end_date?: string;
};

function getCalendarOverride(program: Pick<PslProgramRow, "startDate" | "endDate">): CalendarOverride | null {
  if (!program.startDate) {
    return null;
  }

  return {
    start_date: program.startDate,
    ...(program.endDate ? { end_date: program.endDate } : {}),
  };
}

export async function buildProgramCompletions(
  programId: number
): Promise<SessionCompletion[]> {
  const program = await getPslProgramById(programId);
  if (!program) {
    return [];
  }

  const snapshot = await getProgramCalendarSnapshot(programId);
  const fallbackUnit = program.units === "lb" ? "lb" : "kg";

  return snapshot
    .map((entry) => buildSessionCompletionFromSnapshot(entry, fallbackUnit))
    .filter((entry): entry is SessionCompletion => entry !== null);
}

function toOccurrenceKey(entry: {
  pslSessionId: string;
  dateIso: string;
  sequence: number;
}): string {
  return `${entry.pslSessionId}__${entry.dateIso}__${entry.sequence}`;
}

export async function refreshUpcomingCalendarForProgram(
  programId: number
): Promise<void> {
  const program = await getPslProgramById(programId);
  if (!program || !program.isActive) {
    return;
  }

  const calendarOverride = getCalendarOverride(program);
  if (!calendarOverride) {
    return;
  }

  const snapshot = await getProgramCalendarSnapshot(programId);
  const fallbackUnit = program.units === "lb" ? "lb" : "kg";
  const completions = snapshot
    .map((entry) => buildSessionCompletionFromSnapshot(entry, fallbackUnit))
    .filter((entry): entry is SessionCompletion => entry !== null);

  const result = compilePslSource(program.pslSource, {
    calendarOverride,
    completions,
  });
  if (!result.valid || !result.materialized) {
    const errorMessage = result.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.message)
      .join("\n");
    throw new Error(errorMessage || "Program calendar could not be refreshed.");
  }

  const todayIso = getDateIsoToday();
  const replaceableEntries = snapshot.filter(
    (entry) => entry.calendar.dateIso >= todayIso && isPristineProgramCalendarEntry(entry)
  );

  if (replaceableEntries.length === 0) {
    return;
  }

  const preservedKeys = new Set(
    snapshot
      .filter((entry) => !replaceableEntries.some((candidate) => candidate.calendar.id === entry.calendar.id))
      .map((entry) =>
        toOccurrenceKey({
          pslSessionId: entry.calendar.pslSessionId,
          dateIso: entry.calendar.dateIso,
          sequence: entry.calendar.sequence,
        })
      )
  );

  await deleteCalendarEntriesByIds(
    replaceableEntries.map((entry) => entry.calendar.id)
  );

  const resolvedMaterialized = resolvePercentIntensityMaterialized(
    result.materialized,
    {
      fallbackUnit: program.units === "lb" ? "lb" : "kg",
      configEntries: parseStoredPercentIntensityConfig(
        program.percentIntensityConfigJson
      ),
    }
  );

  const nextEntries = extractCalendarEntries(resolvedMaterialized).filter(
    (entry) =>
      entry.dateIso >= todayIso &&
      !preservedKeys.has(
        toOccurrenceKey({
          pslSessionId: entry.pslSessionId,
          dateIso: entry.dateIso,
          sequence: entry.sequence,
        })
      )
  );

  if (nextEntries.length > 0) {
    await insertCalendarEntries(programId, nextEntries);
  }
}

export async function refreshUpcomingCalendarForPrograms(
  programIds: number[]
): Promise<void> {
  const uniqueProgramIds = [...new Set(programIds.filter((id) => Number.isFinite(id) && id > 0))];
  for (const programId of uniqueProgramIds) {
    try {
      await refreshUpcomingCalendarForProgram(programId);
    } catch (error) {
      if (__DEV__) {
        console.warn("[programs] Failed to refresh upcoming calendar", {
          programId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
