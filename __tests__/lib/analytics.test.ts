/* eslint-disable @typescript-eslint/no-require-imports, import/first */

jest.mock("../../lib/db/connection", () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock("../../lib/db/introspection", () => ({
  hasColumn: jest.fn(() => true),
}));

jest.mock("../../lib/db/prEvents", () => ({
  getPREventsForExercise: jest.fn(async () => []),
}));

jest.mock("../../lib/db/settings", () => ({
  getExerciseFormulaOverride: jest.fn(() => null),
  getGlobalFormula: jest.fn(() => "epley"),
}));

import { computeE1rm } from "../../lib/pr";
const {
  buildExerciseAnalyticsOverview,
  getExerciseAnalyticsDataset,
  getCurrentPRSessionKeysFromDataset,
  getMetricDataPoints,
} = require("../../lib/utils/analytics");
import {
  analyticsFixtureNow,
  createAnalyticsDatasetFixture,
} from "../helpers/analyticsFixture";

describe("lib/utils/analytics", () => {
  it("filters metric points by date range and preserves legacy sessions", () => {
    const dataset = createAnalyticsDatasetFixture();

    const points = getMetricDataPoints(dataset, "maxWeight", {
      dateRange: {
        startDate: new Date("2026-03-16T00:00:00Z"),
        endDate: new Date("2026-03-30T23:59:59Z"),
      },
      setScope: "work",
    });

    expect(points).toEqual([
      {
        date: new Date("2026-03-30T09:00:00Z").getTime(),
        value: 115,
        workoutId: 105,
        workoutExerciseId: 205,
      },
      {
        date: new Date("2026-03-23T09:00:00Z").getTime(),
        value: 112.5,
        workoutId: 104,
        workoutExerciseId: 204,
      },
      {
        date: new Date("2026-03-16T09:00:00Z").getTime(),
        value: 110,
        workoutId: 103,
        workoutExerciseId: null,
      },
    ]);
  });

  it("respects all sets vs work sets including warmup-only sessions", () => {
    const dataset = createAnalyticsDatasetFixture();

    const allOverview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "all",
    });
    const workOverview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "work",
    });

    expect(allOverview.snapshot.sessionCount).toBe(6);
    expect(allOverview.snapshot.latestValue).toBe(80);
    expect(allOverview.snapshot.daysSinceLastSession).toBe(2);

    expect(workOverview.snapshot.sessionCount).toBe(5);
    expect(workOverview.snapshot.latestValue).toBe(115);
    expect(workOverview.snapshot.daysSinceLastSession).toBe(9);
  });

  it("builds metric-aware snapshot and progress summaries", () => {
    const dataset = createAnalyticsDatasetFixture();

    const overview = buildExerciseAnalyticsOverview(dataset, "totalVolume", {
      now: analyticsFixtureNow,
      setScope: "work",
    });

    expect(overview.snapshot.latestValue).toBe(755);
    expect(overview.snapshot.bestValue).toBe(1337.5);
    expect(overview.progress.hasEnoughData).toBe(true);
    expect(overview.progress.rangeChange).toBeCloseTo(-505);
    expect(overview.progress.recentAverage).toBeCloseTo(1046.25);
    expect(overview.progress.previousAverage).toBeCloseTo(727.5);
    expect(overview.progress.recentVsPreviousChange).toBeCloseTo(318.75);
    expect(overview.progress.bestVsLatestGap).toBeCloseTo(582.5);
    expect(overview.progress.momentumValue).toBeCloseTo(107.1402, 3);
    expect(overview.progress.momentumStatus).toBe("building");
    expect(overview.progress.confidenceScore).toBeGreaterThan(0.3);
    expect(overview.progress.plateauRiskLabel).toBe("low");
  });

  it("classifies improving trends and falls back for sparse ranges", () => {
    const dataset = createAnalyticsDatasetFixture();

    const improvingOverview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "work",
    });
    const sparseOverview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "all",
      dateRange: {
        startDate: new Date("2026-03-23T00:00:00Z"),
        endDate: new Date("2026-04-06T23:59:59Z"),
      },
    });

    expect(improvingOverview.progress.trendStatus).toBe("improving");
    expect(improvingOverview.progress.momentumStatus).toBe("building");
    expect(improvingOverview.progress.confidenceLabel).toBe("high");
    expect(improvingOverview.progress.plateauRiskLabel).toBe("low");
    expect(improvingOverview.progress.stabilityLabel).toBe("stable");
    expect(sparseOverview.progress.hasEnoughData).toBe(false);
    expect(sparseOverview.progress.trendStatus).toBe("insufficient");
    expect(sparseOverview.progress.confidenceLabel).toBe("insufficient");
    expect(sparseOverview.progress.momentumStatus).toBe("insufficient");
    expect(sparseOverview.consistency.hasEnoughData).toBe(false);
  });

  it("calculates weekly consistency metrics from filtered sessions", () => {
    const dataset = createAnalyticsDatasetFixture();

    const overview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "work",
    });

    expect(overview.consistency.hasEnoughData).toBe(true);
    expect(overview.consistency.sessionsPerWeek).toBeCloseTo(1);
    expect(overview.consistency.averageGapDays).toBeCloseTo(7);
    expect(overview.consistency.currentWeeklyStreak).toBe(5);
    expect(overview.consistency.longestWeeklyStreak).toBe(5);
    expect(overview.consistency.weekdayCounts).toEqual([5, 0, 0, 0, 0, 0, 0]);
  });

  it("summarizes PRs and excludes warmup-only PRs from work-set views", () => {
    const dataset = createAnalyticsDatasetFixture();

    const allOverview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "all",
    });
    const workOverview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "work",
    });
    const allKeys = getCurrentPRSessionKeysFromDataset(dataset, "all");
    const workKeys = getCurrentPRSessionKeysFromDataset(dataset, "work");

    expect(workOverview.prs.chips).toEqual([
      { targetReps: 1, weightKg: null },
      { targetReps: 2, weightKg: 115 },
      { targetReps: 3, weightKg: 112.5 },
      { targetReps: 5, weightKg: 105 },
      { targetReps: 8, weightKg: 95 },
      { targetReps: 10, weightKg: 100 },
    ]);
    expect(allOverview.prs.lastPrDate).toBe(new Date("2026-04-06T09:00:00Z").getTime());
    expect(workOverview.prs.lastPrDate).toBe(new Date("2026-03-30T09:10:00Z").getTime());
    expect(allOverview.prs.prSessionsInRange).toBe(6);
    expect(workOverview.prs.prSessionsInRange).toBe(5);
    expect(allOverview.prs.newPrEventsInRange).toBe(8);
    expect(workOverview.prs.newPrEventsInRange).toBe(7);
    expect(allKeys.has("106:206")).toBe(true);
    expect(workKeys.has("106:206")).toBe(false);
  });

  it("builds rep profiles and resolves final tie-breaks by recency", () => {
    const dataset = createAnalyticsDatasetFixture();
    dataset.sessions.unshift({
      date: new Date("2026-04-13T09:00:00Z").getTime(),
      workoutId: 107,
      workoutExerciseId: 207,
      performedAt: new Date("2026-04-13T09:00:00Z").getTime(),
      completedAt: new Date("2026-04-13T09:20:00Z").getTime(),
      sets: [
        {
          id: 16,
          workoutId: 107,
          workoutExerciseId: 207,
          setIndex: 1,
          weightKg: 105,
          reps: 5,
          note: null,
          isWarmup: false,
          performedAt: new Date("2026-04-13T09:10:00Z").getTime(),
        },
      ],
    });

    const overview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: new Date("2026-04-15T12:00:00Z").getTime(),
      setScope: "work",
    });

    expect(overview.repProfile.buckets).toEqual([
      {
        id: "1-3",
        label: "1-3 Reps",
        bestSet: {
          weightKg: 115,
          reps: 2,
          date: new Date("2026-03-30T09:00:00Z").getTime(),
        },
      },
      {
        id: "4-6",
        label: "4-6 Reps",
        bestSet: {
          weightKg: 105,
          reps: 5,
          date: new Date("2026-04-13T09:00:00Z").getTime(),
        },
      },
      {
        id: "7-9",
        label: "7-9 Reps",
        bestSet: {
          weightKg: 95,
          reps: 8,
          date: new Date("2026-03-02T09:00:00Z").getTime(),
        },
      },
      {
        id: "10-12+",
        label: "10-12+ Reps",
        bestSet: {
          weightKg: 100,
          reps: 10,
          date: new Date("2026-03-23T09:00:00Z").getTime(),
        },
      },
    ]);
  });

  it("projects estimated rep maxes from the best filtered source set", () => {
    const dataset = createAnalyticsDatasetFixture();

    const overview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "work",
    });

    expect(overview.estimatedRepMaxes.sourceSet).toMatchObject({
      weightKg: 100,
      reps: 10,
      date: new Date("2026-03-23T09:00:00Z").getTime(),
    });

    const getEntry = (targetReps: number) =>
      overview.estimatedRepMaxes.entries.find(
        (entry: { targetReps: number }) => entry.targetReps === targetReps
      );

    expect(getEntry(1)?.projectedWeightKg).toBeCloseTo(133.3333, 3);
    expect(getEntry(2)?.projectedWeightKg).toBeCloseTo(125, 3);
    expect(getEntry(3)?.projectedWeightKg).toBeCloseTo(121.2121, 3);
    expect(getEntry(5)?.projectedWeightKg).toBeCloseTo(114.2857, 3);
    expect(getEntry(8)?.projectedWeightKg).toBeCloseTo(105.2631, 3);
    expect(getEntry(10)?.projectedWeightKg).toBeCloseTo(100, 3);
    expect(getEntry(1)?.isMuted).toBe(true);
    expect(getEntry(8)?.isMuted).toBe(false);
    expect(getEntry(10)?.isMuted).toBe(false);
  });

  it.each(["epley", "brzycki", "oconner", "lombardi", "mayhew", "wathan"] as const)(
    "keeps estimated rep max projections consistent for %s",
    (formula) => {
      const dataset = createAnalyticsDatasetFixture(formula);
      const overview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
        now: analyticsFixtureNow,
        setScope: "work",
      });
      const sourceSet = overview.estimatedRepMaxes.sourceSet;

      expect(sourceSet).not.toBeNull();
      expect(overview.estimatedRepMaxes.entries[0].projectedWeightKg).toBeCloseTo(
        sourceSet!.estimated1RMKg,
        3
      );

      for (const entry of overview.estimatedRepMaxes.entries.slice(1)) {
        expect(entry.projectedWeightKg).not.toBeNull();
        expect(
          computeE1rm(formula, entry.projectedWeightKg ?? 0, entry.targetReps)
        ).toBeCloseTo(sourceSet!.estimated1RMKg, 2);
      }
    }
  );

  it("prefers exercise overrides over global formulas and still accepts explicit overrides", async () => {
    const rows = [
      {
        setId: 1,
        workoutId: 10,
        workoutExerciseId: 20,
        setIndex: 1,
        weightKg: 100,
        reps: 5,
        note: null,
        isWarmup: false,
        setPerformedAt: new Date("2026-03-01T10:00:00Z").getTime(),
        workoutExercisePerformedAt: new Date("2026-03-01T10:00:00Z").getTime(),
        workoutExerciseCompletedAt: new Date("2026-03-01T10:10:00Z").getTime(),
        workoutStartedAt: new Date("2026-03-01T10:00:00Z").getTime(),
        workoutCompletedAt: new Date("2026-03-01T10:10:00Z").getTime(),
      },
    ];

    const query = {
      from: jest.fn(),
      leftJoin: jest.fn(),
      innerJoin: jest.fn(),
      where: jest.fn(),
      orderBy: jest.fn(async () => rows),
    };
    query.from.mockReturnValue(query);
    query.leftJoin.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.where.mockReturnValue(query);

    const { db } = jest.requireMock("../../lib/db/connection") as {
      db: { select: jest.Mock };
    };
    const settings = jest.requireMock("../../lib/db/settings") as {
      getExerciseFormulaOverride: jest.Mock;
      getGlobalFormula: jest.Mock;
    };
    const prEvents = jest.requireMock("../../lib/db/prEvents") as {
      getPREventsForExercise: jest.Mock;
    };

    db.select.mockReturnValue(query);
    settings.getExerciseFormulaOverride.mockReturnValue("wathan");
    settings.getGlobalFormula.mockReturnValue("epley");
    prEvents.getPREventsForExercise.mockResolvedValue([]);

    const derived = await getExerciseAnalyticsDataset(42);
    const explicit = await getExerciseAnalyticsDataset(42, "brzycki");

    expect(derived.formula).toBe("wathan");
    expect(explicit.formula).toBe("brzycki");
    expect(derived.sessions).toHaveLength(1);
  });
});
