/**
 * Test Data Seeder
 *
 * Creates test exercises with various training protocols:
 * - Test_531: ongoing 5/3/1 style workouts (bench press)
 * - Test_Smolov: repeated Smolov Jr cycles (squat)
 * - Test_Sheiko: Sheiko-style high volume training (deadlift)
 * - Test_Linear: simple linear progression (overhead press)
 *
 * Only runs in __DEV__ mode and appends missing seeded history up to today.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "./connection";
import { exercises, sets, workoutExercises, workouts } from "./schema";
import { detectAndRecordPBs } from "../pb/detection";

function startOfLocalDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

// Preserve the original seed anchors so reruns extend the same deterministic histories.
const TODAY_START = startOfLocalDay(new Date());
const SEED_END_EXCLUSIVE = addDays(TODAY_START, 1);
const SIX_MONTHS_START = new Date(2025, 6, 12);
const THREE_MONTHS_START = new Date(2025, 9, 10);

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

// Helper to create or get exercise
async function getOrCreateExercise(
  name: string,
  description: string,
  muscleGroup: string,
  equipment: string,
  createdAt: number
): Promise<number> {
  const existing = await db
    .select()
    .from(exercises)
    .where(eq(exercises.name, name))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const result = await db
    .insert(exercises)
    .values({
      name,
      description,
      muscleGroup,
      equipment,
      isBodyweight: false,
      createdAt,
    })
    .run();

  return result.lastInsertRowId as number;
}

async function getLatestSeededSetTime(exerciseId: number): Promise<number | null> {
  const latestSet = await db
    .select({ performedAt: sets.performedAt })
    .from(sets)
    .where(eq(sets.exerciseId, exerciseId))
    .orderBy(desc(sets.performedAt), desc(sets.id))
    .limit(1);

  return latestSet[0]?.performedAt ?? null;
}

function shouldCreateSession(latestSeededTime: number | null, workoutTime: number): boolean {
  return latestSeededTime === null || workoutTime > latestSeededTime;
}

function isSeededThroughToday(latestSeededTime: number | null): boolean {
  return latestSeededTime !== null && latestSeededTime >= TODAY_START.getTime();
}

// Helper to create a workout session with sets
async function createWorkoutSession(
  exerciseId: number,
  workoutTime: number,
  sessionSets: Array<{ weight: number; reps: number; isWarmup?: boolean; note?: string }>
): Promise<void> {
  const workoutResult = await db
    .insert(workouts)
    .values({
      startedAt: workoutTime,
      completedAt: workoutTime + 60 * 60 * 1000,
      note: null,
    })
    .run();
  const workoutId = workoutResult.lastInsertRowId as number;

  const workoutExerciseResult = await db
    .insert(workoutExercises)
    .values({
      workoutId,
      exerciseId,
      orderIndex: 1,
      performedAt: workoutTime,
      completedAt: workoutTime + 60 * 60 * 1000,
    })
    .run();
  const workoutExerciseId = workoutExerciseResult.lastInsertRowId as number;

  let setIndex = 1;
  for (const setData of sessionSets) {
    const performedAt = workoutTime + setIndex * 3 * 60 * 1000;
    const setResult = await db
      .insert(sets)
      .values({
        workoutId,
        exerciseId,
        workoutExerciseId,
        setIndex,
        weightKg: setData.weight,
        reps: setData.reps,
        isWarmup: setData.isWarmup ?? false,
        performedAt,
        note: setData.note ?? null,
      })
      .run();

    await detectAndRecordPBs(
      setResult.lastInsertRowId as number,
      exerciseId,
      setData.weight,
      setData.reps,
      performedAt
    );
    setIndex++;
  }
}

// ============================================================================
// 5/3/1 PROGRAM
// ============================================================================

type WeekType531 = "5s" | "3s" | "531" | "deload";

const WEEK_SETS_531: Record<WeekType531, Array<{ percent: number; reps: number; isAmrap?: boolean }>> = {
  "5s": [
    { percent: 0.65, reps: 5 },
    { percent: 0.75, reps: 5 },
    { percent: 0.85, reps: 5, isAmrap: true },
  ],
  "3s": [
    { percent: 0.70, reps: 3 },
    { percent: 0.80, reps: 3 },
    { percent: 0.90, reps: 3, isAmrap: true },
  ],
  "531": [
    { percent: 0.75, reps: 5 },
    { percent: 0.85, reps: 3 },
    { percent: 0.95, reps: 1, isAmrap: true },
  ],
  deload: [
    { percent: 0.40, reps: 5 },
    { percent: 0.50, reps: 5 },
    { percent: 0.60, reps: 5 },
  ],
};

async function seed531Program(): Promise<void> {
  const exerciseId = await getOrCreateExercise(
    "Test_531",
    "5/3/1 Bench Press - ongoing classic Wendler programming",
    "Chest",
    "Barbell",
    SIX_MONTHS_START.getTime()
  );

  const latestSeededTime = await getLatestSeededSetTime(exerciseId);
  if (isSeededThroughToday(latestSeededTime)) {
    console.log("[SeedTestData] Test_531 already reaches today, skipping.");
    return;
  }

  console.log("[SeedTestData] Seeding Test_531 (5/3/1 Bench Press)...");

  const rng = createRng(42);
  const weekTypes: WeekType531[] = ["5s", "3s", "531", "deload"];
  const startingTM = 100;
  const tmIncrement = 2.5;

  let currentDate = new Date(SIX_MONTHS_START);
  while (currentDate.getDay() !== 1) currentDate.setDate(currentDate.getDate() + 1);

  let sessionCount = 0;
  let insertedCount = 0;

  while (currentDate.getTime() < SEED_END_EXCLUSIVE.getTime()) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5) {
      if (rng() > 0.05) {
        const weekInCycle = Math.floor(sessionCount / 3) % 4;
        const weekType = weekTypes[weekInCycle];
        const cycle = Math.floor(sessionCount / 12);
        const trainingMax = startingTM + cycle * tmIncrement;

        const workoutTime = currentDate.getTime() + 18 * 60 * 60 * 1000;
        const sessionSets: Array<{ weight: number; reps: number; isWarmup?: boolean }> = [];

        // Warmup
        sessionSets.push({ weight: roundToNearest2_5(trainingMax * 0.4), reps: 5, isWarmup: true });
        sessionSets.push({ weight: roundToNearest2_5(trainingMax * 0.5), reps: 5, isWarmup: true });

        // Main sets
        for (const setDef of WEEK_SETS_531[weekType]) {
          let reps = setDef.reps;
          if (setDef.isAmrap) {
            const bonus = weekType === "5s" ? Math.floor(rng() * 5) + 2 :
                         weekType === "3s" ? Math.floor(rng() * 4) + 2 :
                         Math.floor(rng() * 3) + 1;
            reps += bonus;
          }
          sessionSets.push({ weight: roundToNearest2_5(trainingMax * setDef.percent), reps });
        }

        if (shouldCreateSession(latestSeededTime, workoutTime)) {
          await createWorkoutSession(exerciseId, workoutTime, sessionSets);
          insertedCount++;
        }
        sessionCount++;
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(`[SeedTestData] Test_531: ${insertedCount} sessions inserted.`);
}

// ============================================================================
// SMOLOV JR PROGRAM (3-week intensive cycle, repeated)
// ============================================================================

const SMOLOV_WEEKS = [
  // Week 1
  [
    { day: 1, sets: 6, reps: 6, percent: 0.70 },
    { day: 3, sets: 7, reps: 5, percent: 0.75 },
    { day: 5, sets: 8, reps: 4, percent: 0.80 },
    { day: 6, sets: 10, reps: 3, percent: 0.85 },
  ],
  // Week 2 (+2.5-5kg)
  [
    { day: 1, sets: 6, reps: 6, percent: 0.70, addKg: 5 },
    { day: 3, sets: 7, reps: 5, percent: 0.75, addKg: 5 },
    { day: 5, sets: 8, reps: 4, percent: 0.80, addKg: 5 },
    { day: 6, sets: 10, reps: 3, percent: 0.85, addKg: 5 },
  ],
  // Week 3 (+5-10kg)
  [
    { day: 1, sets: 6, reps: 6, percent: 0.70, addKg: 10 },
    { day: 3, sets: 7, reps: 5, percent: 0.75, addKg: 10 },
    { day: 5, sets: 8, reps: 4, percent: 0.80, addKg: 10 },
    { day: 6, sets: 10, reps: 3, percent: 0.85, addKg: 10 },
  ],
];

async function seedSmolovProgram(): Promise<void> {
  const exerciseId = await getOrCreateExercise(
    "Test_Smolov",
    "Smolov Jr Squat - High frequency/volume squat specialization",
    "Legs",
    "Barbell",
    THREE_MONTHS_START.getTime()
  );

  const latestSeededTime = await getLatestSeededSetTime(exerciseId);
  if (isSeededThroughToday(latestSeededTime)) {
    console.log("[SeedTestData] Test_Smolov already reaches today, skipping.");
    return;
  }

  console.log("[SeedTestData] Seeding Test_Smolov (Smolov Jr Squat)...");

  const rng = createRng(123);
  const starting1RM = 140; // Starting estimated 1RM

  let currentDate = new Date(THREE_MONTHS_START);
  while (currentDate.getDay() !== 1) currentDate.setDate(currentDate.getDate() + 1);

  let cycleCount = 0;
  let insertedCount = 0;

  while (currentDate.getTime() < SEED_END_EXCLUSIVE.getTime()) {
    // Run a 3-week Smolov Jr cycle
    const cycle1RM = starting1RM + cycleCount * 10; // +10kg per cycle

    for (let week = 0; week < 3 && currentDate.getTime() < SEED_END_EXCLUSIVE.getTime(); week++) {
      const weekData = SMOLOV_WEEKS[week];

      for (const session of weekData) {
        // Find the correct day
        while (currentDate.getDay() !== session.day && currentDate.getTime() < SEED_END_EXCLUSIVE.getTime()) {
          currentDate.setDate(currentDate.getDate() + 1);
        }

        if (currentDate.getTime() >= SEED_END_EXCLUSIVE.getTime()) break;

        // Skip occasionally (3% chance)
        if (rng() < 0.03) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        const workoutTime = currentDate.getTime() + 17 * 60 * 60 * 1000;
        const baseWeight = cycle1RM * session.percent + (session.addKg ?? 0);
        const weight = roundToNearest2_5(baseWeight);

        const sessionSets: Array<{ weight: number; reps: number; isWarmup?: boolean }> = [];

        // Warmups
        sessionSets.push({ weight: roundToNearest2_5(weight * 0.4), reps: 5, isWarmup: true });
        sessionSets.push({ weight: roundToNearest2_5(weight * 0.6), reps: 3, isWarmup: true });
        sessionSets.push({ weight: roundToNearest2_5(weight * 0.8), reps: 2, isWarmup: true });

        // Work sets
        for (let s = 0; s < session.sets; s++) {
          // Slight rep variation on last sets (fatigue)
          const actualReps = s >= session.sets - 2 && rng() < 0.3 ? session.reps - 1 : session.reps;
          sessionSets.push({ weight, reps: Math.max(1, actualReps) });
        }

        if (shouldCreateSession(latestSeededTime, workoutTime)) {
          await createWorkoutSession(exerciseId, workoutTime, sessionSets);
          insertedCount++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    // Rest week between cycles
    currentDate.setDate(currentDate.getDate() + 7);
    cycleCount++;
  }

  console.log(`[SeedTestData] Test_Smolov: ${insertedCount} sessions inserted over ${cycleCount} cycles.`);
}

// ============================================================================
// SHEIKO-STYLE PROGRAM (High volume, moderate intensity)
// ============================================================================

const SHEIKO_SESSIONS = [
  // Day 1: Medium
  [
    { percent: 0.50, reps: 5, sets: 1 },
    { percent: 0.60, reps: 4, sets: 1 },
    { percent: 0.70, reps: 3, sets: 2 },
    { percent: 0.75, reps: 3, sets: 3 },
    { percent: 0.70, reps: 4, sets: 2 },
  ],
  // Day 2: Light
  [
    { percent: 0.50, reps: 5, sets: 1 },
    { percent: 0.60, reps: 5, sets: 1 },
    { percent: 0.65, reps: 5, sets: 4 },
    { percent: 0.60, reps: 6, sets: 2 },
  ],
  // Day 3: Heavy
  [
    { percent: 0.50, reps: 5, sets: 1 },
    { percent: 0.60, reps: 4, sets: 1 },
    { percent: 0.70, reps: 3, sets: 1 },
    { percent: 0.80, reps: 2, sets: 2 },
    { percent: 0.85, reps: 2, sets: 3 },
    { percent: 0.80, reps: 3, sets: 2 },
    { percent: 0.75, reps: 4, sets: 2 },
  ],
  // Day 4: Speed/Technique
  [
    { percent: 0.50, reps: 3, sets: 2 },
    { percent: 0.60, reps: 3, sets: 3 },
    { percent: 0.65, reps: 3, sets: 5 },
  ],
];

async function seedSheikoProgram(): Promise<void> {
  const exerciseId = await getOrCreateExercise(
    "Test_Sheiko",
    "Sheiko-style Deadlift - High volume Russian powerlifting method",
    "Back",
    "Barbell",
    SIX_MONTHS_START.getTime()
  );

  const latestSeededTime = await getLatestSeededSetTime(exerciseId);
  if (isSeededThroughToday(latestSeededTime)) {
    console.log("[SeedTestData] Test_Sheiko already reaches today, skipping.");
    return;
  }

  console.log("[SeedTestData] Seeding Test_Sheiko (Sheiko-style Deadlift)...");

  const rng = createRng(456);
  const startingMax = 180;
  const weeklyIncrement = 1.25; // Slower progression

  let currentDate = new Date(SIX_MONTHS_START);
  while (currentDate.getDay() !== 1) currentDate.setDate(currentDate.getDate() + 1);

  let weekCount = 0;
  let insertedCount = 0;

  while (currentDate.getTime() < SEED_END_EXCLUSIVE.getTime()) {
    // 4 sessions per week: Mon, Tue, Thu, Sat
    const sessionDays = [1, 2, 4, 6];
    const currentMax = startingMax + weekCount * weeklyIncrement;

    for (let i = 0; i < sessionDays.length && currentDate.getTime() < SEED_END_EXCLUSIVE.getTime(); i++) {
      while (currentDate.getDay() !== sessionDays[i] && currentDate.getTime() < SEED_END_EXCLUSIVE.getTime()) {
        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (currentDate.getTime() >= SEED_END_EXCLUSIVE.getTime()) break;

      // Skip occasionally (8% chance - life happens)
      if (rng() < 0.08) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const workoutTime = currentDate.getTime() + 18 * 60 * 60 * 1000;
      const sessionTemplate = SHEIKO_SESSIONS[i % SHEIKO_SESSIONS.length];
      const sessionSets: Array<{ weight: number; reps: number; isWarmup?: boolean }> = [];

      for (const block of sessionTemplate) {
        const weight = roundToNearest2_5(currentMax * block.percent);
        for (let s = 0; s < block.sets; s++) {
          // Mark first sets at lower percentages as warmups
          const isWarmup = block.percent <= 0.55 && s === 0;
          sessionSets.push({ weight, reps: block.reps, isWarmup });
        }
      }

      if (shouldCreateSession(latestSeededTime, workoutTime)) {
        await createWorkoutSession(exerciseId, workoutTime, sessionSets);
        insertedCount++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    weekCount++;
  }

  console.log(`[SeedTestData] Test_Sheiko: ${insertedCount} sessions inserted over ${weekCount} weeks.`);
}

// ============================================================================
// LINEAR PROGRESSION (Simple beginner program)
// ============================================================================

async function seedLinearProgram(): Promise<void> {
  const exerciseId = await getOrCreateExercise(
    "Test_Linear",
    "Linear Progression OHP - Simple 3x5 with 2.5kg weekly increases",
    "Shoulders",
    "Barbell",
    SIX_MONTHS_START.getTime()
  );

  const latestSeededTime = await getLatestSeededSetTime(exerciseId);
  if (isSeededThroughToday(latestSeededTime)) {
    console.log("[SeedTestData] Test_Linear already reaches today, skipping.");
    return;
  }

  console.log("[SeedTestData] Seeding Test_Linear (Linear Progression OHP)...");

  const rng = createRng(789);
  let currentWeight = 40; // Starting weight
  const targetWeight = 70; // Realistic 6-month goal

  let currentDate = new Date(SIX_MONTHS_START);
  while (currentDate.getDay() !== 1) currentDate.setDate(currentDate.getDate() + 1);

  let sessionCount = 0;
  let failedAttempts = 0;
  let insertedCount = 0;

  while (currentDate.getTime() < SEED_END_EXCLUSIVE.getTime()) {
    const dayOfWeek = currentDate.getDay();
    // Train Mon/Wed/Fri
    if (dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5) {
      // Skip occasionally (5% chance)
      if (rng() < 0.05) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const workoutTime = currentDate.getTime() + 19 * 60 * 60 * 1000;
      const sessionSets: Array<{ weight: number; reps: number; isWarmup?: boolean; note?: string }> = [];

      // Warmups
      sessionSets.push({ weight: 20, reps: 10, isWarmup: true });
      sessionSets.push({ weight: roundToNearest2_5(currentWeight * 0.6), reps: 5, isWarmup: true });
      sessionSets.push({ weight: roundToNearest2_5(currentWeight * 0.8), reps: 3, isWarmup: true });

      // Work sets: 3x5 (sometimes fails on last set as weight increases)
      const failChance = Math.min(0.3, (currentWeight - 40) / 100); // Higher weight = higher fail chance
      
      for (let s = 0; s < 3; s++) {
        let reps = 5;
        let note: string | undefined;

        // Last set might fail
        if (s === 2 && rng() < failChance) {
          reps = Math.max(3, Math.floor(rng() * 3) + 3); // 3-5 reps
          note = "Grind";
          failedAttempts++;
        }

        sessionSets.push({ weight: currentWeight, reps, note });
      }

      if (shouldCreateSession(latestSeededTime, workoutTime)) {
        await createWorkoutSession(exerciseId, workoutTime, sessionSets);
        insertedCount++;
      }
      sessionCount++;

      // Progress logic: increase every successful session, deload after 3 fails
      if (failedAttempts >= 3) {
        currentWeight = roundToNearest2_5(currentWeight * 0.9);
        failedAttempts = 0;
      } else if (sessionCount % 3 === 0 && currentWeight < targetWeight) {
        // Increase every week (3 sessions)
        currentWeight = roundToNearest2_5(currentWeight + 2.5);
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(`[SeedTestData] Test_Linear: ${insertedCount} sessions inserted, final weight ${currentWeight}kg.`);
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Seed all test data exercises if in development mode
 * Safe to rerun: appends any missing seeded sessions up to today
 */
export async function seedTestDataExercise(): Promise<void> {
  if (!__DEV__) {
    return;
  }

  console.log("[SeedTestData] Starting test data seeding...");

  await seed531Program();
  await seedSmolovProgram();
  await seedSheikoProgram();
  await seedLinearProgram();

  console.log("[SeedTestData] All test data seeding complete!");
}
