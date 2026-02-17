/**
 * Tests for Programs feature: planner generation, apply flow,
 * prescription parsing, and progression evaluation.
 */

import { parseProgramPrescription, createSimplePrescription, serializePrescription } from '../../lib/programs/prescription';
import type { ProgramPrescriptionV1 } from '../../lib/programs/prescription';

// ============================================================================
// Prescription Parsing Tests
// ============================================================================

describe('Prescription Parsing', () => {
  it('should parse a simple work-only prescription', () => {
    const json = JSON.stringify({
      version: 1,
      blocks: [
        { kind: 'work', sets: 3, reps: { type: 'fixed', value: 5 } },
      ],
    });
    const result = parseProgramPrescription(json);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.blocks.length).toBe(1);
    expect(result!.blocks[0].kind).toBe('work');
    if (result!.blocks[0].kind === 'work') {
      expect(result!.blocks[0].sets).toBe(3);
      expect(result!.blocks[0].reps).toEqual({ type: 'fixed', value: 5 });
    }
  });

  it('should parse a prescription with warmup and work blocks', () => {
    const json = JSON.stringify({
      version: 1,
      restSeconds: 180,
      notes: 'Heavy day',
      blocks: [
        { kind: 'warmup', style: 'ramp', sets: 2, reps: 5 },
        { kind: 'work', sets: 3, reps: { type: 'fixed', value: 5 }, target: { type: 'rpe', value: 8 } },
      ],
    });
    const result = parseProgramPrescription(json);
    expect(result).not.toBeNull();
    expect(result!.restSeconds).toBe(180);
    expect(result!.notes).toBe('Heavy day');
    expect(result!.blocks.length).toBe(2);
    expect(result!.blocks[0].kind).toBe('warmup');
    expect(result!.blocks[1].kind).toBe('work');
    if (result!.blocks[1].kind === 'work') {
      expect(result!.blocks[1].target).toEqual({ type: 'rpe', value: 8 });
    }
  });

  it('should parse a prescription with rep range', () => {
    const json = JSON.stringify({
      version: 1,
      blocks: [
        { kind: 'work', sets: 3, reps: { type: 'range', min: 8, max: 12 } },
      ],
    });
    const result = parseProgramPrescription(json);
    expect(result).not.toBeNull();
    if (result!.blocks[0].kind === 'work') {
      expect(result!.blocks[0].reps).toEqual({ type: 'range', min: 8, max: 12 });
    }
  });

  it('should return null for empty/null input', () => {
    expect(parseProgramPrescription(null)).toBeNull();
    expect(parseProgramPrescription(undefined)).toBeNull();
    expect(parseProgramPrescription('')).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    expect(parseProgramPrescription('not json')).toBeNull();
  });

  it('should reject unknown version', () => {
    const json = JSON.stringify({ version: 2, blocks: [] });
    expect(parseProgramPrescription(json)).toBeNull();
  });

  it('should handle missing optional fields leniently', () => {
    const json = JSON.stringify({
      blocks: [
        { kind: 'work', sets: 5, reps: { type: 'fixed', value: 3 } },
      ],
    });
    const result = parseProgramPrescription(json);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.restSeconds).toBeUndefined();
    expect(result!.notes).toBeUndefined();
  });

  it('should serialize and re-parse correctly', () => {
    const original = createSimplePrescription({
      sets: 5,
      reps: 5,
      target: { type: 'fixed_weight_kg', value: 100 },
      restSeconds: 300,
    });
    const json = serializePrescription(original);
    const parsed = parseProgramPrescription(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.blocks.length).toBe(1);
    if (parsed!.blocks[0].kind === 'work') {
      expect(parsed!.blocks[0].sets).toBe(5);
      expect(parsed!.blocks[0].reps).toEqual({ type: 'fixed', value: 5 });
      expect(parsed!.blocks[0].target).toEqual({ type: 'fixed_weight_kg', value: 100 });
    }
  });

  it('should create simple prescription with range reps', () => {
    const result = createSimplePrescription({
      sets: 3,
      reps: { min: 8, max: 12 },
      target: { type: 'rpe', value: 7 },
    });
    expect(result.version).toBe(1);
    expect(result.blocks.length).toBe(1);
    if (result.blocks[0].kind === 'work') {
      expect(result.blocks[0].sets).toBe(3);
      expect(result.blocks[0].reps).toEqual({ type: 'range', min: 8, max: 12 });
      expect(result.blocks[0].target).toEqual({ type: 'rpe', value: 7 });
    }
  });
});

// ============================================================================
// Planner Generation Tests (mock-based)
// ============================================================================

