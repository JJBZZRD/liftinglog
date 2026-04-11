import {
  USER_METRIC_DEFINITIONS,
  buildUserMetricCheckinInput,
  formatUserMetricValue,
  getUserMetricDefinition,
  getUserMetricNumericValue,
  parseUserMetricInputValue,
} from "../../lib/userMetrics/definitions";

describe("lib/userMetrics/definitions", () => {
  it("exposes fatigue as the score-based recovery metric", () => {
    const metricKeys = USER_METRIC_DEFINITIONS.map((definition) => definition.key as string);

    expect(getUserMetricDefinition("fatigue")?.label).toBe("Fatigue");
    expect(getUserMetricDefinition("readiness")).toBeNull();
    expect(metricKeys).toContain("fatigue");
    expect(metricKeys).not.toContain("readiness");
  });

  it("maps fatigue values to fatigue_score checkin writes", () => {
    expect(buildUserMetricCheckinInput("fatigue", 4)).toEqual({ fatigue_score: 4 });
    expect(parseUserMetricInputValue("fatigue", "4.2")).toBe(4);
    expect(formatUserMetricValue("fatigue", 4, "kg")).toBe("4/5");
  });

  it("reads fatigue scores from user checkins", () => {
    const checkin = {
      id: 1,
      uid: "checkin-1",
      recordedAt: Date.now(),
      context: null,
      bodyweightKg: null,
      waistCm: null,
      sleepStartAt: null,
      sleepEndAt: null,
      sleepHours: null,
      restingHrBpm: null,
      fatigueScore: 3,
      sorenessScore: 2,
      stressScore: 1,
      steps: null,
      note: null,
      source: null,
    };

    expect(getUserMetricNumericValue(checkin, "fatigue")).toBe(3);
  });
});
