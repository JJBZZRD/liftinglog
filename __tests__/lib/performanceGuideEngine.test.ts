import {
  buildPerformanceGuide,
  type MetricEntry,
  type MetricType,
} from "../../lib/userMetrics/performanceGuide";

const NOW = new Date("2026-04-11T12:00:00.000Z").getTime();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function entry(metric: MetricType, daysAgo: number, value: number): MetricEntry {
  return {
    metric,
    recordedAt: NOW - daysAgo * MS_PER_DAY - 60 * 60 * 1000,
    value,
  };
}

function series(metric: MetricType, valuesByDaysAgo: Array<[number, number]>): MetricEntry[] {
  return valuesByDaysAgo.map(([daysAgo, value]) => entry(metric, daysAgo, value));
}

describe("lib/userMetrics/performanceGuide", () => {
  it("returns no zone when no metric data is available", () => {
    const result = buildPerformanceGuide({}, { now: NOW });

    expect(result.zone).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.missingDataNotes[0]?.message).toContain("Not enough recent recovery metrics");
  });

  it("handles gradual bodyweight loss without over-penalizing the result", () => {
    const result = buildPerformanceGuide(
      {
        bodyweight: series("bodyweight", [
          [39, 83.0],
          [35, 82.8],
          [31, 82.6],
          [27, 82.4],
          [23, 82.2],
          [19, 82.0],
          [15, 81.8],
          [10, 81.3],
          [6, 81.2],
          [2, 81.1],
        ]),
      },
      { now: NOW }
    );

    expect(result.signals.some((signal) => signal.id === "weight_gradual_loss")).toBe(true);
    expect(["ready", "peak"]).toContain(result.zone);
    expect(result.basedMostlyOnSingleMetric).toBe(true);
  });

  it("flags sudden bodyweight drops as a caution signal", () => {
    const result = buildPerformanceGuide(
      {
        bodyweight: series("bodyweight", [
          [39, 83.0],
          [35, 82.8],
          [31, 82.6],
          [27, 82.4],
          [23, 82.2],
          [19, 82.0],
          [15, 81.8],
          [10, 80.5],
          [6, 80.3],
          [2, 80.1],
        ]),
      },
      { now: NOW }
    );

    expect(result.signals.some((signal) => signal.id === "weight_rapid_drop")).toBe(true);
    expect(["caution", "compromised"]).toContain(result.zone);
  });

  it("detects an acute poor recovery day from sleep and stress alone", () => {
    const result = buildPerformanceGuide(
      {
        sleep: series("sleep", [
          [5, 6.5],
          [3, 6.0],
          [1, 4.6],
        ]),
        stress: series("stress", [
          [5, 3],
          [3, 4],
          [1, 5],
        ]),
      },
      { now: NOW }
    );

    expect(result.signals.some((signal) => signal.id === "sleep_very_poor_last_night")).toBe(true);
    expect(result.signals.some((signal) => signal.id === "stress_high_today")).toBe(true);
    expect(result.patterns.some((pattern) => pattern.id === "acute_poor_recovery_day")).toBe(true);
    expect(["caution", "compromised"]).toContain(result.zone);
  });

  it("returns ready or peak on broad positive recovery data", () => {
    const result = buildPerformanceGuide(
      {
        sleep: series("sleep", [
          [39, 6.8],
          [35, 6.9],
          [31, 7.0],
          [27, 6.8],
          [23, 6.9],
          [19, 7.0],
          [15, 7.1],
          [10, 8.2],
          [6, 8.4],
          [1, 8.5],
        ]),
        fatigue: series("fatigue", [
          [39, 3.4],
          [35, 3.3],
          [31, 3.2],
          [27, 3.5],
          [23, 3.1],
          [19, 3.2],
          [15, 3.3],
          [10, 2],
          [6, 1],
          [1, 1],
        ]),
        stress: series("stress", [
          [39, 3.2],
          [35, 3.1],
          [31, 3.0],
          [27, 3.2],
          [23, 3.0],
          [19, 3.1],
          [15, 3.0],
          [10, 2],
          [6, 1],
          [1, 1],
        ]),
        soreness: series("soreness", [
          [10, 2],
          [6, 2],
          [1, 1],
        ]),
        restingHr: series("restingHr", [
          [39, 60],
          [35, 61],
          [31, 59],
          [27, 60],
          [23, 61],
          [19, 60],
          [15, 59],
          [10, 56],
          [6, 55],
          [1, 54],
        ]),
      },
      { now: NOW }
    );

    expect(result.patterns.some((pattern) => pattern.id === "primed_for_performance")).toBe(true);
    expect(["ready", "peak"]).toContain(result.zone);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("lands in a middle zone when signals conflict", () => {
    const result = buildPerformanceGuide(
      {
        sleep: series("sleep", [
          [5, 7.2],
          [3, 7.4],
          [1, 8.3],
        ]),
        soreness: series("soreness", [
          [5, 3],
          [3, 4],
          [1, 5],
        ]),
        stress: series("stress", [
          [39, 2.5],
          [35, 2.7],
          [31, 2.8],
          [27, 2.6],
          [23, 2.7],
          [19, 2.8],
          [15, 2.6],
          [10, 3.8],
          [6, 4.2],
          [1, 4.1],
        ]),
      },
      { now: NOW }
    );

    expect(result.signals.some((signal) => signal.polarity === "positive")).toBe(true);
    expect(result.signals.some((signal) => signal.polarity === "negative")).toBe(true);
    expect(["stable", "caution"]).toContain(result.zone);
  });

  it("lowers confidence when the same positive picture is less recent", () => {
    const fresh = buildPerformanceGuide(
      {
        sleep: series("sleep", [
          [39, 6.8],
          [35, 6.9],
          [31, 7.0],
          [27, 6.8],
          [23, 6.9],
          [19, 7.0],
          [15, 7.1],
          [10, 8.1],
          [6, 8.3],
          [1, 8.4],
        ]),
        fatigue: series("fatigue", [
          [39, 3.2],
          [35, 3.1],
          [31, 3.0],
          [27, 3.2],
          [23, 3.0],
          [19, 3.1],
          [15, 3.0],
          [10, 2],
          [6, 1],
          [1, 1],
        ]),
        restingHr: series("restingHr", [
          [39, 60],
          [35, 61],
          [31, 59],
          [27, 60],
          [23, 61],
          [19, 60],
          [15, 59],
          [10, 56],
          [6, 55],
          [1, 54],
        ]),
      },
      { now: NOW }
    );
    const stale = buildPerformanceGuide(
      {
        sleep: series("sleep", [
          [39, 6.8],
          [35, 6.9],
          [31, 7.0],
          [27, 6.8],
          [23, 6.9],
          [19, 7.0],
          [15, 7.1],
          [12, 8.1],
          [8, 8.3],
          [2, 8.4],
        ]),
        fatigue: series("fatigue", [
          [39, 3.2],
          [35, 3.1],
          [31, 3.0],
          [27, 3.2],
          [23, 3.0],
          [19, 3.1],
          [15, 3.0],
          [12, 2],
          [8, 1],
          [2, 1],
        ]),
        restingHr: series("restingHr", [
          [39, 60],
          [35, 61],
          [31, 59],
          [27, 60],
          [23, 61],
          [19, 60],
          [15, 59],
          [12, 56],
          [8, 55],
          [2, 54],
        ]),
      },
      { now: NOW }
    );

    expect(stale.zone).toBeTruthy();
    expect(stale.confidence).toBeLessThan(fresh.confidence);
  });

  it("explains when the guide is dominated by one metric", () => {
    const result = buildPerformanceGuide(
      {
        fatigue: series("fatigue", [
          [1, 1],
        ]),
      },
      { now: NOW }
    );

    expect(result.patterns.some((pattern) => pattern.id === "narrow_data_warning")).toBe(true);
    expect(
      result.missingDataNotes.some((note) => note.message.includes("based mostly on fatigue"))
    ).toBe(true);
    expect(result.confidenceLabel).toBe("low");
  });
});
