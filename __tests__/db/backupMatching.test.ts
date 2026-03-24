import {
  pickMatchingMediaId,
  pickMatchingSetId,
  pickMatchingWorkoutExerciseId,
  pickMatchingWorkoutId,
} from "../../lib/db/backupMatching";

describe("backup import semantic matching", () => {
  it("matches workouts by started_at candidates and uses note/completed_at as tiebreakers", () => {
    const match = pickMatchingWorkoutId(
      {
        completed_at: 1_710_000_000_000,
        note: "Leg day",
      },
      [
        { id: 1, completed_at: 1_710_000_000_000, note: "Push day" },
        { id: 2, completed_at: 1_710_000_000_000, note: "Leg day" },
      ]
    );

    expect(match).toBe(2);
  });

  it("returns null for ambiguous workouts when semantic fallback cannot choose safely", () => {
    const match = pickMatchingWorkoutId(
      {
        completed_at: null,
        note: null,
      },
      [
        { id: 10, completed_at: null, note: null },
        { id: 11, completed_at: null, note: null },
      ]
    );

    expect(match).toBeNull();
  });

  it("matches workout exercises by order index and performed time", () => {
    const match = pickMatchingWorkoutExerciseId(
      {
        order_index: 3,
        note: null,
        completed_at: 1_710_000_300_000,
        performed_at: 1_710_000_200_000,
      },
      [
        {
          id: 21,
          order_index: 1,
          note: null,
          completed_at: 1_710_000_300_000,
          performed_at: 1_710_000_200_000,
        },
        {
          id: 22,
          order_index: 3,
          note: null,
          completed_at: 1_710_000_300_000,
          performed_at: 1_710_000_200_000,
        },
      ]
    );

    expect(match).toBe(22);
  });

  it("matches sets by workout exercise and set slot even when live values changed", () => {
    const match = pickMatchingSetId(
      {
        workout_exercise_id: 99,
        set_group_id: null,
        set_index: 2,
        weight_kg: 100,
        reps: 5,
        rpe: null,
        rir: null,
        is_warmup: 0,
        note: null,
        superset_group_id: null,
        performed_at: 1_710_000_400_000,
      },
      [
        {
          id: 30,
          workout_exercise_id: 99,
          set_group_id: null,
          set_index: 1,
          weight_kg: 90,
          reps: 5,
          rpe: null,
          rir: null,
          is_warmup: 0,
          note: null,
          superset_group_id: null,
          performed_at: 1_710_000_400_000,
        },
        {
          id: 31,
          workout_exercise_id: 99,
          set_group_id: null,
          set_index: 2,
          weight_kg: 102.5,
          reps: 5,
          rpe: null,
          rir: null,
          is_warmup: 0,
          note: null,
          superset_group_id: null,
          performed_at: 1_710_000_400_000,
        },
      ]
    );

    expect(match).toBe(31);
  });

  it("uses legacy exact-value tiebreakers when set_index is missing", () => {
    const match = pickMatchingSetId(
      {
        workout_exercise_id: null,
        set_group_id: "drop-1",
        set_index: null,
        weight_kg: 60,
        reps: 12,
        rpe: 8,
        rir: null,
        is_warmup: 0,
        note: "burnout",
        superset_group_id: null,
        performed_at: 1_710_000_500_000,
      },
      [
        {
          id: 40,
          workout_exercise_id: null,
          set_group_id: "drop-1",
          set_index: null,
          weight_kg: 60,
          reps: 10,
          rpe: 8,
          rir: null,
          is_warmup: 0,
          note: "burnout",
          superset_group_id: null,
          performed_at: 1_710_000_500_000,
        },
        {
          id: 41,
          workout_exercise_id: null,
          set_group_id: "drop-1",
          set_index: null,
          weight_kg: 60,
          reps: 12,
          rpe: 8,
          rir: null,
          is_warmup: 0,
          note: "burnout",
          superset_group_id: null,
          performed_at: 1_710_000_500_000,
        },
      ]
    );

    expect(match).toBe(41);
  });

  it("matches media links by set-scoped metadata instead of duplicating them", () => {
    const match = pickMatchingMediaId(
      {
        asset_id: null,
        local_uri: "file:///old-install/set-videos/a1.mp4",
        original_filename: "lift-001.mp4",
        media_created_at: 1_710_000_000_000,
        duration_ms: 12500,
        album_name: "LiftingLog",
        note: null,
      },
      [
        {
          id: 50,
          asset_id: "asset-a",
          local_uri: "file:///new-install/set-videos/z9.mp4",
          original_filename: "lift-001.mp4",
          media_created_at: 1_710_000_000_000,
          duration_ms: 12500,
          album_name: "LiftingLog",
          note: null,
        },
        {
          id: 51,
          asset_id: "asset-b",
          local_uri: "file:///new-install/set-videos/other.mp4",
          original_filename: "lift-002.mp4",
          media_created_at: 1_710_000_100_000,
          duration_ms: 15000,
          album_name: "LiftingLog",
          note: null,
        },
      ]
    );

    expect(match).toBe(50);
  });
});
