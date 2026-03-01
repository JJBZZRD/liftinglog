/**
 * Tests for the PSL-powered Programs feature.
 * Tests PSL compilation, calendar extraction, and mapper utilities.
 */

import {
  compilePslSource,
  extractCalendarEntries,
  getDateIsoToday,
  formatDateForDisplay,
} from "../../lib/programs/psl/pslService";
import {
  formatIntensity,
  formatReps,
  formatSetSummary,
  getIntensityInputMode,
} from "../../lib/programs/psl/pslMapper";

// ============================================================================
// PSL Compilation Tests
// ============================================================================

describe("PSL Compilation", () => {
  it("should compile a minimal valid PSL source", () => {
    const source = `
language_version: "0.1"
metadata:
  id: test
  name: Test Program
sessions:
  - id: day-1
    name: Day 1
    day: 1
    exercises:
      - exercise: Back Squat
        sets:
          - count: 3
            reps: 5
`;
    const result = compilePslSource(source);
    expect(result.valid).toBe(true);
    expect(result.ast).toBeDefined();
    expect(result.compiled).toBeDefined();
    expect(result.materialized).toBeDefined();
  });

  it("should fail for invalid YAML", () => {
    const result = compilePslSource("not: valid: yaml: {{");
    expect(result.valid).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("should fail for missing required fields", () => {
    const source = `
language_version: "0.1"
metadata:
  id: test
`;
    const result = compilePslSource(source);
    expect(result.valid).toBe(false);
  });

  it("should compile shorthand set notation", () => {
    const source = `
language_version: "0.2"
metadata:
  id: shorthand-test
  name: Shorthand Test
sessions:
  - id: day-1
    name: Day 1
    day: 1
    exercises:
      - "Back Squat: 3x5 @75%"
`;
    const result = compilePslSource(source);
    expect(result.valid).toBe(true);
    expect(result.compiled!.sessions[0].exercises[0].sets.length).toBe(3);
  });

  it("should compile weekday schedule with calendar", () => {
    const source = `
language_version: "0.2"
metadata:
  id: weekly-test
  name: Weekly Test
calendar:
  start_date: "2026-03-02"
  end_date: "2026-03-22"
sessions:
  - id: mon
    name: Monday
    schedule: "MON"
    exercises:
      - "Barbell Bench Press: 5x5 @75%"
`;
    const result = compilePslSource(source);
    expect(result.valid).toBe(true);
    expect(result.materialized!.length).toBeGreaterThan(0);
    expect(result.materialized![0].date_iso).toBeDefined();
  });
});

// ============================================================================
// Calendar Extraction Tests
// ============================================================================

describe("Calendar Extraction", () => {
  it("should extract calendar entries from materialized sessions", () => {
    const source = `
language_version: "0.2"
metadata:
  id: extract-test
  name: Extract Test
calendar:
  start_date: "2026-03-02"
  end_date: "2026-03-08"
sessions:
  - id: mon
    name: Monday
    schedule: "MON"
    exercises:
      - exercise: Back Squat
        sets:
          - "3x5 @75%"
`;
    const result = compilePslSource(source);
    expect(result.valid).toBe(true);

    const entries = extractCalendarEntries(result.materialized!);
    expect(entries.length).toBeGreaterThan(0);

    const entry = entries[0];
    expect(entry.pslSessionId).toBe("mon");
    expect(entry.sessionName).toBe("Monday");
    expect(entry.dateIso).toBeDefined();
    expect(entry.exercises.length).toBe(1);
    expect(entry.exercises[0].exerciseName).toBe("Back Squat");
    expect(entry.exercises[0].sets.length).toBe(3);
  });
});

// ============================================================================
// Mapper Tests
// ============================================================================

describe("PSL Mapper", () => {
  it("should format percent_1rm intensity", () => {
    expect(formatIntensity({ type: "percent_1rm", value: 75 })).toBe("@75%");
  });

  it("should format rpe intensity", () => {
    expect(formatIntensity({ type: "rpe", value: 8 })).toBe("@RPE8");
  });

  it("should format rir intensity", () => {
    expect(formatIntensity({ type: "rir", value: 2 })).toBe("@RIR2");
  });

  it("should format load intensity", () => {
    expect(formatIntensity({ type: "load", value: 100, unit: "kg" })).toBe("100kg");
  });

  it("should format fixed reps", () => {
    expect(formatReps(5)).toBe("5");
  });

  it("should format rep range", () => {
    expect(formatReps({ min: 8, max: 12 })).toBe("8-12");
  });

  it("should format undefined reps", () => {
    expect(formatReps(undefined)).toBe("");
  });

  it("should determine intensity input mode", () => {
    expect(getIntensityInputMode({ type: "load", value: 100, unit: "kg" })).toBe("weight");
    expect(getIntensityInputMode({ type: "rpe", value: 8 })).toBe("rpe");
    expect(getIntensityInputMode({ type: "rir", value: 2 })).toBe("rir");
    expect(getIntensityInputMode({ type: "percent_1rm", value: 75 })).toBe("percent");
    expect(getIntensityInputMode(undefined)).toBe("none");
  });
});

// ============================================================================
// Date Utility Tests
// ============================================================================

describe("Date Utilities", () => {
  it("should generate a valid ISO date string for today", () => {
    const today = getDateIsoToday();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("should format today's date as 'Today'", () => {
    const today = getDateIsoToday();
    expect(formatDateForDisplay(today)).toBe("Today");
  });

  it("should format other dates as a readable string", () => {
    const result = formatDateForDisplay("2026-01-15");
    expect(result).not.toBe("Today");
    expect(result.length).toBeGreaterThan(0);
  });
});
