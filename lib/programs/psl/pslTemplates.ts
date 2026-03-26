import {
  parseDocument,
  type LoadUnit,
} from "program-specification-language";
import { buildTemplatePslSource, type TemplateSequenceOverride } from "./pslTemplateSource";
import type { TemplateExerciseRequirement } from "./templateExercises";

export type TemplateCategory =
  | "Beginner"
  | "Strength"
  | "Powerlifting"
  | "Hypertrophy"
  | "Powerbuilding"
  | "Single-Exercise";

export interface PslTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  daysPerWeek: number;
  defaultActivationWeeks?: number;
  pslSource: string;
  exerciseRequirements: TemplateExerciseRequirement[];
}

type RawPslTemplate = Omit<PslTemplate, "exerciseRequirements"> & {
  exerciseRequirementOverrides?: Record<
    string,
    Partial<TemplateExerciseRequirement>
  >;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const EXPLICIT_EXERCISE_SELECTION: Partial<TemplateExerciseRequirement> = {
  resolutionStrategy: "select_or_create",
  includeCanonicalAliasOnOverride: false,
};

const RAW_PSL_TEMPLATES: RawPslTemplate[] = [
  // ── Beginner ────────────────────────────────────────────
  {
    id: "starting-strength",
    name: "Starting Strength",
    category: "Beginner",
    description: "Classic 3-day novice linear progression. Alternating A/B workouts focused on compound lifts with 5-lb jumps per session.",
    daysPerWeek: 3,
    pslSource: `language_version: "0.2"
metadata:
  id: starting-strength
  name: Starting Strength
  description: Classic 3-day novice linear progression
units: lb
sessions:
  - id: workout-a
    name: Workout A
    schedule: "MON"
    exercises:
      - exercise: Back Squat
        rest: "3m"
        sets:
          - "3x5 @135lb; +5lb every session"
      - exercise: Barbell Bench Press
        rest: "3m"
        sets:
          - "3x5 @95lb; +5lb every session"
      - exercise: Barbell Deadlift
        rest: "3m"
        sets:
          - "1x5 @135lb; +10lb every session"
  - id: workout-b
    name: Workout B
    schedule: "WED"
    exercises:
      - exercise: Back Squat
        rest: "3m"
        sets:
          - "3x5 @135lb; +5lb every session"
      - exercise: Standing Barbell Overhead Press
        rest: "3m"
        sets:
          - "3x5 @65lb; +5lb every session"
      - exercise: Barbell Row
        rest: "3m"
        sets:
          - "3x5 @95lb; +5lb every session"
  - id: workout-a2
    name: Workout A (Friday)
    schedule: "FRI"
    exercises:
      - exercise: Back Squat
        rest: "3m"
        sets:
          - "3x5 @135lb; +5lb every session"
      - exercise: Barbell Bench Press
        rest: "3m"
        sets:
          - "3x5 @95lb; +5lb every session"
      - exercise: Barbell Deadlift
        rest: "3m"
        sets:
          - "1x5 @135lb; +10lb every session"
`,
  },
  {
    id: "stronglifts-5x5",
    name: "StrongLifts 5x5",
    category: "Beginner",
    description: "Simple 3-day program with 5x5 on all compound lifts except deadlift (1x5). Linear progression adding 5lb per session.",
    daysPerWeek: 3,
    pslSource: `language_version: "0.2"
metadata:
  id: stronglifts-5x5
  name: StrongLifts 5x5
  description: 3-day 5x5 with linear progression
units: lb
sessions:
  - id: workout-a
    name: Workout A
    schedule: "MON"
    rest_default: "3m"
    exercises:
      - "Back Squat: 5x5 @135lb; +5lb every session"
      - "Barbell Bench Press: 5x5 @95lb; +5lb every session"
      - "Barbell Row: 5x5 @95lb; +5lb every session"
  - id: workout-b
    name: Workout B
    schedule: "WED"
    rest_default: "3m"
    exercises:
      - "Back Squat: 5x5 @135lb; +5lb every session"
      - "Standing Barbell Overhead Press: 5x5 @65lb; +5lb every session"
      - "Barbell Deadlift: 1x5 @135lb; +10lb every session"
  - id: workout-a2
    name: Workout A (Friday)
    schedule: "FRI"
    rest_default: "3m"
    exercises:
      - "Back Squat: 5x5 @135lb; +5lb every session"
      - "Barbell Bench Press: 5x5 @95lb; +5lb every session"
      - "Barbell Row: 5x5 @95lb; +5lb every session"
`,
  },

  // ── Strength ────────────────────────────────────────────
  {
    id: "madcow-5x5",
    name: "Madcow 5x5",
    category: "Strength",
    description: "Intermediate 3-day program with ramping sets and weekly progression. Monday heavy, Wednesday light, Friday new PBs.",
    daysPerWeek: 3,
    pslSource: `language_version: "0.2"
metadata:
  id: madcow-5x5
  name: Madcow 5x5
  description: Intermediate weekly progression with ramping sets
units: kg
sessions:
  - id: monday-heavy
    name: Monday - Heavy
    schedule: "MON"
    rest_default: "3m"
    exercises:
      - exercise: Back Squat
        sets:
          - "4x5 @70%"
          - "1x5 @82.5%; +2.5kg every week if success"
      - exercise: Barbell Bench Press
        sets:
          - "4x5 @70%"
          - "1x5 @82.5%; +2.5kg every week if success"
      - exercise: Barbell Row
        sets:
          - "4x5 @70%"
          - "1x5 @82.5%; +2.5kg every week if success"
  - id: wednesday-light
    name: Wednesday - Light
    schedule: "WED"
    rest_default: "2m"
    exercises:
      - "Back Squat: 4x5 @65%"
      - "Standing Barbell Overhead Press: 4x5 @65%"
      - "Barbell Deadlift: 4x5 @65%"
  - id: friday-pr
    name: Friday - PB Day
    schedule: "FRI"
    rest_default: "3m"
    exercises:
      - exercise: Back Squat
        sets:
          - "4x5 @72.5%"
          - "1x3 @87.5%; +2.5kg every week if success"
      - exercise: Barbell Bench Press
        sets:
          - "4x5 @72.5%"
          - "1x3 @87.5%; +2.5kg every week if success"
      - exercise: Barbell Row
        sets:
          - "4x5 @72.5%"
          - "1x3 @87.5%; +2.5kg every week if success"
`,
  },
  {
    id: "texas-method",
    name: "Texas Method",
    category: "Strength",
    description: "3-day intermediate program: Volume Monday, Recovery Wednesday, Intensity Friday. Weekly progression on Friday PBs.",
    daysPerWeek: 3,
    pslSource: `language_version: "0.2"
metadata:
  id: texas-method
  name: Texas Method
  description: Volume/Recovery/Intensity weekly structure
units: kg
sessions:
  - id: volume-day
    name: Monday - Volume
    schedule: "MON"
    rest_default: "3m"
    exercises:
      - "Back Squat: 5x5 @80%; +2.5kg every week if success"
      - "Barbell Bench Press: 5x5 @80%; +2.5kg every week if success"
      - "Barbell Deadlift: 1x5 @85%; +2.5kg every week if success"
  - id: recovery-day
    name: Wednesday - Recovery
    schedule: "WED"
    rest_default: "2m"
    exercises:
      - "Back Squat: 3x5 @65%"
      - "Standing Barbell Overhead Press: 3x5 @70%"
      - "Back Extension: 3x10 @RIR2"
  - id: intensity-day
    name: Friday - Intensity
    schedule: "FRI"
    rest_default: "5m"
    exercises:
      - "Back Squat: 1x5 @90%; +2.5kg every week if success"
      - "Barbell Bench Press: 1x5 @90%; +2.5kg every week if success"
      - "Barbell Row: 3x5 @80%"
`,
  },

  // ── Powerlifting ────────────────────────────────────────
  {
    id: "531-bbb",
    name: "5/3/1 Boring But Big",
    category: "Powerlifting",
    description: "Jim Wendler's 5/3/1 with BBB supplemental work. 4-day program with 3-week wave progression on the main lifts plus 5x10 volume.",
    daysPerWeek: 4,
    pslSource: `language_version: "0.2"
metadata:
  id: 531-bbb
  name: 5/3/1 Boring But Big
  description: 4-day 5/3/1 with 5x10 supplemental volume
units: kg
sessions:
  - id: squat-day
    name: Monday - Squat
    schedule: "MON"
    exercises:
      - exercise: Back Squat
        rest: "3m"
        sets:
          - "1x5 @65%"
          - "1x5 @75%"
          - "1x5 @85%"
      - exercise: Back Squat
        rest: "90s"
        sets:
          - "5x10 @50%"
      - "Leg Curl: 3x10 @RIR2; rest 90s"
  - id: bench-day
    name: Tuesday - Bench
    schedule: "TUE"
    exercises:
      - exercise: Barbell Bench Press
        rest: "3m"
        sets:
          - "1x5 @65%"
          - "1x5 @75%"
          - "1x5 @85%"
      - exercise: Barbell Bench Press
        rest: "90s"
        sets:
          - "5x10 @50%"
      - "Dumbbell Row: 3x10 @RIR2; rest 90s"
  - id: deadlift-day
    name: Thursday - Deadlift
    schedule: "THU"
    exercises:
      - exercise: Barbell Deadlift
        rest: "3m"
        sets:
          - "1x5 @65%"
          - "1x5 @75%"
          - "1x5 @85%"
      - exercise: Barbell Deadlift
        rest: "90s"
        sets:
          - "5x10 @50%"
      - "Hanging Leg Raise: 3x15 @RIR2; rest 60s"
  - id: ohp-day
    name: Friday - OHP
    schedule: "FRI"
    exercises:
      - exercise: Standing Barbell Overhead Press
        rest: "3m"
        sets:
          - "1x5 @65%"
          - "1x5 @75%"
          - "1x5 @85%"
      - exercise: Standing Barbell Overhead Press
        rest: "90s"
        sets:
          - "5x10 @50%"
      - "Chin-Up: 3x10 @RIR2; rest 90s"
`,
  },
  {
    id: "smolov-jr",
    name: "Smolov Jr",
    category: "Powerlifting",
    description:
      "3-week intensive single-lift specialization cycle. Four sessions per week with escalating volume and default weekly load jumps.",
    daysPerWeek: 4,
    defaultActivationWeeks: 3,
    exerciseRequirementOverrides: {
      target_exercise: EXPLICIT_EXERCISE_SELECTION,
    },
    pslSource: `language_version: "0.2"
metadata:
  id: smolov-jr
  name: Smolov Jr
  description: 3-week intensive single-lift specialization cycle
units: kg
sessions:
  - id: day-1
    name: Day 1 - 6x6 @70%
    schedule: "MON"
    exercises:
      - exercise: Target Exercise
        rest: "3m"
        sets:
          - "6x6 @70%; +2.5kg every week"
  - id: day-2
    name: Day 2 - 7x5 @75%
    schedule: "WED"
    exercises:
      - exercise: Target Exercise
        rest: "3m"
        sets:
          - "7x5 @75%; +2.5kg every week"
  - id: day-3
    name: Day 3 - 8x4 @80%
    schedule: "FRI"
    exercises:
      - exercise: Target Exercise
        rest: "3m"
        sets:
          - "8x4 @80%; +2.5kg every week"
  - id: day-4
    name: Day 4 - 10x3 @85%
    schedule: "SAT"
    exercises:
      - exercise: Target Exercise
        rest: "3m"
        sets:
          - "10x3 @85%; +2.5kg every week"
`,
  },

  // ── Hypertrophy ─────────────────────────────────────────
  {
    id: "ppl-6day",
    name: "Push Pull Legs (6-Day)",
    category: "Hypertrophy",
    description: "Classic 6-day PPL split. Two rotations per week with compounds followed by isolation work. RPE-based autoregulation.",
    daysPerWeek: 6,
    pslSource: `language_version: "0.2"
metadata:
  id: ppl-6day
  name: Push Pull Legs (6-Day)
  description: Classic 6-day hypertrophy PPL split
units: kg
sessions:
  - id: push-a
    name: Push A
    schedule: "MON"
    rest_default: "90s"
    exercises:
      - "Barbell Bench Press: 4x6-8 @RPE8; rest 3m"
      - "Incline Dumbbell Press: 3x8-10 @RIR2; rest 2m"
      - "Dumbbell Lateral Raise: 4x12-15 @RIR1"
      - "Cable Triceps Pressdown: 3x12-15 @RIR1"
      - "Overhead Rope Triceps Extension: 3x12-15 @RIR1"
  - id: pull-a
    name: Pull A
    schedule: "TUE"
    rest_default: "90s"
    exercises:
      - "Barbell Deadlift: 3x5 @RPE8; rest 3m"
      - "Chest Supported Row: 3x8-10 @RIR2; rest 2m"
      - "Lat Pulldown: 3x10-12 @RIR2"
      - "Face Pull: 3x15 @RIR1"
      - "Barbell Curl: 3x10-12 @RIR1"
  - id: legs-a
    name: Legs A
    schedule: "WED"
    rest_default: "90s"
    exercises:
      - "Back Squat: 4x6-8 @RPE8; rest 3m"
      - "Romanian Deadlift: 3x8-10 @RIR2; rest 2m"
      - "Leg Press: 3x10-12 @RIR2; rest 2m"
      - "Leg Curl: 3x10-12 @RIR1"
      - "Standing Calf Raise: 4x10-15 @RIR1"
  - id: push-b
    name: Push B
    schedule: "THU"
    rest_default: "90s"
    exercises:
      - "Standing Barbell Overhead Press: 4x6-8 @RPE8; rest 3m"
      - "Dumbbell Bench Press: 3x8-10 @RIR2; rest 2m"
      - "Cable Fly: 3x12-15 @RIR1"
      - "Dumbbell Lateral Raise: 4x12-15 @RIR1"
      - "Dip: 3x8-12 @RIR2"
  - id: pull-b
    name: Pull B
    schedule: "FRI"
    rest_default: "90s"
    exercises:
      - "Barbell Row: 4x6-8 @RPE8; rest 3m"
      - "Weighted Pull-Up: 3x6-8 @RIR2; rest 2m"
      - "Cable Row: 3x10-12 @RIR2"
      - "Rear Delt Fly: 3x15 @RIR1"
      - "Incline Dumbbell Curl: 3x10-12 @RIR1"
  - id: legs-b
    name: Legs B
    schedule: "SAT"
    rest_default: "90s"
    exercises:
      - "Front Squat: 4x6-8 @RPE8; rest 3m"
      - "Barbell Deadlift: 3x5 @RPE7; rest 3m"
      - "Walking Lunge: 3x10-12 @RIR2; rest 2m"
      - "Seated Leg Curl: 3x10-12 @RIR1"
      - "Standing Calf Raise: 4x10-15 @RIR1"
`,
  },
  {
    id: "upper-lower-4day",
    name: "Upper/Lower (4-Day)",
    category: "Hypertrophy",
    description: "Balanced 4-day split alternating upper and lower body. Moderate volume with RIR-based autoregulation for steady growth.",
    daysPerWeek: 4,
    pslSource: `language_version: "0.2"
metadata:
  id: upper-lower-4day
  name: Upper/Lower (4-Day)
  description: Balanced 4-day upper/lower hypertrophy split
units: kg
sessions:
  - id: upper-a
    name: Upper A - Horizontal Focus
    schedule: "MON"
    rest_default: "90s"
    exercises:
      - "Barbell Bench Press: 4x6-8 @RIR2; rest 3m"
      - "Barbell Row: 4x6-8 @RIR2; rest 2m"
      - "Incline Dumbbell Press: 3x8-10 @RIR2; rest 2m"
      - "Cable Row: 3x10-12 @RIR2"
      - "Dumbbell Lateral Raise: 3x12-15 @RIR1"
      - "Barbell Curl: 3x10-12 @RIR1"
      - "Cable Triceps Pressdown: 3x10-12 @RIR1"
  - id: lower-a
    name: Lower A - Quad Focus
    schedule: "TUE"
    rest_default: "90s"
    exercises:
      - "Back Squat: 4x6-8 @RIR2; rest 3m"
      - "Romanian Deadlift: 3x8-10 @RIR2; rest 2m"
      - "Leg Press: 3x10-12 @RIR2; rest 2m"
      - "Leg Curl: 3x10-12 @RIR1"
      - "Standing Calf Raise: 4x12-15 @RIR1"
  - id: upper-b
    name: Upper B - Vertical Focus
    schedule: "THU"
    rest_default: "90s"
    exercises:
      - "Standing Barbell Overhead Press: 4x6-8 @RIR2; rest 3m"
      - "Weighted Pull-Up: 4x6-8 @RIR2; rest 2m"
      - "Dumbbell Bench Press: 3x8-10 @RIR2; rest 2m"
      - "Chest Supported Row: 3x10-12 @RIR2"
      - "Face Pull: 3x15 @RIR1"
      - "Incline Dumbbell Curl: 3x10-12 @RIR1"
      - "Overhead Rope Triceps Extension: 3x10-12 @RIR1"
  - id: lower-b
    name: Lower B - Posterior Focus
    schedule: "FRI"
    rest_default: "90s"
    exercises:
      - "Barbell Deadlift: 3x5 @RIR2; rest 3m"
      - "Front Squat: 3x8-10 @RIR2; rest 2m30s"
      - "Walking Lunge: 3x10-12 @RIR2; rest 2m"
      - "Seated Leg Curl: 3x10-12 @RIR1"
      - "Standing Calf Raise: 4x12-15 @RIR1"
`,
  },
  {
    id: "arnold-split",
    name: "Arnold Split",
    category: "Hypertrophy",
    description: "Classic 6-day bodybuilding split: Chest/Back, Shoulders/Arms, Legs, repeated twice per week. High volume for maximum hypertrophy.",
    daysPerWeek: 6,
    pslSource: `language_version: "0.2"
metadata:
  id: arnold-split
  name: Arnold Split
  description: Classic 6-day bodybuilding split
units: kg
sessions:
  - id: chest-back-a
    name: Chest & Back A
    schedule: "MON"
    rest_default: "90s"
    exercises:
      - "Barbell Bench Press: 4x8-10 @RIR2; rest 2m"
      - "Weighted Pull-Up: 4x8-10 @RIR2; rest 2m"
      - "Incline Dumbbell Press: 3x10-12 @RIR2"
      - "Barbell Row: 3x10-12 @RIR2"
      - "Cable Fly: 3x12-15 @RIR1"
      - "Lat Pulldown: 3x12-15 @RIR1"
  - id: shoulders-arms-a
    name: Shoulders & Arms A
    schedule: "TUE"
    rest_default: "75s"
    exercises:
      - "Standing Barbell Overhead Press: 4x8-10 @RIR2; rest 2m"
      - "Dumbbell Lateral Raise: 4x12-15 @RIR1"
      - "Rear Delt Fly: 3x12-15 @RIR1"
      - "Barbell Curl: 3x10-12 @RIR1"
      - "Cable Triceps Pressdown: 3x10-12 @RIR1"
      - "Incline Dumbbell Curl: 3x10-12 @RIR1"
      - "Overhead Rope Triceps Extension: 3x10-12 @RIR1"
  - id: legs-a
    name: Legs A
    schedule: "WED"
    rest_default: "90s"
    exercises:
      - "Back Squat: 4x8-10 @RIR2; rest 3m"
      - "Romanian Deadlift: 3x10-12 @RIR2; rest 2m"
      - "Leg Press: 3x10-12 @RIR2; rest 2m"
      - "Leg Curl: 3x10-12 @RIR1"
      - "Standing Calf Raise: 4x12-15 @RIR1"
  - id: chest-back-b
    name: Chest & Back B
    schedule: "THU"
    rest_default: "90s"
    exercises:
      - "Dumbbell Bench Press: 4x8-10 @RIR2; rest 2m"
      - "Chest Supported Row: 4x8-10 @RIR2; rest 2m"
      - "Cable Fly: 3x12-15 @RIR1"
      - "Cable Row: 3x12-15 @RIR1"
      - "Dip: 3x8-12 @RIR2"
  - id: shoulders-arms-b
    name: Shoulders & Arms B
    schedule: "FRI"
    rest_default: "75s"
    exercises:
      - "Dumbbell Shoulder Press: 4x8-10 @RIR2; rest 2m"
      - "Dumbbell Lateral Raise: 4x12-15 @RIR1"
      - "Face Pull: 3x15 @RIR1"
      - "Barbell Curl: 3x10-12 @RIR1"
      - "Cable Triceps Pressdown: 3x10-12 @RIR1"
      - "Hammer Curl: 3x10-12 @RIR1"
  - id: legs-b
    name: Legs B
    schedule: "SAT"
    rest_default: "90s"
    exercises:
      - "Front Squat: 4x8-10 @RIR2; rest 3m"
      - "Barbell Deadlift: 3x5 @RIR2; rest 3m"
      - "Walking Lunge: 3x10-12 @RIR2; rest 2m"
      - "Seated Leg Curl: 3x10-12 @RIR1"
      - "Standing Calf Raise: 4x12-15 @RIR1"
`,
  },
  {
    id: "phul",
    name: "PHUL",
    category: "Hypertrophy",
    description: "Power Hypertrophy Upper Lower. 4-day program combining heavy compound days with higher-rep hypertrophy days.",
    daysPerWeek: 4,
    pslSource: `language_version: "0.2"
metadata:
  id: phul
  name: PHUL
  description: Power Hypertrophy Upper Lower - 4 day split
units: kg
sessions:
  - id: upper-power
    name: Upper Power
    schedule: "MON"
    rest_default: "2m"
    exercises:
      - "Barbell Bench Press: 4x5 @RPE8; rest 3m"
      - "Barbell Row: 4x5 @RPE8; rest 3m"
      - "Standing Barbell Overhead Press: 3x6-8 @RIR2"
      - "Weighted Pull-Up: 3x6-8 @RIR2"
      - "Barbell Curl: 2x8-10 @RIR2"
      - "Cable Triceps Pressdown: 2x8-10 @RIR2"
  - id: lower-power
    name: Lower Power
    schedule: "TUE"
    rest_default: "2m"
    exercises:
      - "Back Squat: 4x5 @RPE8; rest 3m"
      - "Barbell Deadlift: 3x5 @RPE8; rest 3m"
      - "Leg Press: 3x8-10 @RIR2"
      - "Leg Curl: 3x8-10 @RIR2"
      - "Standing Calf Raise: 4x8-10 @RIR2"
  - id: upper-hypertrophy
    name: Upper Hypertrophy
    schedule: "THU"
    rest_default: "90s"
    exercises:
      - "Incline Dumbbell Press: 4x8-12 @RIR2; rest 2m"
      - "Cable Row: 4x8-12 @RIR2; rest 2m"
      - "Dumbbell Lateral Raise: 4x12-15 @RIR1"
      - "Cable Fly: 3x12-15 @RIR1"
      - "Incline Dumbbell Curl: 3x12-15 @RIR1"
      - "Overhead Rope Triceps Extension: 3x12-15 @RIR1"
  - id: lower-hypertrophy
    name: Lower Hypertrophy
    schedule: "FRI"
    rest_default: "90s"
    exercises:
      - "Front Squat: 4x8-12 @RIR2; rest 2m30s"
      - "Romanian Deadlift: 3x8-12 @RIR2; rest 2m"
      - "Walking Lunge: 3x10-12 @RIR2; rest 2m"
      - "Seated Leg Curl: 3x12-15 @RIR1"
      - "Standing Calf Raise: 4x12-15 @RIR1"
`,
  },

  // ── Powerbuilding ───────────────────────────────────────
  {
    id: "gzclp",
    name: "GZCLP",
    category: "Powerbuilding",
    description: "GZCL Linear Progression. 4-day program with tiered structure: T1 heavy compounds, T2 moderate compounds, T3 accessories.",
    daysPerWeek: 4,
    pslSource: `language_version: "0.2"
metadata:
  id: gzclp
  name: GZCLP
  description: GZCL Linear Progression with tiered structure
units: kg
sessions:
  - id: day-1
    name: Day 1 - Squat / Bench
    schedule: "MON"
    exercises:
      - exercise: Back Squat
        rest: "3m"
        sets:
          - "5x3 @85%; +2.5kg every session if success"
      - exercise: Barbell Bench Press
        rest: "2m"
        sets:
          - "3x10 @65%"
      - "Lat Pulldown: 3x15 @RIR1; rest 90s"
  - id: day-2
    name: Day 2 - OHP / Deadlift
    schedule: "TUE"
    exercises:
      - exercise: Standing Barbell Overhead Press
        rest: "3m"
        sets:
          - "5x3 @85%; +2.5kg every session if success"
      - exercise: Barbell Deadlift
        rest: "2m"
        sets:
          - "3x10 @65%"
      - "Dumbbell Row: 3x15 @RIR1; rest 90s"
  - id: day-3
    name: Day 3 - Bench / Squat
    schedule: "THU"
    exercises:
      - exercise: Barbell Bench Press
        rest: "3m"
        sets:
          - "5x3 @85%; +2.5kg every session if success"
      - exercise: Back Squat
        rest: "2m"
        sets:
          - "3x10 @65%"
      - "Lat Pulldown: 3x15 @RIR1; rest 90s"
  - id: day-4
    name: Day 4 - Deadlift / OHP
    schedule: "FRI"
    exercises:
      - exercise: Barbell Deadlift
        rest: "3m"
        sets:
          - "5x3 @85%; +5kg every session if success"
      - exercise: Standing Barbell Overhead Press
        rest: "2m"
        sets:
          - "3x10 @65%"
      - "Dumbbell Row: 3x15 @RIR1; rest 90s"
`,
  },
  {
    id: "nsuns-531-lp",
    name: "nSuns 5/3/1 LP",
    category: "Powerbuilding",
    description: "High volume 5/3/1 linear progression variant. 4-day version with 8-9 sets on the primary lift and supplemental T2 work.",
    daysPerWeek: 4,
    pslSource: `language_version: "0.2"
metadata:
  id: nsuns-531-lp
  name: nSuns 5/3/1 LP
  description: High-volume 5/3/1 linear progression
units: kg
sessions:
  - id: bench-ohp
    name: Day 1 - Bench + OHP
    schedule: "MON"
    exercises:
      - exercise: Barbell Bench Press
        rest: "2m30s"
        sets:
          - "1x5 @75%"
          - "1x3 @85%"
          - "1x1 @95%; +2.5kg every week if success"
          - "1x3 @90%"
          - "1x3 @85%"
          - "1x5 @80%"
          - "1x5 @75%"
          - "1x5 @70%"
      - exercise: Standing Barbell Overhead Press
        rest: "2m"
        sets:
          - "3x8 @65%"
          - "3x6 @70%"
  - id: squat-sumo
    name: Day 2 - Squat + Deadlift
    schedule: "TUE"
    exercises:
      - exercise: Back Squat
        rest: "2m30s"
        sets:
          - "1x5 @75%"
          - "1x3 @85%"
          - "1x1 @95%; +2.5kg every week if success"
          - "1x3 @90%"
          - "1x3 @85%"
          - "1x5 @80%"
          - "1x5 @75%"
          - "1x5 @70%"
      - exercise: Barbell Deadlift
        rest: "2m"
        sets:
          - "3x6 @70%"
          - "3x8 @65%"
  - id: ohp-bench
    name: Day 3 - OHP + Bench
    schedule: "THU"
    exercises:
      - exercise: Standing Barbell Overhead Press
        rest: "2m30s"
        sets:
          - "1x5 @75%"
          - "1x3 @85%"
          - "1x1 @95%; +1kg every week if success"
          - "1x3 @90%"
          - "1x5 @85%"
          - "1x3 @80%"
          - "1x5 @75%"
          - "1x5 @70%"
      - exercise: Barbell Bench Press
        rest: "2m"
        sets:
          - "3x8 @65%"
  - id: deadlift-squat
    name: Day 4 - Deadlift + Squat
    schedule: "FRI"
    exercises:
      - exercise: Barbell Deadlift
        rest: "2m30s"
        sets:
          - "1x5 @75%"
          - "1x3 @85%"
          - "1x1 @95%; +2.5kg every week if success"
          - "1x3 @90%"
          - "1x3 @85%"
          - "1x3 @80%"
          - "1x5 @75%"
          - "1x5 @70%"
      - exercise: Front Squat
        rest: "2m"
        sets:
          - "3x6 @65%"
          - "3x8 @60%"
`,
  },

  // ── Single-Exercise ─────────────────────────────────────
  {
    id: "linear-progression",
    name: "Linear Progression",
    category: "Single-Exercise",
    description: "Simple 3x5 linear progression scheme. Add weight every session. Suitable for any compound lift.",
    daysPerWeek: 3,
    exerciseRequirementOverrides: {
      target_exercise: EXPLICIT_EXERCISE_SELECTION,
    },
    pslSource: `language_version: "0.2"
metadata:
  id: linear-progression
  name: Linear Progression
  description: Simple 3x5 with session-to-session weight increases
units: kg
sessions:
  - id: session-a
    name: Session A
    schedule: "MON"
    exercises:
      - exercise: Target Exercise
        rest: "3m"
        sets:
          - "3x5 @60kg; +2.5kg every session if success"
  - id: session-b
    name: Session B
    schedule: "WED"
    exercises:
      - exercise: Target Exercise
        rest: "3m"
        sets:
          - "3x5 @60kg; +2.5kg every session if success"
  - id: session-c
    name: Session C
    schedule: "FRI"
    exercises:
      - exercise: Target Exercise
        rest: "3m"
        sets:
          - "3x5 @60kg; +2.5kg every session if success"
`,
  },
  {
    id: "double-progression",
    name: "Double Progression",
    category: "Single-Exercise",
    description: "Rep-range based progression. Hit the top of your rep range on all sets, then increase the weight and start from the bottom of the range.",
    daysPerWeek: 3,
    exerciseRequirementOverrides: {
      target_exercise: EXPLICIT_EXERCISE_SELECTION,
    },
    pslSource: `language_version: "0.2"
metadata:
  id: double-progression
  name: Double Progression
  description: Rep-range progression scheme - increase reps then weight
units: kg
sessions:
  - id: session-a
    name: Session A
    schedule: "MON"
    exercises:
      - exercise: Target Exercise
        rest: "2m"
        sets:
          - "3x8-12 @RIR2"
  - id: session-b
    name: Session B
    schedule: "WED"
    exercises:
      - exercise: Target Exercise
        rest: "2m"
        sets:
          - "3x8-12 @RIR2"
  - id: session-c
    name: Session C
    schedule: "FRI"
    exercises:
      - exercise: Target Exercise
        rest: "2m"
        sets:
          - "3x8-12 @RIR2"
`,
  },
  {
    id: "rpe-autoregulated",
    name: "RPE Autoregulated",
    category: "Single-Exercise",
    description: "Top set at RPE 8, backoff sets at 88%. Autoregulates intensity based on daily readiness.",
    daysPerWeek: 2,
    exerciseRequirementOverrides: {
      target_exercise: EXPLICIT_EXERCISE_SELECTION,
    },
    pslSource: `language_version: "0.2"
metadata:
  id: rpe-autoregulated
  name: RPE Autoregulated
  description: Top set + backoff with RPE-based autoregulation
units: kg
sessions:
  - id: heavy-day
    name: Heavy Day
    schedule: "MON"
    exercises:
      - exercise: Target Exercise
        rest: "3m"
        sets:
          - "1x3 @RPE8 role top"
          - "3x3 @-12% backoff"
  - id: volume-day
    name: Volume Day
    schedule: "THU"
    exercises:
      - exercise: Target Exercise
        rest: "2m30s"
        sets:
          - "4x6 @RPE7"
`,
  },
];

const TEMPLATE_SEQUENCE_OVERRIDES: Partial<Record<RawPslTemplate["id"], TemplateSequenceOverride>> = {
  "madcow-5x5": {
    repeat: true,
    items: [
      { sessionId: "monday-heavy", restAfterDays: 1 },
      { sessionId: "wednesday-light", restAfterDays: 1 },
      { sessionId: "friday-pr", restAfterDays: 2 },
    ],
  },
  "texas-method": {
    repeat: true,
    items: [
      { sessionId: "volume-day", restAfterDays: 1 },
      { sessionId: "recovery-day", restAfterDays: 1 },
      { sessionId: "intensity-day", restAfterDays: 2 },
    ],
  },
  "531-bbb": {
    repeat: true,
    items: [
      { sessionId: "squat-day", restAfterDays: 0 },
      { sessionId: "bench-day", restAfterDays: 1 },
      { sessionId: "deadlift-day", restAfterDays: 0 },
      { sessionId: "ohp-day", restAfterDays: 2 },
    ],
  },
  "smolov-jr": {
    repeat: true,
    items: [
      { sessionId: "day-1", restAfterDays: 1 },
      { sessionId: "day-2", restAfterDays: 1 },
      { sessionId: "day-3", restAfterDays: 0 },
      { sessionId: "day-4", restAfterDays: 1 },
    ],
  },
  "ppl-6day": {
    repeat: true,
    items: [
      { sessionId: "push-a", restAfterDays: 0 },
      { sessionId: "pull-a", restAfterDays: 0 },
      { sessionId: "legs-a", restAfterDays: 0 },
      { sessionId: "push-b", restAfterDays: 0 },
      { sessionId: "pull-b", restAfterDays: 0 },
      { sessionId: "legs-b", restAfterDays: 1 },
    ],
  },
  "upper-lower-4day": {
    repeat: true,
    items: [
      { sessionId: "upper-a", restAfterDays: 0 },
      { sessionId: "lower-a", restAfterDays: 1 },
      { sessionId: "upper-b", restAfterDays: 0 },
      { sessionId: "lower-b", restAfterDays: 2 },
    ],
  },
  "arnold-split": {
    repeat: true,
    items: [
      { sessionId: "chest-back-a", restAfterDays: 0 },
      { sessionId: "shoulders-arms-a", restAfterDays: 0 },
      { sessionId: "legs-a", restAfterDays: 0 },
      { sessionId: "chest-back-b", restAfterDays: 0 },
      { sessionId: "shoulders-arms-b", restAfterDays: 0 },
      { sessionId: "legs-b", restAfterDays: 1 },
    ],
  },
  phul: {
    repeat: true,
    items: [
      { sessionId: "upper-power", restAfterDays: 0 },
      { sessionId: "lower-power", restAfterDays: 1 },
      { sessionId: "upper-hypertrophy", restAfterDays: 0 },
      { sessionId: "lower-hypertrophy", restAfterDays: 2 },
    ],
  },
  gzclp: {
    repeat: true,
    items: [
      { sessionId: "day-1", restAfterDays: 0 },
      { sessionId: "day-2", restAfterDays: 1 },
      { sessionId: "day-3", restAfterDays: 0 },
      { sessionId: "day-4", restAfterDays: 2 },
    ],
  },
  "nsuns-531-lp": {
    repeat: true,
    items: [
      { sessionId: "bench-ohp", restAfterDays: 0 },
      { sessionId: "squat-sumo", restAfterDays: 1 },
      { sessionId: "ohp-bench", restAfterDays: 0 },
      { sessionId: "deadlift-squat", restAfterDays: 2 },
    ],
  },
  "rpe-autoregulated": {
    repeat: true,
    items: [
      { sessionId: "heavy-day", restAfterDays: 2 },
      { sessionId: "volume-day", restAfterDays: 3 },
    ],
  },
};

function buildTemplate(
  template: RawPslTemplate,
  targetUnit?: LoadUnit
): PslTemplate {
  const { pslSource, exerciseRequirements } = buildTemplatePslSource({
    name: template.name,
    rawPslSource: template.pslSource,
    sequenceOverride: TEMPLATE_SEQUENCE_OVERRIDES[template.id],
    exerciseRequirementOverrides: template.exerciseRequirementOverrides,
    targetUnit,
  });

  return {
    ...template,
    pslSource,
    exerciseRequirements,
  };
}

export function buildPersonalizedTemplateSource(
  templateId: string,
  exerciseNameOverrides: Record<string, string>,
  programNameOverride?: string,
  options?: {
    targetUnit?: LoadUnit;
    programDescriptionOverride?: string;
  }
): string {
  const template = RAW_PSL_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  return buildTemplatePslSource({
    name: template.name,
    rawPslSource: template.pslSource,
    sequenceOverride: TEMPLATE_SEQUENCE_OVERRIDES[template.id],
    exerciseNameOverrides,
    programNameOverride,
    programDescriptionOverride: options?.programDescriptionOverride,
    exerciseRequirementOverrides: template.exerciseRequirementOverrides,
    targetUnit: options?.targetUnit,
  }).pslSource;
}

export const PSL_TEMPLATES: PslTemplate[] = RAW_PSL_TEMPLATES.map((template) =>
  buildTemplate(template)
);

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "Beginner",
  "Strength",
  "Powerlifting",
  "Hypertrophy",
  "Powerbuilding",
  "Single-Exercise",
];

