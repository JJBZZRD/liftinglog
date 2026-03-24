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
  serializeBlockProgramDraftToPsl,
  serializeFlatProgramDraftToPsl,
  type BlockProgramDraft,
  type FlatProgramDraft,
} from "../../lib/programs/psl/pslGenerator";
import {
  deserializeBlockProgramDraftFromPsl,
  deserializeFlatProgramDraftFromPsl,
} from "../../lib/programs/psl/pslDraftMapper";
import {
  buildSessionCompletionFromSnapshot,
  isPristineProgramCalendarEntry,
} from "../../lib/programs/psl/programRuntimeHelpers";
import {
  buildPersonalizedTemplateSource,
  PSL_TEMPLATES,
  rebuildBundledTemplateSourceFromExistingProgram,
} from "../../lib/programs/psl/pslTemplates";
import {
  formatIntensity,
  formatReps,
  formatSetSummary,
  getIntensityDefaultValue,
  getIntensityInputMode,
  getIntensityUnit,
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
            rest_before_seconds: 30
`;

    expect(deserializeFlatProgramDraftFromPsl(source)).toBeNull();
  });
});

describe("Block Builder Serialization", () => {
  function compileBlockDraft(draft: BlockProgramDraft) {
    const source = serializeBlockProgramDraftToPsl(draft);
    return {
      source,
      result: compilePslSource(source, {
        calendarOverride: { start_date: "2026-03-02" },
      }),
    };
  }

  it("should serialize structured blocks to valid PSL 0.3", () => {
    const { source, result } = compileBlockDraft({
      name: "Phased Builder",
      description: "Two blocks",
      units: "kg",
      blocks: [
        {
          clientId: "block-a",
          blockId: "accumulation",
          name: "Accumulation",
          durationValue: 4,
          durationUnit: "weeks",
          deload: false,
          timingMode: "weekdays",
          sessions: [
            {
              clientId: "session-a",
              sessionId: "upper-a",
              name: "Upper A",
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
        },
        {
          clientId: "block-b",
          blockId: "deload",
          name: "Deload",
          durationValue: 7,
          durationUnit: "days",
          deload: true,
          timingMode: "interval_days",
          sessions: [
            {
              clientId: "session-b",
              sessionId: "deload-a",
              name: "Deload A",
              exercises: [
                { exerciseId: 2, exerciseName: "Bench Press", sets: [{ count: 2, reps: 5 }] },
              ],
              weekdays: [],
              fixedDay: 1,
              intervalEvery: 3,
              intervalStartOffsetDays: 1,
              intervalEndOffsetDays: 6,
              restAfterDays: 1,
            },
          ],
        },
      ],
    });

    expect(source).toContain('language_version: "0.3"');
    expect(source).toContain("blocks:");
    expect(source).toContain("deload: true");
    expect(result.valid).toBe(true);
  });

  it("should deserialize simple block PSL back into a builder draft", () => {
    const source = serializeBlockProgramDraftToPsl({
      name: "Block Round Trip",
      units: "kg",
      blocks: [
        {
          clientId: "block-a",
          blockId: "accumulation",
          name: "Accumulation",
          durationValue: 3,
          durationUnit: "weeks",
          deload: false,
          timingMode: "fixed_day",
          sessions: [
            {
              clientId: "session-a",
              sessionId: "day-1",
              name: "Program Day 1",
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
          ],
        },
        {
          clientId: "block-b",
          blockId: "deload",
          name: "Deload",
          durationValue: 1,
          durationUnit: "weeks",
          deload: true,
          timingMode: "weekdays",
          sessions: [
            {
              clientId: "session-b",
              sessionId: "recovery",
              name: "Recovery",
              exercises: [
                { exerciseId: 2, exerciseName: "Bench Press", sets: [{ count: 2, reps: 6 }] },
              ],
              weekdays: ["WED"],
              fixedDay: 1,
              intervalEvery: 2,
              intervalStartOffsetDays: 0,
              intervalEndOffsetDays: null,
              restAfterDays: 1,
            },
          ],
        },
      ],
    });

    const draft = deserializeBlockProgramDraftFromPsl(source);
    expect(draft).not.toBeNull();
    expect(draft?.blocks).toHaveLength(2);
    expect(draft?.blocks[0].timingMode).toBe("fixed_day");
    expect(draft?.blocks[1].deload).toBe(true);
    expect(draft?.blocks[1].sessions[0].weekdays).toEqual(["WED"]);
  });

  it("should reject incompatible block PSL for guided editing", () => {
    const source = `
language_version: "0.3"
metadata:
  id: incompatible-block
  name: Incompatible Block
blocks:
  - id: block-a
    duration: "4w"
    sessions:
      - id: a
        name: A
        schedule: "MON"
        exercises:
          - exercise: Back Squat
            sets:
              - count: 3
                reps: 5
                intensity:
                  type: percent_1rm
                  value: 75
                rest_before_seconds: 30
`;

    expect(deserializeBlockProgramDraftFromPsl(source)).toBeNull();
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

describe("Template Unit Conversion", () => {
  it("should build bundled template sources in the selected default unit", () => {
    const source = buildPersonalizedTemplateSource(
      "starting-strength",
      {},
      "Starting Strength",
      { targetUnit: "kg" }
    );

    expect(source).toContain("units: kg");
    expect(source).toContain('          - "3x5 @42.5kg; +2.5kg every session"');
    expect(source).toContain('          - "1x5 @60kg; +5kg every session"');
  });

  it("should rebuild existing bundled-template programs into the selected unit", () => {
    const source = buildPersonalizedTemplateSource(
      "linear-progression",
      { target_exercise: "Barbell Bench Press" },
      "Linear Progression (Bench)",
      { targetUnit: "kg" }
    );

    const rebuilt = rebuildBundledTemplateSourceFromExistingProgram(source, "lb");
    expect(rebuilt).not.toBeNull();
    expect(rebuilt?.templateId).toBe("linear-progression");
    expect(rebuilt?.currentUnit).toBe("kg");
    expect(rebuilt?.nextSource).toContain("units: lb");
    expect(rebuilt?.nextSource).toContain('name: "Linear Progression (Bench)"');
    expect(rebuilt?.nextSource).toContain('exercise: "Barbell Bench Press"');
    expect(rebuilt?.nextSource).toContain(
      '          - "3x5 @130lb; +5lb every session if success"'
    );
  });
});

describe("Progression Runtime", () => {
  function getFirstLoadAt(
    source: string,
    occurrenceIndex: number,
    completions?: NonNullable<Parameters<typeof compilePslSource>[1]>["completions"]
  ) {
    const result = compilePslSource(source, {
      calendarOverride: { start_date: "2026-03-02", end_date: "2026-03-12" },
      completions,
    });
    expect(result.valid).toBe(true);
    const intensity = result.materialized?.[occurrenceIndex]?.exercises[0]?.sets[0]?.intensity;
    expect(intensity?.type).toBe("load");
    if (!intensity || intensity.type !== "load") {
      throw new Error("Expected load intensity");
    }
    return intensity.value;
  }

  it("should increment the next occurrence after session success", () => {
    const source = `
language_version: "0.3"
metadata:
  id: success-increment
  name: Success Increment
sessions:
  - id: day-a
    name: Day A
    schedule:
      type: interval_days
      every: 2
      start_offset_days: 0
    exercises:
      - exercise: Back Squat
        sets:
          - count: 1
            reps: 5
            intensity:
              type: load
              value: 100
              unit: kg
            progression:
              type: increment
              cadence:
                type: sessions
                every: 1
              when:
                type: session_success
                equals: true
              by: 2.5
`;

    expect(getFirstLoadAt(source, 1)).toBe(100);
    expect(
      getFirstLoadAt(source, 1, [
        { session_id: "day-a", date_iso: "2026-03-02", success: true },
      ])
    ).toBe(102.5);
  });

  it("should keep the same load after a failed session_success check", () => {
    const source = `
language_version: "0.3"
metadata:
  id: failed-success
  name: Failed Success
sessions:
  - id: day-a
    name: Day A
    schedule:
      type: interval_days
      every: 2
      start_offset_days: 0
    exercises:
      - exercise: Back Squat
        sets:
          - count: 1
            reps: 5
            intensity:
              type: load
              value: 100
              unit: kg
            progression:
              type: increment
              cadence:
                type: sessions
                every: 1
              when:
                type: session_success
                equals: true
              by: 2.5
`;

    expect(
      getFirstLoadAt(source, 1, [
        { session_id: "day-a", date_iso: "2026-03-02", success: false },
      ])
    ).toBe(100);
  });

  it("should only increment metric_vs_target progression when the achieved load meets target", () => {
    const source = `
language_version: "0.3"
metadata:
  id: metric-load
  name: Metric Load
sessions:
  - id: day-a
    name: Day A
    schedule:
      type: interval_days
      every: 2
      start_offset_days: 0
    exercises:
      - exercise: Back Squat
        sets:
          - count: 1
            reps: 5
            intensity:
              type: load
              value: 100
              unit: kg
            progression:
              type: increment
              cadence:
                type: sessions
                every: 1
              when:
                type: metric_vs_target
                metric: load
                op: ">="
                target: value
              by: 2.5
`;

    expect(
      getFirstLoadAt(source, 1, [
        {
          session_id: "day-a",
          date_iso: "2026-03-02",
          exercises: [
            {
              exercise: "Back Squat",
              sets: [{ index: 1, load: { value: 100, unit: "kg" } }],
            },
          ],
        },
      ])
    ).toBe(102.5);

    expect(
      getFirstLoadAt(source, 1, [
        {
          session_id: "day-a",
          date_iso: "2026-03-02",
          exercises: [
            {
              exercise: "Back Squat",
              sets: [{ index: 1, load: { value: 97.5, unit: "kg" } }],
            },
          ],
        },
      ])
    ).toBe(100);
  });

  it("should apply weekly increments on the next eligible week", () => {
    const source = `
language_version: "0.3"
metadata:
  id: weekly-load
  name: Weekly Load
sessions:
  - id: monday
    name: Monday
    schedule:
      type: weekdays
      days: [MON]
    exercises:
      - exercise: Bench Press
        sets:
          - count: 1
            reps: 5
            intensity:
              type: load
              value: 80
              unit: kg
            progression:
              type: weekly_increment
              by: 2.5
`;

    const result = compilePslSource(source, {
      calendarOverride: { start_date: "2026-03-02", end_date: "2026-03-23" },
      completions: [{ session_id: "monday", date_iso: "2026-03-02", success: true }],
    });
    expect(result.valid).toBe(true);
    const first = result.materialized?.[0]?.exercises[0]?.sets[0]?.intensity;
    const second = result.materialized?.[1]?.exercises[0]?.sets[0]?.intensity;
    expect(first?.type).toBe("load");
    expect(second?.type).toBe("load");
    if (!first || first.type !== "load" || !second || second.type !== "load") {
      throw new Error("Expected load intensity");
    }
    expect(first.value).toBe(80);
    expect(second.value).toBe(82.5);
  });
});

describe("Program Runtime Helpers", () => {
  it("should mark completion success false when a session is force-completed", () => {
    const entry = {
      calendar: {
        id: 1,
        programId: 1,
        pslSessionId: "day-a",
        sessionName: "Day A",
        dateIso: "2026-03-02",
        sequence: 1,
        status: "complete",
        completedAt: null,
        completionOverrideExerciseIdsJson: JSON.stringify([101]),
      },
      exercises: [
        {
          exercise: {
            id: 101,
            calendarId: 1,
            exerciseName: "Back Squat",
            exerciseId: null,
            workoutExerciseId: null,
            orderIndex: 0,
            prescribedSetsJson: null,
            status: "complete",
          },
          sets: [
            {
              id: 1001,
              calendarExerciseId: 101,
              setIndex: 1,
              prescribedReps: "5",
              prescribedIntensityJson: JSON.stringify({
                type: "load",
                value: 100,
                unit: "kg",
              }),
              prescribedRole: null,
              actualWeight: 100,
              actualReps: 5,
              actualRpe: null,
              isUserAdded: false,
              isLogged: true,
              setId: 9001,
              loggedAt: "2026-03-02T10:00:00.000Z",
              linkedSetWeightKg: 100,
              linkedSetReps: 5,
              linkedSetRpe: null,
              linkedSetRir: null,
            },
          ],
        },
      ],
    } as unknown as Parameters<typeof buildSessionCompletionFromSnapshot>[0];

    const completion = buildSessionCompletionFromSnapshot(entry, "kg");
    expect(completion).not.toBeNull();
    expect(completion?.success).toBe(false);
    expect(completion?.exercises?.[0]?.sets?.[0]).toMatchObject({
      index: 1,
      reps_completed: 5,
    });
  });

  it("should identify pristine future entries correctly", () => {
    const pristineEntry = {
      calendar: {
        status: "pending",
        completionOverrideExerciseIdsJson: null,
      },
      exercises: [
        {
          exercise: {
            status: "pending",
            workoutExerciseId: null,
          },
          sets: [
            {
              isUserAdded: false,
              isLogged: false,
              setId: null,
              actualWeight: null,
              actualReps: null,
              actualRpe: null,
              loggedAt: null,
            },
          ],
        },
      ],
    } as unknown as Parameters<typeof isPristineProgramCalendarEntry>[0];

    const startedEntry = {
      calendar: {
        status: "pending",
        completionOverrideExerciseIdsJson: null,
      },
      exercises: [
        {
          exercise: {
            status: "partial",
            workoutExerciseId: 44,
          },
          sets: [
            {
              isUserAdded: false,
              isLogged: true,
              setId: 9001,
              actualWeight: 100,
              actualReps: 5,
              actualRpe: null,
              loggedAt: "2026-03-02T10:00:00.000Z",
            },
          ],
        },
      ],
    } as unknown as Parameters<typeof isPristineProgramCalendarEntry>[0];

    expect(isPristineProgramCalendarEntry(pristineEntry)).toBe(true);
    expect(isPristineProgramCalendarEntry(startedEntry)).toBe(false);
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

  it("should format load intensity in the active display unit", () => {
    expect(formatIntensity({ type: "load", value: 100, unit: "kg" }, "lb")).toBe(
      "220.5lb"
    );
    expect(
      formatIntensity(
        {
          type: "percent_1rm",
          value: 70,
          plus_load: { value: 2.5, unit: "kg" },
        },
        "lb"
      )
    ).toBe("@70%+5.5lb");
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

  it("should derive program input defaults in the active display unit", () => {
    const intensity = { type: "load", value: 100, unit: "kg" } as const;
    expect(getIntensityDefaultValue(intensity, "lb")).toBe("220.5");
    expect(getIntensityUnit(intensity, "lb")).toBe("lb");
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
