/**
 * Test Data Seeder
 *
 * Creates a "Test_data" exercise with 6 months of 5/3/1 style workouts
 * for development and testing purposes.
 *
 * Only runs in __DEV__ mode and is idempotent.
 */
import { eq } from "drizzle-orm";
import { db } from "./connection";
import { exercises, sets, workouts } from "./schema";
import { detectAndRecordPRs } from "../pr/detection";

const TEST_EXERCISE_NAME = "Test_data";

// 5/3/1 program constants
const STARTING_TRAINING_MAX_KG = 100;
const TM_INCREMENT_PER_CYCLE_KG = 2.5;
const WEEKS_PER_CYCLE = 4;
const SESSIONS_PER_WEEK = 3; // Mon/Wed/Fri pattern

// Seed date: 6 months before "today"
// Using a fixed reference to ensure deterministic output
const REFERENCE_DATE = new Date("2026-01-08"); // Current date from user context
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SIX_MONTHS_AGO = new Date(REFERENCE_DATE.getTime() - 180 * MS_PER_DAY);

// Week structure for 5/3/1
type WeekType = "5s" | "3s" | "531" | "deload";

interface SetDefinition {
  percentTM: number; // Percentage of training max
  targetReps: number; // Target reps (AMRAP sets will exceed this)
  isAmrap?: boolean; // Is this an AMRAP set?
}

// 5/3/1 weekly set structures
const WEEK_SETS: Record<WeekType, SetDefinition[]> = {
  "5s": [
    { percentTM: 0.65, targetReps: 5 }, // 65% x 5
    { percentTM: 0.75, targetReps: 5 }, // 75% x 5
    { percentTM: 0.85, targetReps: 5, isAmrap: true }, // 85% x 5+ (AMRAP)
  ],
  "3s": [
    { percentTM: 0.7, targetReps: 3 }, // 70% x 3
    { percentTM: 0.8, targetReps: 3 }, // 80% x 3
    { percentTM: 0.9, targetReps: 3, isAmrap: true }, // 90% x 3+ (AMRAP)
  ],
  "531": [
    { percentTM: 0.75, targetReps: 5 }, // 75% x 5
    { percentTM: 0.85, targetReps: 3 }, // 85% x 3
    { percentTM: 0.95, targetReps: 1, isAmrap: true }, // 95% x 1+ (AMRAP)
  ],
  deload: [
    { percentTM: 0.4, targetReps: 5 }, // 40% x 5
    { percentTM: 0.5, targetReps: 5 }, // 50% x 5
    { percentTM: 0.6, targetReps: 5 }, // 60% x 5
  ],
};

