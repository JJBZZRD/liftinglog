/**
 * Exercise-level progression templates.
 *
 * These are programs applicable to individual exercises (e.g. Smolov Jr, 5/3/1).
 * They define a fixed sequence of sets/reps/intensities across sessions.
 */

export type ExerciseProgressionTemplate = {
  id: string;
  name: string;
  description: string;
  /** How many sessions does one cycle span? */
  cycleSessions: number;
  /** The sessions themselves */
  sessions: ExerciseTemplateSession[];
};

export type ExerciseTemplateSession = {
  label: string;
  sets: ExerciseTemplateSet[];
};

export type ExerciseTemplateSet = {
  reps: number;
  /** Percentage of working weight / 1RM; null = bodyweight/user-defined */
  percentOfMax?: number;
  isWarmup?: boolean;
};

// ============================================================================
// Templates
// ============================================================================

const smolovJr: ExerciseProgressionTemplate = {
  id: "smolov-jr",
  name: "Smolov Jr",
  description: "3-week high-frequency peaking cycle. 4 sessions/week with escalating volume.",
  cycleSessions: 12,
  sessions: [
    // Week 1
    { label: "W1D1", sets: Array(6).fill({ reps: 6, percentOfMax: 70 }) },
    { label: "W1D2", sets: Array(7).fill({ reps: 5, percentOfMax: 75 }) },
    { label: "W1D3", sets: Array(8).fill({ reps: 4, percentOfMax: 80 }) },
    { label: "W1D4", sets: Array(10).fill({ reps: 3, percentOfMax: 85 }) },
    // Week 2 (+2.5-5kg)
    { label: "W2D1", sets: Array(6).fill({ reps: 6, percentOfMax: 70 }) },
    { label: "W2D2", sets: Array(7).fill({ reps: 5, percentOfMax: 75 }) },
    { label: "W2D3", sets: Array(8).fill({ reps: 4, percentOfMax: 80 }) },
    { label: "W2D4", sets: Array(10).fill({ reps: 3, percentOfMax: 85 }) },
    // Week 3 (+2.5-5kg)
    { label: "W3D1", sets: Array(6).fill({ reps: 6, percentOfMax: 70 }) },
    { label: "W3D2", sets: Array(7).fill({ reps: 5, percentOfMax: 75 }) },
    { label: "W3D3", sets: Array(8).fill({ reps: 4, percentOfMax: 80 }) },
    { label: "W3D4", sets: Array(10).fill({ reps: 3, percentOfMax: 85 }) },
  ],
};

const fiveThreeOne: ExerciseProgressionTemplate = {
  id: "531",
  name: "5/3/1",
  description: "Jim Wendler's 5/3/1. 4-week cycle with progressive overload.",
  cycleSessions: 4,
  sessions: [
    {
      label: "5s Week",
      sets: [
        { reps: 5, percentOfMax: 65 },
        { reps: 5, percentOfMax: 75 },
        { reps: 5, percentOfMax: 85 }, // AMRAP
      ],
    },
    {
      label: "3s Week",
      sets: [
        { reps: 3, percentOfMax: 70 },
        { reps: 3, percentOfMax: 80 },
        { reps: 3, percentOfMax: 90 }, // AMRAP
      ],
    },
    {
      label: "1s Week",
      sets: [
        { reps: 5, percentOfMax: 75 },
        { reps: 3, percentOfMax: 85 },
        { reps: 1, percentOfMax: 95 }, // AMRAP
      ],
    },
    {
      label: "Deload",
      sets: [
        { reps: 5, percentOfMax: 40 },
        { reps: 5, percentOfMax: 50 },
        { reps: 5, percentOfMax: 60 },
      ],
    },
  ],
};

const texasMethod: ExerciseProgressionTemplate = {
  id: "texas-method",
  name: "Texas Method",
  description: "3 sessions/week: Volume, Recovery, Intensity. Weekly progression.",
  cycleSessions: 3,
  sessions: [
    {
      label: "Volume Day",
      sets: [
        { reps: 5, percentOfMax: 90 },
        { reps: 5, percentOfMax: 90 },
        { reps: 5, percentOfMax: 90 },
        { reps: 5, percentOfMax: 90 },
        { reps: 5, percentOfMax: 90 },
      ],
    },
    {
      label: "Recovery Day",
      sets: [
        { reps: 5, percentOfMax: 70 },
        { reps: 5, percentOfMax: 70 },
      ],
    },
    {
      label: "Intensity Day",
      sets: [
        { reps: 5, percentOfMax: 100 }, // New PR attempt
      ],
    },
  ],
};

const linearPeriodization: ExerciseProgressionTemplate = {
  id: "linear-periodization",
  name: "Linear Periodization (4-week)",
  description: "Classic 4-week block: hypertrophy -> strength -> peak -> deload.",
  cycleSessions: 4,
  sessions: [
    {
      label: "Hypertrophy",
      sets: Array(4).fill({ reps: 10, percentOfMax: 65 }),
    },
    {
      label: "Strength",
      sets: Array(4).fill({ reps: 6, percentOfMax: 77.5 }),
    },
    {
      label: "Peak",
      sets: Array(3).fill({ reps: 3, percentOfMax: 87.5 }),
    },
    {
      label: "Deload",
      sets: Array(3).fill({ reps: 8, percentOfMax: 55 }),
    },
  ],
};

// ============================================================================
// Export
// ============================================================================

export const EXERCISE_PROGRESSION_TEMPLATES: ExerciseProgressionTemplate[] = [
  smolovJr,
  fiveThreeOne,
  texasMethod,
  linearPeriodization,
];

export function getExerciseTemplateById(id: string): ExerciseProgressionTemplate | undefined {
  return EXERCISE_PROGRESSION_TEMPLATES.find((t) => t.id === id);
}