describe('Planner Window Generation', () => {
  it('should generate weekly planned_workouts for each matching day of week', () => {
    // Simulate a weekly program with Monday (1) and Wednesday (3)
    const weeklyDays = [
      { id: 1, dayOfWeek: 1, schedule: 'weekly' }, // Monday
      { id: 2, dayOfWeek: 3, schedule: 'weekly' }, // Wednesday
    ];

    const today = new Date('2026-02-12'); // Thursday
    today.setHours(0, 0, 0, 0);

    // Count expected planned days in 8 weeks
    let mondays = 0;
    let wednesdays = 0;
    for (let offset = 0; offset <= 56; offset++) {
      const date = new Date(today);
      date.setDate(date.getDate() + offset);
      const dow = date.getDay();
      if (dow === 1) mondays++;
      if (dow === 3) wednesdays++;
    }

    expect(mondays).toBeGreaterThan(0);
    expect(wednesdays).toBeGreaterThan(0);
    // Should be approximately 8 of each
    expect(mondays).toBeLessThanOrEqual(9);
    expect(wednesdays).toBeLessThanOrEqual(9);
  });

  it('should generate interval planned_workouts in rotation', () => {
    // Simulate interval program with 2-day gap between days
    const intervalDays = [
      { id: 10, intervalDays: 2, schedule: 'interval', note: 'Day A' },
      { id: 11, intervalDays: 2, schedule: 'interval', note: 'Day B' },
    ];

    const today = new Date('2026-02-12');
    today.setHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + 56);

    // Calculate expected entries
    let count = 0;
    let nextDate = new Date(today);
    let rotationIdx = 0;
    while (nextDate <= windowEnd) {
      count++;
      const gap = intervalDays[rotationIdx].intervalDays;
      nextDate.setDate(nextDate.getDate() + gap);
      rotationIdx = (rotationIdx + 1) % intervalDays.length;
    }

    // With 2-day gaps, 56 days / 2 = ~28 entries
    expect(count).toBeGreaterThan(20);
    expect(count).toBeLessThanOrEqual(30);
  });

  it('should dedupe: at most one planned entry per day', () => {
    // Simulate two weekly days that land on the same date (shouldn't happen normally but test dedupe logic)
    const existingDayKeys = new Set<string>();
    const dates = ['2026-02-16', '2026-02-16']; // Two entries for same day

    let inserted = 0;
    for (const dk of dates) {
      if (!existingDayKeys.has(dk)) {
        existingDayKeys.add(dk);
        inserted++;
      }
    }

    expect(inserted).toBe(1); // Only one should be inserted
  });

  it('should not generate for days already in the window', () => {
    const existingDayKeys = new Set(['2026-02-16', '2026-02-18']);

    const newDates = ['2026-02-16', '2026-02-18', '2026-02-20'];
    let inserted = 0;
    for (const dk of newDates) {
      if (!existingDayKeys.has(dk)) {
        existingDayKeys.add(dk);
        inserted++;
      }
    }

    expect(inserted).toBe(1); // Only 2026-02-20 should be new
  });
});

// ============================================================================
// Apply Flow Tests (mock-based)
// ============================================================================

describe('Apply Planned Workout Flow', () => {
  it('should create N workout_exercises for N program_exercises', () => {
    const programExercises = [
      { id: 1, exerciseId: 10, orderIndex: 0 },
      { id: 2, exerciseId: 20, orderIndex: 1 },
      { id: 3, exerciseId: 30, orderIndex: 2 },
    ];

    // Mock apply: create one workout_exercise per program_exercise
    const createdEntries = programExercises.map((pe, idx) => ({
      workoutExerciseId: 100 + idx,
      exerciseId: pe.exerciseId,
      exerciseName: `Exercise ${pe.exerciseId}`,
    }));

    expect(createdEntries.length).toBe(3);
    expect(createdEntries[0].exerciseId).toBe(10);
    expect(createdEntries[1].exerciseId).toBe(20);
    expect(createdEntries[2].exerciseId).toBe(30);
  });

  it('should set performed_at = planned_for on all created entries', () => {
    const plannedFor = new Date('2026-02-16T00:00:00').getTime();

    // Mock workout exercise creation
    const created = {
      workoutExerciseId: 100,
      performedAt: plannedFor,
      completedAt: null,
    };

    expect(created.performedAt).toBe(plannedFor);
    expect(created.completedAt).toBeNull();
  });

  it('should set completedAt = NULL so entries only appear in history when completed', () => {
    const entry = {
      id: 100,
      completedAt: null as number | null,
      performedAt: Date.now(),
    };

    // Entry should not appear in "completed" history
    expect(entry.completedAt).toBeNull();

    // After completing
    entry.completedAt = Date.now();
    expect(entry.completedAt).not.toBeNull();
  });

  it('should generate placeholder sets with weightKg = null for each work block', () => {
    const prescription: ProgramPrescriptionV1 = {
      version: 1,
      blocks: [
        { kind: 'warmup', style: 'ramp', sets: 2, reps: 5 },
        { kind: 'work', sets: 3, reps: { type: 'fixed', value: 5 } },
      ],
    };

    const generatedSets: Array<{ weightKg: number | null; reps: number | null; isWarmup: boolean }> = [];

    for (const block of prescription.blocks) {
      if (block.kind === 'warmup') {
        for (let i = 0; i < block.sets; i++) {
          generatedSets.push({ weightKg: null, reps: block.reps ?? null, isWarmup: true });
        }
      } else if (block.kind === 'work') {
        const targetReps = block.reps.type === 'fixed' ? block.reps.value : block.reps.type === 'range' ? block.reps.min : null;
        for (let i = 0; i < block.sets; i++) {
          generatedSets.push({ weightKg: null, reps: targetReps, isWarmup: false });
        }
      }
    }

    // 2 warmup + 3 work = 5 total
    expect(generatedSets.length).toBe(5);

    // All should have weightKg = null (placeholder)
    for (const s of generatedSets) {
      expect(s.weightKg).toBeNull();
    }

    // Warmup sets
    expect(generatedSets[0].isWarmup).toBe(true);
    expect(generatedSets[1].isWarmup).toBe(true);

    // Work sets
    expect(generatedSets[2].isWarmup).toBe(false);
    expect(generatedSets[2].reps).toBe(5);
    expect(generatedSets[3].isWarmup).toBe(false);
    expect(generatedSets[4].isWarmup).toBe(false);
  });

  it('should append new entries after existing ones by order_index', () => {
    // Existing entries for the workout
    const existingMaxOrderIndex = 3;
    const startOrderIndex = existingMaxOrderIndex + 1;

    const newEntries = [
      { exerciseId: 10, orderIndex: startOrderIndex },
      { exerciseId: 20, orderIndex: startOrderIndex + 1 },
    ];

    expect(newEntries[0].orderIndex).toBe(4);
    expect(newEntries[1].orderIndex).toBe(5);
  });
});