// Deterministic pseudo-random number generator (Mulberry32)
function createRng(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Round to nearest 2.5kg
function roundToNearest2_5(value: number): number {
  return Math.round(value / 2.5) * 2.5;
}

/**
 * Seed test data exercise if in development mode
 * Idempotent: will not duplicate data on subsequent calls
 */
export async function seedTestDataExercise(): Promise<void> {
  // Only run in development
  if (!__DEV__) {
    return;
  }

  console.log("[SeedTestData] Checking for existing test data...");

  // Check if test exercise already exists
  const existingExercise = await db
    .select()
    .from(exercises)
    .where(eq(exercises.name, TEST_EXERCISE_NAME))
    .limit(1);

  let exerciseId: number;

  if (existingExercise.length > 0) {
    exerciseId = existingExercise[0].id;

    // Check if we already have workouts for this exercise
    const existingSets = await db
      .select()
      .from(sets)
      .where(eq(sets.exerciseId, exerciseId))
      .limit(1);

    if (existingSets.length > 0) {
      console.log("[SeedTestData] Test data already exists, skipping seed.");
      return;
    }
  } else {
    // Create the test exercise
    const result = await db
      .insert(exercises)
      .values({
        name: TEST_EXERCISE_NAME,
        description: "Test exercise with 6 months of 5/3/1 data for chart development",
        muscleGroup: "Chest",
        equipment: "Barbell",
        isBodyweight: false,
        createdAt: SIX_MONTHS_AGO.getTime(),
      })
      .run();
    exerciseId = result.lastInsertRowId as number;
    console.log(`[SeedTestData] Created test exercise with ID: ${exerciseId}`);
  }

  // Generate workouts
  const rng = createRng(42); // Fixed seed for determinism
  const weekTypes: WeekType[] = ["5s", "3s", "531", "deload"];

  // Generate session dates (Mon/Wed/Fri pattern)
  const sessionDates: Date[] = [];
  let currentDate = new Date(SIX_MONTHS_AGO);

  // Find first Monday
  while (currentDate.getDay() !== 1) {
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Generate dates until we reach reference date
  while (currentDate.getTime() < REFERENCE_DATE.getTime()) {
    const dayOfWeek = currentDate.getDay();
    // Mon=1, Wed=3, Fri=5
    if (dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5) {
      // Add some realistic variation: sometimes skip a day (5% chance)
      if (rng() > 0.05) {
        sessionDates.push(new Date(currentDate));
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(`[SeedTestData] Generating ${sessionDates.length} workout sessions...`);

  // Track week and cycle for progression
  let sessionCount = 0;
  let currentCycle = 0;

  for (const sessionDate of sessionDates) {
    // Determine which week in the cycle (0-3)
    const weekInCycle = Math.floor(sessionCount / SESSIONS_PER_WEEK) % WEEKS_PER_CYCLE;
    const weekType = weekTypes[weekInCycle];

    // Calculate training max for this cycle
    currentCycle = Math.floor(sessionCount / (SESSIONS_PER_WEEK * WEEKS_PER_CYCLE));
    const trainingMax = STARTING_TRAINING_MAX_KG + currentCycle * TM_INCREMENT_PER_CYCLE_KG;

    // Create workout
    const workoutTime = sessionDate.getTime() + 18 * 60 * 60 * 1000; // 6 PM
    const workoutResult = await db
      .insert(workouts)
      .values({
        startedAt: workoutTime,
        completedAt: workoutTime + 60 * 60 * 1000, // 1 hour workout
        note: null,
      })
      .run();
    const workoutId = workoutResult.lastInsertRowId as number;

    // Add warm-up sets
    const warmupSets = [
      { percentTM: 0.4, reps: 5 },
      { percentTM: 0.5, reps: 5 },
    ];

    let setIndex = 1;

    for (const warmup of warmupSets) {
      const weight = roundToNearest2_5(trainingMax * warmup.percentTM);
      const performedAt = workoutTime + setIndex * 3 * 60 * 1000; // 3 min between sets
      const setResult = await db.insert(sets).values({
        workoutId,
        exerciseId,
        setIndex,
        weightKg: weight,
        reps: warmup.reps,
        isWarmup: true,
        performedAt,
      }).run();
      const setId = setResult.lastInsertRowId as number;
      
      // Detect and record PR for this set
      await detectAndRecordPRs(setId, exerciseId, weight, warmup.reps, performedAt);
      
      setIndex++;
    }

    // Add main sets based on week type
    const mainSets = WEEK_SETS[weekType];
    for (const setDef of mainSets) {
      const weight = roundToNearest2_5(trainingMax * setDef.percentTM);
      let reps = setDef.targetReps;

      // For AMRAP sets, add some realistic variation
      if (setDef.isAmrap) {
        // AMRAP reps typically 2-7 above minimum, with fatigue and deload considerations
        let bonusReps: number;
        if (weekType === "5s") {
          bonusReps = Math.floor(rng() * 5) + 2; // 5+2 to 5+6 = 7-11 reps
        } else if (weekType === "3s") {
          bonusReps = Math.floor(rng() * 4) + 2; // 3+2 to 3+5 = 5-8 reps
        } else {
          bonusReps = Math.floor(rng() * 3) + 1; // 1+1 to 1+3 = 2-4 reps
        }
        reps += bonusReps;
      }

      const performedAt = workoutTime + setIndex * 3 * 60 * 1000;
      const setResult = await db.insert(sets).values({
        workoutId,
        exerciseId,
        setIndex,
        weightKg: weight,
        reps,
        isWarmup: false,
        performedAt,
      }).run();
      const setId = setResult.lastInsertRowId as number;
      
      // Detect and record PR for this set
      await detectAndRecordPRs(setId, exerciseId, weight, reps, performedAt);
      
      setIndex++;
    }

    // Occasionally add back-off sets (30% chance, not on deload)
    if (weekType !== "deload" && rng() < 0.3) {
      const backoffWeight = roundToNearest2_5(trainingMax * 0.6);
      const backoffReps = 8 + Math.floor(rng() * 5); // 8-12 reps
      const performedAt = workoutTime + setIndex * 3 * 60 * 1000;
      const setResult = await db.insert(sets).values({
        workoutId,
        exerciseId,
        setIndex,
        weightKg: backoffWeight,
        reps: backoffReps,
        isWarmup: false,
        performedAt,
        note: "Back-off set",
      }).run();
      const setId = setResult.lastInsertRowId as number;
      
      // Detect and record PR for this set
      await detectAndRecordPRs(setId, exerciseId, backoffWeight, backoffReps, performedAt);
    }

    sessionCount++;
  }

  console.log(
    `[SeedTestData] Seeded ${sessionCount} workouts over ${currentCycle + 1} cycles`
  );
  console.log(
    `[SeedTestData] Training max progressed from ${STARTING_TRAINING_MAX_KG}kg to ${STARTING_TRAINING_MAX_KG + currentCycle * TM_INCREMENT_PER_CYCLE_KG}kg`
  );
}
