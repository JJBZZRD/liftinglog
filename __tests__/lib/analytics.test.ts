/* eslint-disable @typescript-eslint/no-require-imports, import/first */

jest.mock("../../lib/db/connection", () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock("../../lib/db/introspection", () => ({
  hasColumn: jest.fn(() => true),
}));

jest.mock("../../lib/db/pbEvents", () => ({
  getPBEventsForExercise: jest.fn(async () => []),
}));

jest.mock("../../lib/db/settings", () => ({
  getExerciseFormulaOverride: jest.fn(() => null),
  getGlobalFormula: jest.fn(() => "epley"),
}));

import { computeE1rm } from "../../lib/pb";
import type { ExerciseAnalyticsDataset } from "../../lib/utils/analytics";
const {
  buildExerciseAnalyticsChartOverlays,
  buildExerciseAnalyticsOverview,
  getExerciseAnalyticsDataset,
  getAvailableExerciseAnalyticsOverlays,
  getCurrentPBSessionKeysFromDataset,
  getMetricDataPoints,
} = require("../../lib/utils/analytics");
import {
  analyticsFixtureNow,
  createAnalyticsDatasetFixture,
} from "../helpers/analyticsFixture";

function toTimestamp(iso: string): number {
  return new Date(iso).getTime();
}

function createDatasetFromSessions(
  sessionDefinitions: {
    date: string;
    sets: {
      weightKg: number;
      reps: number;
      isWarmup?: boolean;
    }[];
  }[]
): ExerciseAnalyticsDataset {
  let setId = 1;

  return {
    exerciseId: 1,
    formula: "epley",
    sessions: [...sessionDefinitions]
      .map((sessionDefinition, sessionIndex) => {
        const workoutId = sessionIndex + 1;
        const workoutExerciseId = workoutId + 100;

        return {
          date: toTimestamp(sessionDefinition.date),
          workoutId,
          workoutExerciseId,
          performedAt: toTimestamp(sessionDefinition.date),
          completedAt: toTimestamp(sessionDefinition.date) + 20 * 60 * 1000,
          sets: sessionDefinition.sets.map((setDefinition, setIndex) => ({
            id: setId++,
            workoutId,
            workoutExerciseId,
            setIndex: setIndex + 1,
            weightKg: setDefinition.weightKg,
            reps: setDefinition.reps,
            note: null,
            isWarmup: setDefinition.isWarmup ?? false,
            performedAt: toTimestamp(sessionDefinition.date) + (setIndex + 1) * 60 * 1000,
          })),
        };
      })
      .sort((a, b) => b.date - a.date),
    pbEvents: [],
  };
}

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
    expect(overview.metricTrend.hasEnoughData).toBe(true);
    expect(overview.metricTrend.rangeChange).toBeCloseTo(-505);
    expect(overview.metricTrend.recentAverage).toBeCloseTo(1046.25);
    expect(overview.metricTrend.previousAverage).toBeCloseTo(727.5);
    expect(overview.metricTrend.recentVsPreviousChange).toBeCloseTo(318.75);
    expect(overview.metricTrend.bestVsLatestGap).toBeCloseTo(582.5);
    expect(overview.metricTrend.momentumValue).toBeCloseTo(107.1402, 3);
    expect(overview.metricTrend.momentumStatus).toBe("building");
    expect(overview.metricTrend.confidenceScore).toBeGreaterThan(0.3);
    expect(overview.metricTrend.plateauRiskLabel).toBe("low");
    expect(overview.performanceProgress.hasEnoughData).toBe(false);
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

    expect(improvingOverview.metricTrend.trendStatus).toBe("improving");
    expect(improvingOverview.metricTrend.momentumStatus).toBe("building");
    expect(improvingOverview.metricTrend.confidenceLabel).toBe("high");
    expect(improvingOverview.metricTrend.plateauRiskLabel).toBe("low");
    expect(improvingOverview.metricTrend.stabilityLabel).toBe("stable");
    expect(sparseOverview.metricTrend.hasEnoughData).toBe(false);
    expect(sparseOverview.metricTrend.trendStatus).toBe("insufficient");
    expect(sparseOverview.metricTrend.confidenceLabel).toBe("insufficient");
    expect(sparseOverview.metricTrend.momentumStatus).toBe("insufficient");
    expect(sparseOverview.consistency.hasEnoughData).toBe(false);
  });

  it("keeps performance progress metric-independent and constrained to the selected date range", () => {
    const dataset = createDatasetFromSessions([
      { date: "2026-03-01T09:00:00Z", sets: [{ weightKg: 100, reps: 5 }] },
      { date: "2026-03-08T09:00:00Z", sets: [{ weightKg: 102.5, reps: 5 }] },
      { date: "2026-03-15T09:00:00Z", sets: [{ weightKg: 105, reps: 5 }] },
      { date: "2026-03-22T09:00:00Z", sets: [{ weightKg: 107.5, reps: 5 }] },
      { date: "2026-03-29T09:00:00Z", sets: [{ weightKg: 110, reps: 5 }] },
    ]);

    const byMaxWeight = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "work",
    });
    const byVolume = buildExerciseAnalyticsOverview(dataset, "totalVolume", {
      now: analyticsFixtureNow,
      setScope: "work",
    });
    const ranged = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "work",
      dateRange: {
        startDate: new Date("2026-03-15T00:00:00Z"),
        endDate: new Date("2026-04-01T00:00:00Z"),
      },
    });

    expect(byMaxWeight.performanceProgress.hasEnoughData).toBe(true);
    expect(byMaxWeight.performanceProgress.materialGainStatus).toBe("improving");
    expect(byMaxWeight.performanceProgress.daysSinceLastMeaningfulGain).toBe(10);
    expect(byMaxWeight.performanceProgress.absoluteProgressScore).toBeCloseTo(
      byVolume.performanceProgress.absoluteProgressScore ?? 0,
      6
    );
    expect(byMaxWeight.performanceProgress.materialGainStatus).toBe(
      byVolume.performanceProgress.materialGainStatus
    );
    expect(ranged.performanceProgress.hasEnoughData).toBe(false);
  });

  it("does not treat added volume at the same top-set strength as material progress", () => {
    const dataset = createDatasetFromSessions([
      { date: "2026-03-01T09:00:00Z", sets: [{ weightKg: 100, reps: 5 }] },
      {
        date: "2026-03-08T09:00:00Z",
        sets: [
          { weightKg: 100, reps: 5 },
          { weightKg: 80, reps: 5 },
        ],
      },
      {
        date: "2026-03-15T09:00:00Z",
        sets: [
          { weightKg: 100, reps: 5 },
          { weightKg: 80, reps: 5 },
          { weightKg: 80, reps: 5 },
        ],
      },
      {
        date: "2026-03-22T09:00:00Z",
        sets: [
          { weightKg: 100, reps: 5 },
          { weightKg: 80, reps: 5 },
          { weightKg: 80, reps: 5 },
          { weightKg: 80, reps: 5 },
        ],
      },
    ]);

    const overview = buildExerciseAnalyticsOverview(dataset, "totalVolume", {
      now: analyticsFixtureNow,
      setScope: "work",
    });

    expect(overview.metricTrend.hasEnoughData).toBe(true);
    expect((overview.metricTrend.rangeChange ?? 0) > 0).toBe(true);
    expect(overview.performanceProgress.hasEnoughData).toBe(true);
    expect(overview.performanceProgress.materialGainStatus).toBe("flat");
    expect(overview.performanceProgress.absoluteProgressScore).toBeCloseTo(0, 6);
  });

  it("returns mixed signal when heavier low-rep work rises while comparable strength slips", () => {
    const dataset = createDatasetFromSessions([
      {
        date: "2026-03-01T09:00:00Z",
        sets: [
          { weightKg: 100, reps: 5 },
          { weightKg: 105, reps: 2 },
        ],
      },
      {
        date: "2026-03-08T09:00:00Z",
        sets: [
          { weightKg: 99, reps: 5 },
          { weightKg: 107.5, reps: 2 },
        ],
      },
      {
        date: "2026-03-15T09:00:00Z",
        sets: [
          { weightKg: 98, reps: 5 },
          { weightKg: 110, reps: 2 },
        ],
      },
      {
        date: "2026-03-22T09:00:00Z",
        sets: [
          { weightKg: 97, reps: 5 },
          { weightKg: 112.5, reps: 2 },
        ],
      },
    ]);

    const overview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "work",
    });

    expect(overview.metricTrend.trendStatus).toBe("improving");
    expect(overview.performanceProgress.hasEnoughData).toBe(true);
    expect(overview.performanceProgress.materialGainStatus).toBe("mixed");
  });

  it("flags rep-range drift and applies lower base weight to high-rep buckets", () => {
    const dataset = createDatasetFromSessions([
      { date: "2026-02-01T09:00:00Z", sets: [{ weightKg: 90, reps: 10 }] },
      { date: "2026-02-08T09:00:00Z", sets: [{ weightKg: 92.5, reps: 10 }] },
      { date: "2026-02-15T09:00:00Z", sets: [{ weightKg: 95, reps: 10 }] },
      { date: "2026-02-22T09:00:00Z", sets: [{ weightKg: 97.5, reps: 10 }] },
      { date: "2026-03-01T09:00:00Z", sets: [{ weightKg: 110, reps: 2 }] },
      { date: "2026-03-08T09:00:00Z", sets: [{ weightKg: 112.5, reps: 2 }] },
      { date: "2026-03-15T09:00:00Z", sets: [{ weightKg: 115, reps: 2 }] },
      { date: "2026-03-22T09:00:00Z", sets: [{ weightKg: 117.5, reps: 2 }] },
    ]);

    const overview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "work",
    });
    const highRepBucket = overview.performanceProgress.bucketTrends.find(
      (bucket: { id: string }) => bucket.id === "10-12+"
    );

    expect(overview.performanceProgress.repRangeDriftFlag).toBe(true);
    expect(overview.performanceProgress.comparabilityLabel).toBe("less-comparable");
    expect(highRepBucket?.baseWeight).toBeCloseTo(0.8);
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

  it("summarizes PBs and excludes warmup-only PBs from work-set views", () => {
    const dataset = createAnalyticsDatasetFixture();

    const allOverview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "all",
    });
    const workOverview = buildExerciseAnalyticsOverview(dataset, "maxWeight", {
      now: analyticsFixtureNow,
      setScope: "work",
    });
    const allKeys = getCurrentPBSessionKeysFromDataset(dataset, "all");
    const workKeys = getCurrentPBSessionKeysFromDataset(dataset, "work");

    expect(workOverview.pbs.chips).toEqual([
      { targetReps: 1, weightKg: null },
      { targetReps: 2, weightKg: 115 },
      { targetReps: 3, weightKg: 112.5 },
      { targetReps: 5, weightKg: 105 },
      { targetReps: 8, weightKg: 95 },
      { targetReps: 10, weightKg: 100 },
    ]);
    expect(allOverview.pbs.lastPbDate).toBe(new Date("2026-04-06T09:00:00Z").getTime());
    expect(workOverview.pbs.lastPbDate).toBe(new Date("2026-03-30T09:10:00Z").getTime());
    expect(allOverview.pbs.pbSessionsInRange).toBe(6);
    expect(workOverview.pbs.pbSessionsInRange).toBe(5);
    expect(allOverview.pbs.newPbEventsInRange).toBe(8);
    expect(workOverview.pbs.newPbEventsInRange).toBe(7);
    expect(allKeys.has("106:206")).toBe(true);
    expect(workKeys.has("106:206")).toBe(false);
  });

  it("reports overlay availability from visible data density and metric support", () => {
    const dataset = createAnalyticsDatasetFixture();

    const availability = getAvailableExerciseAnalyticsOverlays(dataset, "maxWeight", {
      setScope: "work",
    });
    const byType = new Map(
      availability.map((entry: { type: string }) => [entry.type, entry])
    );

    expect(byType.get("trendLine")).toMatchObject({ enabled: true });
    expect(byType.get("ewma")).toMatchObject({ enabled: true });
    expect(byType.get("pbMarkers")).toMatchObject({ enabled: true });
    expect(byType.get("weeklyBand")).toMatchObject({ enabled: true });
    expect(byType.get("repBuckets")).toMatchObject({ enabled: true });
    expect(byType.get("robustTrend")).toMatchObject({
      enabled: false,
      reason: "Need 6 sessions in range",
    });
    expect(byType.get("plateauZones")).toMatchObject({
      enabled: false,
      reason: "Need 6 sessions in range",
    });
    expect(byType.get("outliers")).toMatchObject({
      enabled: false,
      reason: "Need 6 sessions in range",
    });

    const totalVolumeAvailability = getAvailableExerciseAnalyticsOverlays(dataset, "totalVolume", {
      setScope: "work",
    });
    const totalVolumeByType = new Map(
      totalVolumeAvailability.map((entry: { type: string }) => [entry.type, entry])
    );

    expect(totalVolumeByType.get("repBuckets")).toMatchObject({
      enabled: false,
      reason: "Not available for this metric",
    });
  });

  it("builds overlays only from the selected date range and set scope", () => {
    const dataset = createAnalyticsDatasetFixture();
    const range = {
      startDate: new Date("2026-03-16T00:00:00Z"),
      endDate: new Date("2026-03-30T23:59:59Z"),
    };

    const overlays = buildExerciseAnalyticsChartOverlays(dataset, "maxWeight", {
      dateRange: range,
      setScope: "work",
      selectedOverlays: ["trendLine", "ewma", "pbMarkers", "weeklyBand"],
    });

    expect(overlays.map((overlay: { overlayType: string }) => overlay.overlayType)).toEqual([
      "trendLine",
      "ewma",
      "pbMarkers",
    ]);

    const trendOverlay = overlays.find(
      (overlay: { overlayType: string }) => overlay.overlayType === "trendLine"
    );
    const prOverlay = overlays.find(
      (overlay: { overlayType: string }) => overlay.overlayType === "pbMarkers"
    );

    expect(trendOverlay?.points).toHaveLength(3);
    expect(
      trendOverlay?.points.every(
        (point: { date: number }) =>
          point.date >= range.startDate.getTime() && point.date <= range.endDate.getTime()
      )
    ).toBe(true);
    expect(prOverlay?.points).toHaveLength(2);
    expect(
      prOverlay?.points.map((point: { workoutId: number; workoutExerciseId: number | null }) =>
        `${point.workoutId}:${point.workoutExerciseId ?? "null"}`
      )
    ).toEqual(["104:204", "105:205"]);
  });

  it("builds weekly band and rep-bucket overlays from filtered sessions", () => {
    const dataset = createAnalyticsDatasetFixture();

    const overlays = buildExerciseAnalyticsChartOverlays(dataset, "maxWeight", {
      setScope: "work",
      selectedOverlays: ["weeklyBand", "repBuckets"],
    });

    const weeklyBand = overlays.find(
      (overlay: { overlayType: string }) => overlay.overlayType === "weeklyBand"
    );
    const repBuckets = overlays.find(
      (overlay: { overlayType: string }) => overlay.overlayType === "repBuckets"
    );

    expect(weeklyBand?.points).toHaveLength(5);
    expect(repBuckets?.points).toHaveLength(5);
    expect(
      repBuckets?.points.map((point: { variant: string }) => point.variant)
    ).toEqual(["7-9", "4-6", "1-3", "10-12+", "1-3"]);
  });

  it("detects plateau zones and outlier markers when enough data exists", () => {
    const plateauDataset = createDatasetFromSessions([
      { date: "2026-03-01T09:00:00Z", sets: [{ weightKg: 100, reps: 5 }] },
      { date: "2026-03-08T09:00:00Z", sets: [{ weightKg: 100.5, reps: 5 }] },
      { date: "2026-03-15T09:00:00Z", sets: [{ weightKg: 99.8, reps: 5 }] },
      { date: "2026-03-22T09:00:00Z", sets: [{ weightKg: 100.2, reps: 5 }] },
      { date: "2026-03-29T09:00:00Z", sets: [{ weightKg: 99.9, reps: 5 }] },
      { date: "2026-04-05T09:00:00Z", sets: [{ weightKg: 100.1, reps: 5 }] },
    ]);
    const outlierDataset = createDatasetFromSessions([
      { date: "2026-03-01T09:00:00Z", sets: [{ weightKg: 100, reps: 5 }] },
      { date: "2026-03-08T09:00:00Z", sets: [{ weightKg: 101, reps: 5 }] },
      { date: "2026-03-15T09:00:00Z", sets: [{ weightKg: 99.5, reps: 5 }] },
      { date: "2026-03-22T09:00:00Z", sets: [{ weightKg: 100.5, reps: 5 }] },
      { date: "2026-03-29T09:00:00Z", sets: [{ weightKg: 100, reps: 5 }] },
      { date: "2026-04-05T09:00:00Z", sets: [{ weightKg: 130, reps: 5 }] },
    ]);

    const plateauOverlays = buildExerciseAnalyticsChartOverlays(plateauDataset, "maxWeight", {
      setScope: "work",
      selectedOverlays: ["plateauZones", "robustTrend"],
    });
    const outlierOverlays = buildExerciseAnalyticsChartOverlays(outlierDataset, "maxWeight", {
      setScope: "work",
      selectedOverlays: ["outliers"],
    });

    const plateauZones = plateauOverlays.find(
      (overlay: { overlayType: string }) => overlay.overlayType === "plateauZones"
    );
    const robustTrend = plateauOverlays.find(
      (overlay: { overlayType: string }) => overlay.overlayType === "robustTrend"
    );
    const outliers = outlierOverlays.find(
      (overlay: { overlayType: string }) => overlay.overlayType === "outliers"
    );

    expect(plateauZones?.ranges).toHaveLength(1);
    expect(robustTrend?.points).toHaveLength(6);
    expect(outliers?.points).toHaveLength(1);
    expect(outliers?.points[0]).toMatchObject({
      variant: "positive",
      workoutId: 6,
    });
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
    const pbEvents = jest.requireMock("../../lib/db/pbEvents") as {
      getPBEventsForExercise: jest.Mock;
    };

    db.select.mockReturnValue(query);
    settings.getExerciseFormulaOverride.mockReturnValue("wathan");
    settings.getGlobalFormula.mockReturnValue("epley");
    pbEvents.getPBEventsForExercise.mockResolvedValue([]);

    const derived = await getExerciseAnalyticsDataset(42);
    const explicit = await getExerciseAnalyticsDataset(42, "brzycki");

    expect(derived.formula).toBe("wathan");
    expect(explicit.formula).toBe("brzycki");
    expect(derived.sessions).toHaveLength(1);
  });
});
