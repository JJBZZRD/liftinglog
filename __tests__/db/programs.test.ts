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
import { computeEndDateIso } from "../../lib/programs/psl/activationDates";
import { introspectPslSource } from "../../lib/programs/psl/pslIntrospection";
import {
  serializeFlatProgramDraftToPsl,
  type FlatProgramDraft,
} from "../../lib/programs/psl/pslGenerator";
import { deserializeFlatProgramDraftFromPsl } from "../../lib/programs/psl/pslDraftMapper";
import { PSL_TEMPLATES } from "../../lib/programs/psl/pslTemplates";
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

	  it("should compile a schedule-based template without calendar using calendarOverride", () => {
	    const source = `
language_version: "0.2"
metadata:
  id: weekly-no-calendar
  name: Weekly No Calendar
sessions:
  - id: mon
    name: Monday
    schedule: "MON"
    exercises:
      - "Barbell Bench Press: 5x5 @75%"
`;

	    const noOverride = compilePslSource(source);
	    expect(noOverride.valid).toBe(false);

	    const withOverride = compilePslSource(source, {
	      calendarOverride: { start_date: "2026-03-02", end_date: "2026-03-22" },
	    });
	    expect(withOverride.valid).toBe(true);
	    expect(withOverride.ast?.calendar?.start_date).toBe("2026-03-02");
	    expect(withOverride.ast?.calendar?.end_date).toBe("2026-03-22");
	    expect(withOverride.materialized![0].date_iso).toBeDefined();
	  });

	  it("calendarOverride should take precedence over embedded calendar", () => {
	    const source = `
language_version: "0.2"
metadata:
  id: override-test
  name: Override Test
calendar:
  start_date: "2026-01-01"
  end_date: "2026-01-07"
sessions:
  - id: mon
    name: Monday
    schedule: "MON"
    exercises:
      - "Barbell Bench Press: 5x5 @75%"
`;

	    const result = compilePslSource(source, {
	      calendarOverride: { start_date: "2026-03-02", end_date: "2026-03-22" },
	    });
	    expect(result.valid).toBe(true);
	    expect(result.ast?.calendar?.start_date).toBe("2026-03-02");
	    expect(result.ast?.calendar?.end_date).toBe("2026-03-22");
	  });

  it("should require an end date for repeating sequence programs", () => {
    const source = `
language_version: "0.3"
metadata:
  id: sequence-repeat
  name: Sequence Repeat
sessions:
  - id: day-1
    name: Day 1
    exercises:
      - "Back Squat: 3x5 @75%"
  - id: day-2
    name: Day 2
    exercises:
      - "Barbell Bench Press: 3x5 @75%"
sequence:
  repeat: true
  items:
    - session_id: day-1
      rest_after_days: 1
    - session_id: day-2
      rest_after_days: 2
`;

    const noEndDate = compilePslSource(source, {
      calendarOverride: { start_date: "2026-03-02" },
    });
    expect(noEndDate.valid).toBe(false);

    const withEndDate = compilePslSource(source, {
      calendarOverride: { start_date: "2026-03-02", end_date: "2026-03-30" },
    });
    expect(withEndDate.valid).toBe(true);
    expect(withEndDate.materialized?.[0]?.date_iso).toBeDefined();
  });

  it("should compile a non-repeating sequence program with only a start date override", () => {
    const source = `
language_version: "0.3"
metadata:
  id: sequence-once
  name: Sequence Once
sessions:
  - id: day-1
    name: Day 1
    exercises:
      - "Back Squat: 3x5 @75%"
  - id: day-2
    name: Day 2
    exercises:
      - "Barbell Bench Press: 3x5 @75%"
sequence:
  repeat: false
  items:
    - session_id: day-1
      rest_after_days: 1
    - session_id: day-2
      rest_after_days: 0
`;

    const result = compilePslSource(source, {
      calendarOverride: { start_date: "2026-03-02" },
    });
    expect(result.valid).toBe(true);
    expect(result.materialized?.map((session) => session.date_iso)).toEqual([
      "2026-03-02",
      "2026-03-04",
    ]);
  });
	});