export function getTemplateById(
  id: string,
  targetUnit?: LoadUnit
): PslTemplate | undefined {
  const template = RAW_PSL_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) {
    return undefined;
  }

  if (!targetUnit) {
    return PSL_TEMPLATES.find((candidate) => candidate.id === id);
  }

  return buildTemplate(template, targetUnit);
}

export function getTemplatesByCategory(category: TemplateCategory): PslTemplate[] {
  return PSL_TEMPLATES.filter((t) => t.category === category);
}

export function searchTemplates(query: string): PslTemplate[] {
  const q = query.toLowerCase();
  return PSL_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
  );
}

export function getRecommendedActivationWeeksForPslSource(
  source: string
): number | null {
  try {
    const raw = parseDocument(source);
    if (!isRecord(raw) || !isRecord(raw.metadata)) {
      return null;
    }

    const metadataId =
      typeof raw.metadata.id === "string" ? raw.metadata.id.trim().toLowerCase() : "";
    const metadataName =
      typeof raw.metadata.name === "string"
        ? raw.metadata.name.trim().toLowerCase()
        : "";

    const matchedTemplate = RAW_PSL_TEMPLATES.find((template) => {
      const matchesId = metadataId.length > 0 && template.id.toLowerCase() === metadataId;
      const matchesName =
        metadataName.length > 0 && template.name.trim().toLowerCase() === metadataName;
      return matchesId || matchesName;
    });

    return matchedTemplate?.defaultActivationWeeks ?? null;
  } catch {
    return null;
  }
}

