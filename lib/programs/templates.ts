/**
 * Built-in program templates.
 *
 * Each template defines a complete program: days, exercises, prescriptions,
 * and progressions. Exercises are matched by name during import.
 */

import type { ProgramPrescriptionV1, TargetSpec } from "./prescription";

export type TemplateProgressionDef = {
  type: "kg_per_session" | "percent_per_session" | "double_progression" | "autoreg_rpe";
  value: number;
  cadence: string;
  cap_kg?: number;
};

export type TemplateExerciseDef = {
  name: string;
  muscle_group?: string;
  equipment?: string;
  prescription: ProgramPrescriptionV1;
  progression?: TemplateProgressionDef;
};

export type TemplateDayDef = {
  schedule: "weekly" | "interval";
  day_of_week?: number;
  interval_days?: number;
  note: string;
  exercises: TemplateExerciseDef[];
};

export type ProgramTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  days: TemplateDayDef[];
};

// ============================================================================
// Helper to build prescriptions
// ============================================================================

function work(sets: number, reps: number | [number, number], target?: TargetSpec): ProgramPrescriptionV1 {
  const repsSpec =
    typeof reps === "number"
      ? ({ type: "fixed" as const, value: reps })
      : ({ type: "range" as const, min: reps[0], max: reps[1] });

  return {
    version: 1,
    blocks: [{ kind: "work", sets, reps: repsSpec, target }],
  };
}

function withWarmup(
  warmupSets: number,
  workSets: number,
  reps: number,
  target?: TargetSpec
): ProgramPrescriptionV1 {
  return {
    version: 1,
    blocks: [
      { kind: "warmup", style: "ramp", sets: warmupSets, reps },
      { kind: "work", sets: workSets, reps: { type: "fixed", value: reps }, target },
    ],
  };
}

// ============================================================================
// Templates
// ============================================================================

