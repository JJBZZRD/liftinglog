import { type ProgramCalendarSetRow, type ProgrammedExerciseForDate } from "../../../lib/db/programCalendar";
import { getIntensityDefaultValue, getIntensityUnit } from "../../../lib/programs/psl/pslMapper";
export function normalizeDate(date: Date): Date {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  return next;
}

export function toDateIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function pickProgrammedEntry(
  entries: ProgrammedExerciseForDate[],
  preferredProgramExerciseId: number | null
): ProgrammedExerciseForDate | null {
  if (entries.length === 0) {
    return null;
  }

  if (preferredProgramExerciseId) {
    const preferred = entries.find(
      (entry) => entry.calendarExercise.id === preferredProgramExerciseId
    );
    if (preferred) {
      return preferred;
    }
  }

  return (
    entries.find((entry) => entry.calendarExercise.status !== "complete") ??
    entries[0]
  );
}

export function getProgramEntryLabel(
  entry: ProgrammedExerciseForDate,
  index: number,
  total: number
): string {
  const sessionLabel = entry.calendar.sessionName.trim();
  if (total === 1) {
    return `${entry.programName} - ${sessionLabel}`;
  }
  return `${index + 1}. ${entry.programName} - ${sessionLabel}`;
}

export function hasLoggedProgramSet(set: ProgramCalendarSetRow): boolean {
  return set.isLogged && set.setId != null;
}

export function getProgramSetInputPresentation(
  set: ProgramCalendarSetRow,
  weightUnitLabel: string,
  unitPreference: "kg" | "lb"
) {
  let autofillWeight = "";
  let intensityPlaceholder = "Intensity";
  let intensityUnitLabel: string = weightUnitLabel;

  if (set.prescribedIntensityJson) {
    try {
      const intensity = JSON.parse(set.prescribedIntensityJson);
      autofillWeight = getIntensityDefaultValue(intensity, unitPreference) || "";
      intensityPlaceholder = autofillWeight || intensityPlaceholder;
      const prescribedUnit = getIntensityUnit(intensity, unitPreference);
      if (
        prescribedUnit === "RPE" ||
        prescribedUnit === "RIR" ||
        prescribedUnit === "%"
      ) {
        intensityUnitLabel = prescribedUnit;
      }
    } catch { }
  }

  const autofillReps = set.prescribedReps || "";
  const repsPlaceholder = autofillReps || "Reps";

  return {
    autofillWeight,
    autofillReps,
    intensityPlaceholder,
    intensityUnitLabel,
    repsPlaceholder,
  };
}
