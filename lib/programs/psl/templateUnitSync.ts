import type {
  IntensityTarget,
  LoadUnit,
  SessionCompletion,
} from "program-specification-language";
import {
  deleteCalendarEntriesByIds,
  getProgramCalendarSnapshot,
  insertCalendarEntries,
  updateCalendarExercisePrescriptions,
  type ProgramCalendarEntrySnapshot,
} from "../../db/programCalendar";
import {
  listPslPrograms,
  updatePslProgram,
  type PslProgramRow,
} from "../../db/pslPrograms";
import type { UnitPreference } from "../../db/settings";
import {
  convertWeightFromKg,
  convertWeightToKg,
} from "../../utils/units";
import {
  parseStoredPercentIntensityConfig,
  resolvePercentIntensityMaterialized,
} from "./percentIntensity";
import {
  buildSessionCompletionFromSnapshot,
  isPristineProgramCalendarEntry,
} from "./programRuntimeHelpers";
import {
  compilePslSource,
  extractCalendarEntries,
  getDateIsoToday,
} from "./pslService";
import { rebuildBundledTemplateSourceFromExistingProgram } from "./pslTemplates";

const STANDARD_INCREMENT_BY_UNIT: Record<LoadUnit, number> = {
  kg: 2.5,
  lb: 5,
};

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

function convertIntensityTarget(
  intensity: IntensityTarget,
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
          ? {
              plus_load: {
                value: convertProgramLoadValue(
                  intensity.plus_load.value,
                  intensity.plus_load.unit,
                  targetUnit
                ),
                unit: targetUnit,
              },
            }
          : {}),
      };
    case "percent_of_set":
    case "rpe":
    case "rir":
    default:
      return { ...intensity };
  }
}

function convertPrescribedIntensityJson(
  prescribedIntensityJson: string | null,
  targetUnit: LoadUnit
): string | null {
  if (!prescribedIntensityJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(prescribedIntensityJson) as IntensityTarget;
    return JSON.stringify(convertIntensityTarget(parsed, targetUnit));
  } catch {
    return prescribedIntensityJson;
  }
}

function toOccurrenceKey(entry: {
  pslSessionId: string;
  dateIso: string;
  sequence: number;
}): string {
  return `${entry.pslSessionId}__${entry.dateIso}__${entry.sequence}`;
}

function getCalendarOverride(
  program: Pick<PslProgramRow, "startDate" | "endDate">
): { start_date: string; end_date?: string } | null {
  if (!program.startDate) {
    return null;
  }

  return {
    start_date: program.startDate,
    ...(program.endDate ? { end_date: program.endDate } : {}),
  };
}

function buildProgramSnapshotCompletions(
  snapshot: ProgramCalendarEntrySnapshot[],
  fallbackUnit: LoadUnit
): SessionCompletion[] {
  return snapshot
    .map((entry) => buildSessionCompletionFromSnapshot(entry, fallbackUnit))
    .filter((entry): entry is SessionCompletion => entry !== null);
}

async function updatePreservedCalendarEntriesToUnit(
  entries: ProgramCalendarEntrySnapshot[],
  targetUnit: LoadUnit
): Promise<void> {
  for (const entry of entries) {
    for (const exercise of entry.exercises) {
      const setUpdates = exercise.sets.map((set) => ({
        id: set.id,
        prescribedReps: set.prescribedReps,
        prescribedIntensityJson: convertPrescribedIntensityJson(
          set.prescribedIntensityJson,
          targetUnit
        ),
        prescribedRole: set.prescribedRole,
        setIndex: set.setIndex,
      }));

      await updateCalendarExercisePrescriptions({
        calendarExerciseId: exercise.exercise.id,
        prescribedSetsJson: JSON.stringify(
          setUpdates.map((setUpdate) => ({
            setIndex: setUpdate.setIndex,
            prescribedReps: setUpdate.prescribedReps,
            prescribedIntensityJson: setUpdate.prescribedIntensityJson,
            prescribedRole: setUpdate.prescribedRole,
          }))
        ),
        setUpdates: setUpdates.map(({ setIndex: _setIndex, ...setUpdate }) => setUpdate),
      });
    }
  }
}

async function syncActiveBundledTemplateProgram(
  program: PslProgramRow,
  nextSource: string,
  targetUnit: LoadUnit,
  previousUnit: LoadUnit | null
): Promise<void> {
  const snapshot = await getProgramCalendarSnapshot(program.id);
  const calendarOverride = getCalendarOverride(program);
  const completions = buildProgramSnapshotCompletions(
    snapshot,
    previousUnit ?? "kg"
  );
  const todayIso = getDateIsoToday();

  const replaceableEntries = snapshot.filter(
    (entry) =>
      entry.calendar.dateIso >= todayIso && isPristineProgramCalendarEntry(entry)
  );
  const preservedEntries = snapshot.filter(
    (entry) =>
      !replaceableEntries.some(
        (candidate) => candidate.calendar.id === entry.calendar.id
      )
  );

  const compileResult = calendarOverride
    ? compilePslSource(nextSource, {
        calendarOverride,
        completions,
      })
    : null;

  if (calendarOverride && (!compileResult?.valid || !compileResult.materialized)) {
    const errorMessage = (compileResult?.diagnostics ?? [])
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.message)
      .join("\n");
    throw new Error(errorMessage || "Program calendar could not be refreshed.");
  }

  await updatePreservedCalendarEntriesToUnit(preservedEntries, targetUnit);

  await updatePslProgram(program.id, {
    pslSource: nextSource,
    units: targetUnit,
    compiledHash: compileResult?.compiled?.source_hash ?? null,
  });

  if (!compileResult?.materialized || replaceableEntries.length === 0) {
    return;
  }

  const preservedKeys = new Set(
    preservedEntries.map((entry) =>
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
    compileResult.materialized,
    {
      fallbackUnit: targetUnit,
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
    await insertCalendarEntries(program.id, nextEntries);
  }
}

async function syncInactiveBundledTemplateProgram(
  program: PslProgramRow,
  nextSource: string,
  targetUnit: LoadUnit
): Promise<void> {
  const compileResult = compilePslSource(nextSource);

  await updatePslProgram(program.id, {
    pslSource: nextSource,
    units: targetUnit,
    compiledHash: compileResult.valid ? compileResult.compiled?.source_hash ?? null : null,
  });
}

export async function syncBundledTemplateProgramsToUnit(
  targetUnit: UnitPreference
): Promise<number[]> {
  const nextUnit: LoadUnit = targetUnit === "lb" ? "lb" : "kg";
  const programs = await listPslPrograms();
  const updatedProgramIds: number[] = [];

  for (const program of programs) {
    try {
      const rebuilt = rebuildBundledTemplateSourceFromExistingProgram(
        program.pslSource,
        nextUnit
      );
      if (!rebuilt) {
        continue;
      }

      const sourceChanged = rebuilt.nextSource !== program.pslSource;
      const unitsChanged = program.units !== nextUnit;
      if (!sourceChanged && !unitsChanged) {
        continue;
      }

      if (program.isActive) {
        await syncActiveBundledTemplateProgram(
          program,
          rebuilt.nextSource,
          nextUnit,
          rebuilt.currentUnit
        );
      } else {
        await syncInactiveBundledTemplateProgram(
          program,
          rebuilt.nextSource,
          nextUnit
        );
      }

      updatedProgramIds.push(program.id);
    } catch (error) {
      console.warn("[programs] Failed to sync bundled template units", {
        program,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return updatedProgramIds;
}