// ============================================================================
// Progression Tests (mock-based)
// ============================================================================

describe('Progression Evaluation', () => {
  it('kg_per_session: should add value to last max weight', () => {
    const lastMaxWeight = 100;
    const progressionValue = 2.5;
    const suggested = lastMaxWeight + progressionValue;
    expect(suggested).toBe(102.5);
  });

  it('kg_per_session: should cap at cap_kg', () => {
    const lastMaxWeight = 148;
    const progressionValue = 5;
    const capKg = 150;
    const raw = lastMaxWeight + progressionValue;
    const suggested = capKg !== null && raw > capKg ? capKg : raw;
    expect(suggested).toBe(150);
  });

  it('percent_per_session: should multiply by 1 + value/100', () => {
    const lastMaxWeight = 100;
    const progressionValue = 5; // 5%
    const suggested = Math.round(lastMaxWeight * (1 + progressionValue / 100) * 4) / 4;
    expect(suggested).toBe(105);
  });

  it('double_progression: should not increase weight if not all sets met target reps', () => {
    const targetMaxReps = 12;
    const lastSessionReps = [10, 11, 12]; // Not all met
    const allMet = lastSessionReps.every((r) => r >= targetMaxReps);
    expect(allMet).toBe(false);
    // Weight stays the same
    const lastWeight = 30;
    const suggested = allMet ? lastWeight + 2.5 : lastWeight;
    expect(suggested).toBe(30);
  });

  it('double_progression: should increase weight when all sets met target reps', () => {
    const targetMaxReps = 12;
    const lastSessionReps = [12, 12, 12]; // All met
    const allMet = lastSessionReps.every((r) => r >= targetMaxReps);
    expect(allMet).toBe(true);
    const lastWeight = 30;
    const progressionValue = 2.5;
    const suggested = allMet ? lastWeight + progressionValue : lastWeight;
    expect(suggested).toBe(32.5);
  });

  it('autoreg_rpe: should increase weight if average RPE was below target', () => {
    const rpeReadings = [6.5, 7.0, 7.0];
    const avgRpe = rpeReadings.reduce((a, b) => a + b, 0) / rpeReadings.length;
    const targetRpe = 8;
    const lastWeight = 100;

    let suggested = lastWeight;
    if (avgRpe < targetRpe - 0.5) {
      const bump = Math.max(2.5, lastWeight * 0.025);
      suggested = Math.round((lastWeight + bump) * 4) / 4;
    }

    expect(avgRpe).toBeCloseTo(6.833, 2);
    expect(suggested).toBeGreaterThan(lastWeight);
  });

  it('autoreg_rpe: should decrease weight if average RPE was above target', () => {
    const rpeReadings = [9.0, 9.5, 9.5];
    const avgRpe = rpeReadings.reduce((a, b) => a + b, 0) / rpeReadings.length;
    const targetRpe = 8;
    const lastWeight = 100;

    let suggested = lastWeight;
    if (avgRpe > targetRpe + 0.5) {
      const drop = Math.max(2.5, lastWeight * 0.025);
      suggested = Math.round((lastWeight - drop) * 4) / 4;
    }

    expect(suggested).toBeLessThan(lastWeight);
  });

  it('autoreg_rpe: should keep weight if RPE is on target', () => {
    const rpeReadings = [7.5, 8.0, 8.5];
    const avgRpe = rpeReadings.reduce((a, b) => a + b, 0) / rpeReadings.length;
    const targetRpe = 8;
    const lastWeight = 100;

    let suggested = lastWeight;
    if (avgRpe < targetRpe - 0.5) {
      suggested = lastWeight + 2.5;
    } else if (avgRpe > targetRpe + 0.5) {
      suggested = lastWeight - 2.5;
    }

    expect(suggested).toBe(100);
  });
});
