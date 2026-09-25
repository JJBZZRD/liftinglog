import { selectWorkoutSetHighlights } from '@/features/workouts/workout-set-highlights';
import type { SetRow } from '@/lib/db/workouts';
import { calculateE1RM } from '@/lib/utils/estimated-one-rep-max';

function set(id: number, patch: Partial<SetRow> = {}): SetRow {
  return {
    id, uid: `set-${id}`, workoutId: 1, exerciseId: 1, workoutExerciseId: 1,
    setGroupId: null, setIndex: id, weightKg: 60, reps: 5, rpe: null, rir: null,
    isWarmup: false, note: null, supersetGroupId: null, performedAt: id,
    ...patch,
  };
}

describe('selectWorkoutSetHighlights', () => {
  it('keeps three progressively improving PBs at the same reps plus a distinct best among 12 sets', () => {
    const sets = Array.from({ length: 12 }, (_, index) => set(index + 1));
    sets[1] = set(2, { weightKg: 90 });
    sets[4] = set(5, { weightKg: 95 });
    sets[7] = set(8, { weightKg: 100 });
    sets[10] = set(11, { weightKg: 110, reps: 8 });
    const result = selectWorkoutSetHighlights(sets, new Map([[8, '5RM'], [2, '5RM'], [5, '5RM']]));
    expect(result.bestSetId).toBe(11);
    expect([...result.highlightedSetIds]).toEqual([2, 5, 8, 11]);
  });

  it('unions a PB and best without duplicates and ignores PB IDs outside the entry', () => {
    const result = selectWorkoutSetHighlights([set(1), set(2, { weightKg: 80 })], new Map([[2, '5RM'], [99, '5RM']]));
    expect(result.bestSetId).toBe(2);
    expect([...result.highlightedSetIds]).toEqual([2]);
  });

  it('uses the history Epley estimate instead of weight, volume, or the PB label', () => {
    const result = selectWorkoutSetHighlights([
      set(1, { weightKg: 110, reps: 1 }),
      set(2, { weightKg: 100, reps: 5 }),
      set(3, { weightKg: 50, reps: 20 }),
    ], new Map([[1, '1RM']]));
    expect(calculateE1RM(100, 5)).toBe(100 * (1 + 0.0333 * 5));
    expect(result.bestSetId).toBe(2);
    expect([...result.highlightedSetIds]).toEqual([1, 2]);
  });

  it('breaks ties by caller order without sorting by ID, index, or timestamp', () => {
    const sets = Object.freeze([
      Object.freeze(set(9, { setIndex: 9, performedAt: 90 })),
      Object.freeze(set(2, { setIndex: 1, performedAt: 10 })),
      Object.freeze(set(1, { weightKg: 40 })),
    ]);
    const badges = new Map([[1, '5RM'], [2, '5RM']]);
    const before = [...badges];
    const result = selectWorkoutSetHighlights(sets, badges);
    expect(result.bestSetId).toBe(9);
    expect([...result.highlightedSetIds]).toEqual([9, 2, 1]);
    expect(sets.map((row) => row.id)).toEqual([9, 2, 1]);
    expect([...badges]).toEqual(before);
  });

  it('uses greatest reps for zero-load sets, with first-in-order ties', () => {
    const result = selectWorkoutSetHighlights([
      set(1, { weightKg: 0, reps: 8 }),
      set(2, { weightKg: 0, reps: 12 }),
      set(3, { weightKg: 0, reps: 12 }),
    ], new Map());
    expect(result.bestSetId).toBe(2);
    expect([...result.highlightedSetIds]).toEqual([2]);
  });

  it('prefers a valid weighted estimate to the zero-load fallback', () => {
    const result = selectWorkoutSetHighlights([
      set(1, { weightKg: 0, reps: 100 }), set(2, { weightKg: 1, reps: 1 }),
    ], new Map());
    expect(result.bestSetId).toBe(2);
  });

  it('excludes null, negative, zero-rep, nonfinite, and overflowing measurements from best selection', () => {
    const patches: Partial<SetRow>[] = [
      { weightKg: null }, { reps: null }, { weightKg: -1 }, { reps: -1 }, { reps: 0 },
      { weightKg: NaN }, { reps: NaN }, { weightKg: Infinity }, { reps: Infinity },
      { weightKg: Number.MAX_VALUE, reps: Number.MAX_VALUE },
    ];
    const sets = patches.map((patch, index) => set(index + 1, patch));
    sets.push(set(11, { weightKg: 0, reps: 6 }));
    const result = selectWorkoutSetHighlights(sets, new Map([[1, '5RM']]));
    expect(result.bestSetId).toBe(11);
    expect([...result.highlightedSetIds]).toEqual([1, 11]);
  });

  it('shows the first recorded row without claiming best when no valid performance exists', () => {
    const result = selectWorkoutSetHighlights([
      set(1, { note: '[PLANNED] 5 reps' }),
      set(2, { weightKg: null }), set(3, { weightKg: -2 }),
    ], new Map([[3, '5RM']]));
    expect(result.bestSetId).toBeNull();
    expect([...result.highlightedSetIds]).toEqual([2, 3]);
  });

  it('never highlights planned placeholders even if supplied as PBs', () => {
    const result = selectWorkoutSetHighlights([
      set(1, { weightKg: 500, note: '[PLANNED] target' }), set(2),
    ], new Map([[1, '5RM']]));
    expect(result.bestSetId).toBe(2);
    expect([...result.highlightedSetIds]).toEqual([2]);
  });

  it('has no best or visible fallback for empty or exclusively planned entries', () => {
    for (const sets of [[], [set(1, { note: '[PLANNED]' })]]) {
      expect(selectWorkoutSetHighlights(sets, new Map([[1, '5RM']]))).toEqual({
        bestSetId: null, highlightedSetIds: new Set(),
      });
    }
  });
});