export function buildImportedTemplateName(
  templateId: string,
  exerciseNameOverrides: Record<string, string>
): string {
  const template = getTemplateById(templateId);
  if (!template) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  const selectedExerciseNames = template.exerciseRequirements
    .filter((requirement) => requirement.resolutionStrategy === "select_or_create")
    .map((requirement) => exerciseNameOverrides[requirement.exerciseId]?.trim() ?? "")
    .filter((name) => name.length > 0);

  const uniqueExerciseNames = Array.from(new Set(selectedExerciseNames));
  if (uniqueExerciseNames.length === 0) {
    return template.name;
  }

  return `${template.name} (${uniqueExerciseNames.join(", ")})`;
}

export function rebuildBundledTemplateSourceFromExistingProgram(
  source: string,
  targetUnit: LoadUnit
): {
  templateId: string;
  currentUnit: LoadUnit | null;
  nextSource: string;
} | null {
  let raw: unknown;
  try {
    raw = parseDocument(source);
  } catch {
    return null;
  }

  if (!isRecord(raw) || !isRecord(raw.metadata)) {
    return null;
  }

  const metadataId =
    typeof raw.metadata.id === "string" ? raw.metadata.id.trim() : "";
  if (!metadataId) {
    return null;
  }

  const template = RAW_PSL_TEMPLATES.find((candidate) => candidate.id === metadataId);
  if (!template) {
    return null;
  }

  const exerciseNameOverrides: Record<string, string> = {};
  if (Array.isArray(raw.sessions)) {
    for (const session of raw.sessions) {
      if (!isRecord(session) || !Array.isArray(session.exercises)) {
        continue;
      }

      for (const exercise of session.exercises) {
        if (
          isRecord(exercise) &&
          typeof exercise.exercise_id === "string" &&
          exercise.exercise_id.trim() &&
          typeof exercise.exercise === "string"
        ) {
          exerciseNameOverrides[exercise.exercise_id.trim()] = exercise.exercise;
        }
      }
    }
  }

  return {
    templateId: template.id,
    currentUnit: raw.units === "lb" || raw.units === "kg" ? raw.units : null,
    nextSource: buildPersonalizedTemplateSource(
      template.id,
      exerciseNameOverrides,
      typeof raw.metadata.name === "string" ? raw.metadata.name : template.name,
      {
        targetUnit,
        programDescriptionOverride:
          typeof raw.metadata.description === "string"
            ? raw.metadata.description
            : undefined,
      }
    ),
  };
}
