import { eq } from "drizzle-orm";
import { db } from "./connection";
import { exerciseFormulaOverrides, settings } from "./schema";

export type E1RMFormulaId =
  | "epley"
  | "brzycki"
  | "oconner"
  | "lombardi"
  | "mayhew"
  | "wathan";

export type UnitPreference = "kg" | "lb";
export type ThemePreference = "system" | "light" | "dark";
export type ColorThemeId = "default" | "ocean" | "forest" | "sunset" | "rose" | "violet" | "slate";

const SETTINGS_ID = 1;
const DEFAULT_SETTINGS = {
  e1rmFormula: "epley" as E1RMFormulaId,
  unitPreference: "kg" as UnitPreference,
  themePreference: "system" as ThemePreference,
  colorTheme: "default" as ColorThemeId,
};

type SettingsUpdate = {
  e1rmFormula?: E1RMFormulaId;
  unitPreference?: UnitPreference;
  themePreference?: ThemePreference;
  colorTheme?: ColorThemeId;
};

function getSettingsRow() {
  return db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).get();
}

function upsertSettings(update: SettingsUpdate): void {
  db.insert(settings)
    .values({
      id: SETTINGS_ID,
      ...DEFAULT_SETTINGS,
      ...update,
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: update,
    })
    .run();
}

export function getGlobalFormula(): E1RMFormulaId {
  return getSettingsRow()?.e1rmFormula ?? DEFAULT_SETTINGS.e1rmFormula;
}

export function setGlobalFormula(formula: E1RMFormulaId): void {
  upsertSettings({ e1rmFormula: formula });
}

export function getUnitPreference(): UnitPreference {
  return getSettingsRow()?.unitPreference ?? DEFAULT_SETTINGS.unitPreference;
}

export function setUnitPreference(unit: UnitPreference): void {
  upsertSettings({ unitPreference: unit });
}

export function getExerciseFormulaOverride(exerciseId: number): E1RMFormulaId | null {
  return (
    db.select()
      .from(exerciseFormulaOverrides)
      .where(eq(exerciseFormulaOverrides.exerciseId, exerciseId))
      .get()?.e1rmFormula ?? null
  );
}

export function setExerciseFormulaOverride(
  exerciseId: number,
  formula: E1RMFormulaId | null
): void {
  if (formula === null) {
    db.delete(exerciseFormulaOverrides)
      .where(eq(exerciseFormulaOverrides.exerciseId, exerciseId))
      .run();
    return;
  }

  db.insert(exerciseFormulaOverrides)
    .values({
      exerciseId,
      e1rmFormula: formula,
    })
    .onConflictDoUpdate({
      target: exerciseFormulaOverrides.exerciseId,
      set: { e1rmFormula: formula },
    })
    .run();
}

export function getThemePreference(): ThemePreference {
  return getSettingsRow()?.themePreference ?? DEFAULT_SETTINGS.themePreference;
}

export function setThemePreference(preference: ThemePreference): void {
  upsertSettings({ themePreference: preference });
}

export function getColorTheme(): ColorThemeId {
  return getSettingsRow()?.colorTheme ?? DEFAULT_SETTINGS.colorTheme;
}

export function setColorTheme(theme: ColorThemeId): void {
  upsertSettings({ colorTheme: theme });
}
