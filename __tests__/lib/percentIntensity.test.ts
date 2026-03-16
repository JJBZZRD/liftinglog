import type { MaterializedSession } from "program-specification-language";
jest.mock("../../lib/db/exercises", () => ({
  listExercisesByNames: jest.fn(),
}));
jest.mock("../../lib/utils/analytics", () => ({
  getEstimated1RMPerSession: jest.fn(),
  getMaxWeightPerSession: jest.fn(),
}));

import {
  collectPercentIntensityRequirements,
  parseStoredPercentIntensityConfig,
  resolvePercentIntensityMaterialized,
  serializeStoredPercentIntensityConfig,
} from "../../lib/programs/psl/percentIntensity";

describe("percentIntensity", () => {
  it("collects unique %1RM requirements from materialized sessions", () => {
    const materialized: MaterializedSession[] = [
      {
        id: "day-1",
        name: "Day 1",
        sequence: 1,
        exercises: [
          {
            exercise: "Back Squat",
            exercise_id: "back_squat",
            units: "kg",
            sets: [
              { index: 1, intensity: { type: "percent_1rm", value: 75 } },
              { index: 2, intensity: { type: "percent_1rm", value: 80 } },
            ],
          },
          {
            exercise: "Chest Supported Row",
            sets: [{ index: 1, intensity: { type: "load", value: 60, unit: "kg" } }],
          },
        ],
      } as MaterializedSession,
      {
        id: "day-2",
        name: "Day 2",
        sequence: 2,
        exercises: [
          {
            exercise: "Back Squat",
            exercise_id: "back_squat",
            units: "kg",
            sets: [{ index: 1, intensity: { type: "percent_1rm", value: 70 } }],
          },
        ],
      } as MaterializedSession,
    ];

    expect(collectPercentIntensityRequirements(materialized, "kg")).toEqual([
      {
        key: "back_squat",
        exerciseName: "Back Squat",
        exerciseId: "back_squat",
        units: "kg",
        rounding: undefined,
      },
    ]);
  });

  it("serializes and parses stored config entries", () => {
    const value = serializeStoredPercentIntensityConfig([
      {
        key: "back_squat",
        exerciseName: "Back Squat",
        sourceExerciseId: 7,
        sourceExerciseName: "Back Squat",
        mode: "history_e1rm",
        baselineKg: 180,
      },
    ]);

    expect(parseStoredPercentIntensityConfig(value)).toEqual([
      {
        key: "back_squat",
        exerciseName: "Back Squat",
        sourceExerciseId: 7,
        sourceExerciseName: "Back Squat",
        mode: "history_e1rm",
        baselineKg: 180,
      },
    ]);
  });

  it("resolves %1RM intensities into rounded load targets", () => {
    const materialized: MaterializedSession[] = [
      {
        id: "day-1",
        name: "Day 1",
        sequence: 1,
        exercises: [
          {
            exercise: "Back Squat",
            exercise_id: "back_squat",
            units: "kg",
            rounding: { round_to: 2.5, mode: "nearest" },
            sets: [
              { index: 1, intensity: { type: "percent_1rm", value: 75 } },
              {
                index: 2,
                intensity: {
                  type: "percent_1rm",
                  value: 82.5,
                  plus_load: { value: 2.5, unit: "kg" },
                },
              },
            ],
          },
        ],
      } as MaterializedSession,
    ];

    const resolved = resolvePercentIntensityMaterialized(materialized, {
      fallbackUnit: "kg",
      configEntries: [
        {
          key: "back_squat",
          exerciseName: "Back Squat",
          sourceExerciseId: 7,
          sourceExerciseName: "Back Squat",
          mode: "history_e1rm",
          baselineKg: 200,
        },
      ],
    });

    expect(resolved[0].exercises[0].sets[0].intensity).toEqual({
      type: "load",
      value: 150,
      unit: "kg",
    });
    expect(resolved[0].exercises[0].sets[1].intensity).toEqual({
      type: "load",
      value: 167.5,
      unit: "kg",
    });
  });

  it("leaves %1RM intensities untouched when no stored config exists", () => {
    const materialized: MaterializedSession[] = [
      {
        id: "day-1",
        name: "Day 1",
        sequence: 1,
        exercises: [
          {
            exercise: "Back Squat",
            exercise_id: "back_squat",
            units: "kg",
            sets: [{ index: 1, intensity: { type: "percent_1rm", value: 75 } }],
          },
        ],
      } as MaterializedSession,
    ];

    const resolved = resolvePercentIntensityMaterialized(materialized, {
      fallbackUnit: "kg",
      configEntries: [],
    });

    expect(resolved[0].exercises[0].sets[0].intensity).toEqual({
      type: "percent_1rm",
      value: 75,
    });
  });
});