const startingStrength: ProgramTemplate = {
  id: "starting-strength",
  name: "Starting Strength A/B",
  description: "Classic novice linear progression. Alternates two workouts, 3x/week.",
  category: "Beginner",
  days: [
    {
      schedule: "interval",
      interval_days: 2,
      note: "Workout A",
      exercises: [
        { name: "Squat", muscle_group: "Legs", equipment: "Barbell", prescription: withWarmup(2, 3, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Bench Press", muscle_group: "Chest", equipment: "Barbell", prescription: withWarmup(2, 3, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Deadlift", muscle_group: "Back", equipment: "Barbell", prescription: withWarmup(2, 1, 5), progression: { type: "kg_per_session", value: 5, cadence: "every_session" } },
      ],
    },
    {
      schedule: "interval",
      interval_days: 2,
      note: "Workout B",
      exercises: [
        { name: "Squat", muscle_group: "Legs", equipment: "Barbell", prescription: withWarmup(2, 3, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Overhead Press", muscle_group: "Shoulders", equipment: "Barbell", prescription: withWarmup(2, 3, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Barbell Row", muscle_group: "Back", equipment: "Barbell", prescription: withWarmup(2, 3, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
      ],
    },
  ],
};

const stronglifts5x5: ProgramTemplate = {
  id: "stronglifts-5x5",
  name: "StrongLifts 5x5",
  description: "Simple 5x5 program with linear progression. Alternates A/B, 3x/week.",
  category: "Beginner",
  days: [
    {
      schedule: "interval",
      interval_days: 2,
      note: "Workout A",
      exercises: [
        { name: "Squat", muscle_group: "Legs", equipment: "Barbell", prescription: work(5, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Bench Press", muscle_group: "Chest", equipment: "Barbell", prescription: work(5, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Barbell Row", muscle_group: "Back", equipment: "Barbell", prescription: work(5, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
      ],
    },
    {
      schedule: "interval",
      interval_days: 2,
      note: "Workout B",
      exercises: [
        { name: "Squat", muscle_group: "Legs", equipment: "Barbell", prescription: work(5, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Overhead Press", muscle_group: "Shoulders", equipment: "Barbell", prescription: work(5, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Deadlift", muscle_group: "Back", equipment: "Barbell", prescription: work(1, 5), progression: { type: "kg_per_session", value: 5, cadence: "every_session" } },
      ],
    },
  ],
};

const upperLower4Day: ProgramTemplate = {
  id: "upper-lower-4",
  name: "Upper/Lower 4-Day",
  description: "4-day split: two upper-body and two lower-body days per week.",
  category: "Intermediate",
  days: [
    {
      schedule: "weekly",
      day_of_week: 1,
      note: "Upper A",
      exercises: [
        { name: "Bench Press", muscle_group: "Chest", equipment: "Barbell", prescription: work(4, 6), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Barbell Row", muscle_group: "Back", equipment: "Barbell", prescription: work(4, 6), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Overhead Press", muscle_group: "Shoulders", equipment: "Barbell", prescription: work(3, 8), progression: { type: "kg_per_session", value: 1.25, cadence: "every_session" } },
        { name: "Bicep Curl", muscle_group: "Arms", equipment: "Dumbbell", prescription: work(3, [8, 12]), progression: { type: "double_progression", value: 2.5, cadence: "every_session" } },
        { name: "Tricep Pushdown", muscle_group: "Arms", equipment: "Cable", prescription: work(3, [8, 12]), progression: { type: "double_progression", value: 2.5, cadence: "every_session" } },
      ],
    },
    {
      schedule: "weekly",
      day_of_week: 2,
      note: "Lower A",
      exercises: [
        { name: "Squat", muscle_group: "Legs", equipment: "Barbell", prescription: work(4, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Romanian Deadlift", muscle_group: "Legs", equipment: "Barbell", prescription: work(3, 8), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Leg Press", muscle_group: "Legs", equipment: "Machine", prescription: work(3, [8, 12]), progression: { type: "double_progression", value: 5, cadence: "every_session" } },
        { name: "Calf Raise", muscle_group: "Legs", equipment: "Machine", prescription: work(4, [10, 15]), progression: { type: "double_progression", value: 5, cadence: "every_session" } },
      ],
    },
    {
      schedule: "weekly",
      day_of_week: 4,
      note: "Upper B",
      exercises: [
        { name: "Overhead Press", muscle_group: "Shoulders", equipment: "Barbell", prescription: work(4, 6), progression: { type: "kg_per_session", value: 1.25, cadence: "every_session" } },
        { name: "Pull-Up", muscle_group: "Back", equipment: "Bodyweight", prescription: work(4, [5, 10]), progression: { type: "double_progression", value: 0, cadence: "every_session" } },
        { name: "Dumbbell Bench Press", muscle_group: "Chest", equipment: "Dumbbell", prescription: work(3, [8, 12]), progression: { type: "double_progression", value: 2.5, cadence: "every_session" } },
        { name: "Face Pull", muscle_group: "Shoulders", equipment: "Cable", prescription: work(3, [12, 15]) },
      ],
    },
    {
      schedule: "weekly",
      day_of_week: 5,
      note: "Lower B",
      exercises: [
        { name: "Deadlift", muscle_group: "Back", equipment: "Barbell", prescription: work(3, 5), progression: { type: "kg_per_session", value: 5, cadence: "every_session" } },
        { name: "Bulgarian Split Squat", muscle_group: "Legs", equipment: "Dumbbell", prescription: work(3, [8, 12]), progression: { type: "double_progression", value: 2.5, cadence: "every_session" } },
        { name: "Leg Curl", muscle_group: "Legs", equipment: "Machine", prescription: work(3, [10, 12]), progression: { type: "double_progression", value: 2.5, cadence: "every_session" } },
        { name: "Calf Raise", muscle_group: "Legs", equipment: "Machine", prescription: work(4, [10, 15]), progression: { type: "double_progression", value: 5, cadence: "every_session" } },
      ],
    },
  ],
};

const ppl3Day: ProgramTemplate = {
  id: "ppl-3",
  name: "PPL (3-Day)",
  description: "Push/Pull/Legs once per week. Suitable for beginners or a maintenance split.",
  category: "Beginner",
  days: [
    {
      schedule: "weekly",
      day_of_week: 1,
      note: "Push",
      exercises: [
        { name: "Bench Press", muscle_group: "Chest", equipment: "Barbell", prescription: work(4, 6), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Overhead Press", muscle_group: "Shoulders", equipment: "Barbell", prescription: work(3, 8), progression: { type: "kg_per_session", value: 1.25, cadence: "every_session" } },
        { name: "Dumbbell Lateral Raise", muscle_group: "Shoulders", equipment: "Dumbbell", prescription: work(3, [10, 15]) },
        { name: "Tricep Pushdown", muscle_group: "Arms", equipment: "Cable", prescription: work(3, [8, 12]), progression: { type: "double_progression", value: 2.5, cadence: "every_session" } },
      ],
    },
    {
      schedule: "weekly",
      day_of_week: 3,
      note: "Pull",
      exercises: [
        { name: "Barbell Row", muscle_group: "Back", equipment: "Barbell", prescription: work(4, 6), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Pull-Up", muscle_group: "Back", equipment: "Bodyweight", prescription: work(3, [5, 10]), progression: { type: "double_progression", value: 0, cadence: "every_session" } },
        { name: "Face Pull", muscle_group: "Shoulders", equipment: "Cable", prescription: work(3, [12, 15]) },
        { name: "Bicep Curl", muscle_group: "Arms", equipment: "Dumbbell", prescription: work(3, [8, 12]), progression: { type: "double_progression", value: 2.5, cadence: "every_session" } },
      ],
    },
    {
      schedule: "weekly",
      day_of_week: 5,
      note: "Legs",
      exercises: [
        { name: "Squat", muscle_group: "Legs", equipment: "Barbell", prescription: work(4, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Romanian Deadlift", muscle_group: "Legs", equipment: "Barbell", prescription: work(3, 8), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Leg Press", muscle_group: "Legs", equipment: "Machine", prescription: work(3, [8, 12]), progression: { type: "double_progression", value: 5, cadence: "every_session" } },
        { name: "Calf Raise", muscle_group: "Legs", equipment: "Machine", prescription: work(4, [10, 15]) },
      ],
    },
  ],
};

const ppl6Day: ProgramTemplate = {
  id: "ppl-6",
  name: "PPL (6-Day)",
  description: "Push/Pull/Legs twice per week. Higher frequency for intermediate lifters.",
  category: "Intermediate",
  days: [
    {
      schedule: "weekly", day_of_week: 1, note: "Push A",
      exercises: [
        { name: "Bench Press", muscle_group: "Chest", equipment: "Barbell", prescription: work(4, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Overhead Press", muscle_group: "Shoulders", equipment: "Barbell", prescription: work(3, 8), progression: { type: "kg_per_session", value: 1.25, cadence: "every_session" } },
        { name: "Dumbbell Lateral Raise", muscle_group: "Shoulders", equipment: "Dumbbell", prescription: work(3, [10, 15]) },
        { name: "Tricep Pushdown", muscle_group: "Arms", equipment: "Cable", prescription: work(3, [8, 12]) },
      ],
    },
    {
      schedule: "weekly", day_of_week: 2, note: "Pull A",
      exercises: [
        { name: "Barbell Row", muscle_group: "Back", equipment: "Barbell", prescription: work(4, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Pull-Up", muscle_group: "Back", equipment: "Bodyweight", prescription: work(3, [5, 10]) },
        { name: "Face Pull", muscle_group: "Shoulders", equipment: "Cable", prescription: work(3, [12, 15]) },
        { name: "Bicep Curl", muscle_group: "Arms", equipment: "Dumbbell", prescription: work(3, [8, 12]) },
      ],
    },
    {
      schedule: "weekly", day_of_week: 3, note: "Legs A",
      exercises: [
        { name: "Squat", muscle_group: "Legs", equipment: "Barbell", prescription: work(4, 5), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Romanian Deadlift", muscle_group: "Legs", equipment: "Barbell", prescription: work(3, 8), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Leg Press", muscle_group: "Legs", equipment: "Machine", prescription: work(3, [8, 12]) },
        { name: "Calf Raise", muscle_group: "Legs", equipment: "Machine", prescription: work(4, [10, 15]) },
      ],
    },
    {
      schedule: "weekly", day_of_week: 4, note: "Push B",
      exercises: [
        { name: "Overhead Press", muscle_group: "Shoulders", equipment: "Barbell", prescription: work(4, 5), progression: { type: "kg_per_session", value: 1.25, cadence: "every_session" } },
        { name: "Dumbbell Bench Press", muscle_group: "Chest", equipment: "Dumbbell", prescription: work(3, [8, 12]), progression: { type: "double_progression", value: 2.5, cadence: "every_session" } },
        { name: "Dumbbell Lateral Raise", muscle_group: "Shoulders", equipment: "Dumbbell", prescription: work(3, [10, 15]) },
        { name: "Tricep Pushdown", muscle_group: "Arms", equipment: "Cable", prescription: work(3, [8, 12]) },
      ],
    },
    {
      schedule: "weekly", day_of_week: 5, note: "Pull B",
      exercises: [
        { name: "Deadlift", muscle_group: "Back", equipment: "Barbell", prescription: work(3, 5), progression: { type: "kg_per_session", value: 5, cadence: "every_session" } },
        { name: "Pull-Up", muscle_group: "Back", equipment: "Bodyweight", prescription: work(3, [5, 10]) },
        { name: "Face Pull", muscle_group: "Shoulders", equipment: "Cable", prescription: work(3, [12, 15]) },
        { name: "Bicep Curl", muscle_group: "Arms", equipment: "Dumbbell", prescription: work(3, [8, 12]) },
      ],
    },
    {
      schedule: "weekly", day_of_week: 6, note: "Legs B",
      exercises: [
        { name: "Squat", muscle_group: "Legs", equipment: "Barbell", prescription: work(3, 8), progression: { type: "kg_per_session", value: 2.5, cadence: "every_session" } },
        { name: "Bulgarian Split Squat", muscle_group: "Legs", equipment: "Dumbbell", prescription: work(3, [8, 12]), progression: { type: "double_progression", value: 2.5, cadence: "every_session" } },
        { name: "Leg Curl", muscle_group: "Legs", equipment: "Machine", prescription: work(3, [10, 12]) },
        { name: "Calf Raise", muscle_group: "Legs", equipment: "Machine", prescription: work(4, [10, 15]) },
      ],
    },
  ],
};

const doubleProgressionAccessory: ProgramTemplate = {
  id: "double-progression-accessory",
  name: "Double Progression Accessory",
  description: "Single-exercise template: 3 sets, 8-12 rep range. Increase weight when all sets hit 12.",
  category: "Single Exercise",
  days: [
    {
      schedule: "interval",
      interval_days: 3,
      note: "Accessory Day",
      exercises: [
        {
          name: "Dumbbell Curl",
          muscle_group: "Arms",
          equipment: "Dumbbell",
          prescription: work(3, [8, 12]),
          progression: { type: "double_progression", value: 2.5, cadence: "every_session" },
        },
      ],
    },
  ],
};

const topSetBackoffRPE: ProgramTemplate = {
  id: "top-set-backoff-rpe",
  name: "Top Set + Backoff (RPE)",
  description: "Single-exercise template: 1 top set @RPE 8, then 3 backoff sets @RPE 7.",
  category: "Single Exercise",
  days: [
    {
      schedule: "interval",
      interval_days: 4,
      note: "RPE Training Day",
      exercises: [
        {
          name: "Bench Press",
          muscle_group: "Chest",
          equipment: "Barbell",
          prescription: {
            version: 1,
            notes: "1 top set @RPE 8, then 3 backoff sets @RPE 7",
            blocks: [
              { kind: "warmup", style: "ramp", sets: 3, reps: 5 },
              { kind: "work", sets: 1, reps: { type: "fixed", value: 3 }, target: { type: "rpe", value: 8 } },
              { kind: "work", sets: 3, reps: { type: "fixed", value: 5 }, target: { type: "rpe", value: 7 } },
            ],
          },
          progression: { type: "autoreg_rpe", value: 8, cadence: "every_session" },
        },
      ],
    },
  ],
};

// ============================================================================
// Export all templates
// ============================================================================

export const ALL_TEMPLATES: ProgramTemplate[] = [
  startingStrength,
  stronglifts5x5,
  upperLower4Day,
  ppl3Day,
  ppl6Day,
  doubleProgressionAccessory,
  topSetBackoffRPE,
];

export function getTemplateById(id: string): ProgramTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}