describe("PSL Introspection", () => {
  it("should classify fixed-day programs", () => {
    const result = introspectPslSource(`
language_version: "0.3"
metadata:
  id: fixed-day
  name: Fixed Day
sessions:
  - id: day-1
    name: Day 1
    day: 1
    exercises:
      - "Back Squat: 3x5 @75%"
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timingKind).toBe("fixed_day");
    expect(result.requiresEndDateForActivation).toBe(false);
  });

  it("should classify weekday schedules", () => {
    const result = introspectPslSource(`
language_version: "0.3"
metadata:
  id: weekdays
  name: Weekdays
sessions:
  - id: a
    name: A
    schedule:
      type: weekdays
      days: [MON, WED]
    exercises:
      - "Back Squat: 3x5 @75%"
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timingKind).toBe("weekdays");
    expect(result.requiresEndDateForActivation).toBe(true);
  });

  it("should classify interval schedules", () => {
    const result = introspectPslSource(`
language_version: "0.3"
metadata:
  id: interval
  name: Interval
sessions:
  - id: a
    name: A
    schedule:
      type: interval_days
      every: 2
      start_offset_days: 0
    exercises:
      - "Back Squat: 3x5 @75%"
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timingKind).toBe("interval");
    expect(result.requiresEndDateForActivation).toBe(true);
  });

  it("should classify repeating and non-repeating sequence programs", () => {
    const repeating = introspectPslSource(`
language_version: "0.3"
metadata:
  id: seq-repeat
  name: Seq Repeat
sessions:
  - id: a
    name: A
    exercises:
      - "Back Squat: 3x5 @75%"
sequence:
  repeat: true
  items:
    - session_id: a
      rest_after_days: 1
`);
    const onePass = introspectPslSource(`
language_version: "0.3"
metadata:
  id: seq-once
  name: Seq Once
sessions:
  - id: a
    name: A
    exercises:
      - "Back Squat: 3x5 @75%"
sequence:
  repeat: false
  items:
    - session_id: a
`);

    expect(repeating.ok).toBe(true);
    expect(onePass.ok).toBe(true);
    if (!repeating.ok || !onePass.ok) return;
    expect(repeating.timingKind).toBe("sequence");
    expect(repeating.requiresEndDateForActivation).toBe(true);
    expect(onePass.timingKind).toBe("sequence");
    expect(onePass.requiresEndDateForActivation).toBe(false);
  });

  it("should classify block programs and total duration", () => {
    const result = introspectPslSource(`
language_version: "0.3"
metadata:
  id: blocks
  name: Blocks
blocks:
  - id: block-a
    duration: "4w"
    sessions:
      - id: a
        name: A
        schedule: "MON"
        exercises:
          - "Back Squat: 3x5 @75%"
  - id: block-b
    duration: "1w"
    sessions:
      - id: b
        name: B
        schedule: "WED"
        exercises:
          - "Back Squat: 2x5 @60%"
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timingKind).toBe("blocks");
    expect(result.totalBlockDays).toBe(35);
    expect(result.requiresEndDateForActivation).toBe(false);
  });

  it("should classify mixed timing programs", () => {
    const result = introspectPslSource(`
language_version: "0.3"
metadata:
  id: mixed
  name: Mixed
sessions:
  - id: a
    name: A
    day: 1
    exercises:
      - "Back Squat: 3x5 @75%"
  - id: b
    name: B
    schedule: "MON"
    exercises:
      - "Barbell Bench Press: 3x5 @75%"
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timingKind).toBe("mixed");
  });
});

describe("Flat Builder Serialization", () => {
  function compileDraft(draft: FlatProgramDraft) {
    const source = serializeFlatProgramDraftToPsl(draft);
    const introspection = introspectPslSource(source);
    const calendarOverride =
      introspection.ok && introspection.requiresEndDateForActivation
        ? { start_date: "2026-03-02", end_date: "2026-03-30" }
        : { start_date: "2026-03-02" };
    return { source, result: compilePslSource(source, { calendarOverride }) };
  }

  it("should serialize sequence drafts to valid PSL 0.3", () => {
    const draft: FlatProgramDraft = {
      name: 'Sequence "Builder"',
      description: 'Uses "quotes" safely',
      units: "kg",
      timingMode: "sequence",
      sequenceRepeat: true,
      sessions: [
        {
          clientId: "a",
          sessionId: "day-1",
          name: "Day 1",
          exercises: [{ exerciseId: 1, exerciseName: "Back Squat", sets: [{ count: 3, reps: 5 }] }],
          weekdays: [],
          fixedDay: 1,
          intervalEvery: 2,
          intervalStartOffsetDays: 0,
          intervalEndOffsetDays: null,
          restAfterDays: 1,
        },
        {
          clientId: "b",
          sessionId: "day-2",
          name: "Day 2",
          exercises: [{ exerciseId: 2, exerciseName: "Bench Press", sets: [{ count: 3, reps: 5 }] }],
          weekdays: [],
          fixedDay: 2,
          intervalEvery: 2,
          intervalStartOffsetDays: 2,
          intervalEndOffsetDays: null,
          restAfterDays: 2,
        },
      ],
    };

    const { source, result } = compileDraft(draft);
    expect(source).toContain('language_version: "0.3"');
    expect(source).toContain('description: "Uses \\"quotes\\" safely"');
    expect(source).toContain("sequence:");
    expect(result.valid).toBe(true);
  });

  it("should serialize weekday drafts with multi-day assignment", () => {
    const { result } = compileDraft({
      name: "Weekday Builder",
      units: "kg",
      timingMode: "weekdays",
      sequenceRepeat: true,
      sessions: [
        {
          clientId: "a",
          sessionId: "session-a",
          name: "Session A",
          exercises: [{ exerciseId: 1, exerciseName: "Back Squat", sets: [{ count: 3, reps: 5 }] }],
          weekdays: ["MON", "THU"],
          fixedDay: 1,
          intervalEvery: 2,
          intervalStartOffsetDays: 0,
          intervalEndOffsetDays: null,
          restAfterDays: 1,
        },
      ],
    });

    expect(result.valid).toBe(true);
  });

  it("should serialize fixed-day drafts", () => {
    const { result } = compileDraft({
      name: "Fixed Day Builder",
      units: "kg",
      timingMode: "fixed_day",
      sequenceRepeat: true,
      sessions: [
        {
          clientId: "a",
          sessionId: "day-1",
          name: "Program Day 1",
          exercises: [{ exerciseId: 1, exerciseName: "Back Squat", sets: [{ count: 3, reps: 5 }] }],
          weekdays: [],
          fixedDay: 3,
          intervalEvery: 2,
          intervalStartOffsetDays: 0,
          intervalEndOffsetDays: null,
          restAfterDays: 1,
        },
      ],
    });

    expect(result.valid).toBe(true);
  });

  it("should serialize interval-day drafts", () => {
    const { result } = compileDraft({
      name: "Interval Builder",
      units: "kg",
      timingMode: "interval_days",
      sequenceRepeat: true,
      sessions: [
        {
          clientId: "a",
          sessionId: "session-a",
          name: "Session A",
          exercises: [{ exerciseId: 1, exerciseName: "Back Squat", sets: [{ count: 3, reps: 5 }] }],
          weekdays: [],
          fixedDay: 1,
          intervalEvery: 3,
          intervalStartOffsetDays: 1,
          intervalEndOffsetDays: null,
          restAfterDays: 1,
        },
      ],
    });

    expect(result.valid).toBe(true);
  });

  it("should deserialize simple sequence PSL back into a builder draft", () => {
    const source = serializeFlatProgramDraftToPsl({
      name: "Round Trip",
      description: "Builder editable",
      units: "kg",
      timingMode: "sequence",
      sequenceRepeat: true,
      sessions: [
        {
          clientId: "a",
          sessionId: "day-1",
          name: "Day 1",
          exercises: [
            { exerciseId: 1, exerciseName: "Back Squat", sets: [{ count: 3, reps: 5 }] },
          ],
          weekdays: [],
          fixedDay: 1,
          intervalEvery: 2,
          intervalStartOffsetDays: 0,
          intervalEndOffsetDays: null,
          restAfterDays: 1,
        },
        {
          clientId: "b",
          sessionId: "day-2",
          name: "Day 2",
          exercises: [
            { exerciseId: 2, exerciseName: "Bench Press", sets: [{ count: 2, reps: 8 }] },
          ],
          weekdays: [],
          fixedDay: 2,
          intervalEvery: 2,
          intervalStartOffsetDays: 0,
          intervalEndOffsetDays: null,
          restAfterDays: 2,
        },
      ],
    });

    const draft = deserializeFlatProgramDraftFromPsl(source);
    expect(draft).not.toBeNull();
    expect(draft?.timingMode).toBe("sequence");
    expect(draft?.sequenceRepeat).toBe(true);
    expect(draft?.sessions[0].restAfterDays).toBe(1);
    expect(draft?.sessions[0].exercises[0].sets[0]).toMatchObject({
      count: 3,
      reps: 5,
    });
  });

  it("should deserialize simple weekday PSL back into a builder draft", () => {
    const source = serializeFlatProgramDraftToPsl({
      name: "Weekdays Round Trip",
      units: "kg",
      timingMode: "weekdays",
      sequenceRepeat: true,
      sessions: [
        {
          clientId: "a",
          sessionId: "session-a",
          name: "Session A",
          exercises: [
            { exerciseId: 1, exerciseName: "Back Squat", sets: [{ count: 3, reps: 5 }] },
          ],
          weekdays: ["MON", "THU"],
          fixedDay: 1,
          intervalEvery: 2,
          intervalStartOffsetDays: 0,
          intervalEndOffsetDays: null,
          restAfterDays: 1,
        },
      ],
    });

    const draft = deserializeFlatProgramDraftFromPsl(source);
    expect(draft).not.toBeNull();
    expect(draft?.timingMode).toBe("weekdays");
    expect(draft?.sessions[0].weekdays).toEqual(["MON", "THU"]);
  });

  it("should reject PSL that would lose unsupported builder data", () => {
    const source = `
language_version: "0.3"
metadata:
  id: unsupported
  name: Unsupported
units: kg
sessions:
  - id: day-1
    name: Day 1
    day: 1
    exercises:
      - exercise: Back Squat
        sets:
          - count: 3
            reps: 5
            rest_seconds: 120
`;

    expect(deserializeFlatProgramDraftFromPsl(source)).toBeNull();
  });
});

describe("Bundled Templates", () => {
  it("should compile every bundled template under PSL 0.3", () => {
    PSL_TEMPLATES.forEach((template) => {
      const introspection = introspectPslSource(template.pslSource);
      const calendarOverride =
        introspection.ok && introspection.hasBlocks
          ? { start_date: "2026-03-02" }
          : introspection.ok && introspection.requiresEndDateForActivation
            ? { start_date: "2026-03-02", end_date: "2026-05-31" }
            : undefined;
      const result = compilePslSource(
        template.pslSource,
        calendarOverride ? { calendarOverride } : {}
      );
      expect(result.valid).toBe(true);
    });
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

  it("computeEndDateIso should compute an inclusive end date", () => {
    expect(computeEndDateIso("2026-03-02", 1)).toBe("2026-03-08");
    expect(computeEndDateIso("2026-03-02", 2)).toBe("2026-03-15");
  });

  it("computeEndDateIso should throw for invalid weeks", () => {
    expect(() => computeEndDateIso("2026-03-02", 0)).toThrow();
  });
});
