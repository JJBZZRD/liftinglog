import type { E1RMFormulaId, UnitPreference } from "./connection";
import { sqlite } from "./connection";

export function getGlobalFormula(): E1RMFormulaId {
  const stmt = sqlite.prepareSync(
    "SELECT e1rm_formula FROM settings WHERE id = 1"
  );
  try {
    const res = stmt.executeSync();
    const row = res.getFirstSync() as { e1rm_formula: E1RMFormulaId } | null;
    return row?.e1rm_formula ?? "epley";
  } finally {
    stmt.finalizeSync();
  }
}

export function setGlobalFormula(formula: E1RMFormulaId): void {
  sqlite.runSync(
    `INSERT INTO settings (id, e1rm_formula, unit_preference)
     VALUES (1, ?, 'kg')
     ON CONFLICT(id) DO UPDATE SET e1rm_formula=excluded.e1rm_formula;`,
    [formula]
  );
}

export function getUnitPreference(): UnitPreference {
  const stmt = sqlite.prepareSync(
    "SELECT unit_preference FROM settings WHERE id = 1"
  );
  try {
    const res = stmt.executeSync();
    const row = res.getFirstSync() as { unit_preference: UnitPreference } | null;
    return row?.unit_preference ?? "kg";
  } finally {
    stmt.finalizeSync();
  }
}

export function setUnitPreference(unit: UnitPreference): void {
  sqlite.runSync(
    `INSERT INTO settings (id, e1rm_formula, unit_preference)
     VALUES (1, 'epley', ?)
     ON CONFLICT(id) DO UPDATE SET unit_preference=excluded.unit_preference;`,
    [unit]
  );
}

export function getExerciseFormulaOverride(exerciseId: number): E1RMFormulaId | null {
  const stmt = sqlite.prepareSync(
    "SELECT e1rm_formula FROM exercise_formula_overrides WHERE exercise_id = $id"
  );
  try {
    const res = stmt.executeSync({ $id: exerciseId });
    const row = res.getFirstSync() as { e1rm_formula: E1RMFormulaId } | null;
    return row?.e1rm_formula ?? null;
  } finally {
    stmt.finalizeSync();
  }
}

export function setExerciseFormulaOverride(
  exerciseId: number,
  formula: E1RMFormulaId | null
): void {
  if (formula === null) {
    sqlite.runSync(
      "DELETE FROM exercise_formula_overrides WHERE exercise_id = $id",
      { $id: exerciseId }
    );
  } else {
    sqlite.runSync(
      `INSERT INTO exercise_formula_overrides (exercise_id, e1rm_formula)
       VALUES ($id, $formula)
       ON CONFLICT(exercise_id) DO UPDATE SET e1rm_formula=excluded.e1rm_formula;`,
      { $id: exerciseId, $formula: formula }
    );
  }
}

export type ThemePreference = "system" | "light" | "dark";

export type ColorThemeId = "default" | "ocean" | "forest" | "sunset" | "rose" | "violet" | "slate";

export function getThemePreference(): ThemePreference {
  const stmt = sqlite.prepareSync(
    "SELECT theme_preference FROM settings WHERE id = 1"
  );
  try {
    const res = stmt.executeSync();
    const row = res.getFirstSync() as { theme_preference: ThemePreference } | null;
    return row?.theme_preference ?? "system";
  } finally {
    stmt.finalizeSync();
  }
}

export function setThemePreference(preference: ThemePreference): void {
  sqlite.runSync(
    `INSERT INTO settings (id, e1rm_formula, unit_preference, theme_preference, color_theme)
     VALUES (1, 'epley', 'kg', ?, 'default')
     ON CONFLICT(id) DO UPDATE SET theme_preference=excluded.theme_preference;`,
    [preference]
  );
}

export function getColorTheme(): ColorThemeId {
  const stmt = sqlite.prepareSync(
    "SELECT color_theme FROM settings WHERE id = 1"
  );
  try {
    const res = stmt.executeSync();
    const row = res.getFirstSync() as { color_theme: ColorThemeId } | null;
    return row?.color_theme ?? "default";
  } finally {
    stmt.finalizeSync();
  }
}

export function setColorTheme(theme: ColorThemeId): void {
  sqlite.runSync(
    `INSERT INTO settings (id, e1rm_formula, unit_preference, theme_preference, color_theme)
     VALUES (1, 'epley', 'kg', 'system', ?)
     ON CONFLICT(id) DO UPDATE SET color_theme=excluded.color_theme;`,
    [theme]
  );
}

