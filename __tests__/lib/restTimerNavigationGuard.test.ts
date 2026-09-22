/* eslint-disable @typescript-eslint/no-require-imports */

const mockGetGeneration = jest.fn();

jest.mock("../../lib/native/restTimerNotifications", () => ({
  getRestTimerNavigationGeneration: mockGetGeneration,
}));

const generation = "timer-nav-v1:123e4567-e89b-42d3-a456-426614174000";
const expoOsKey = ["EXPO", "OS"].join("_");

function loadGuard() {
  return require("../../lib/restTimerNavigationGuard") as typeof import("../../lib/restTimerNavigationGuard");
}

function timerUrl(overrides = "") {
  return `liftinglog://exercise/42?tab=record&source=notification&timerId=timer-42-1&endAt=1000&navigationGeneration=${encodeURIComponent(generation)}${overrides}`;
}

describe("durable rest timer navigation guard", () => {
  const originalExpoOs = process.env[expoOsKey];

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env[expoOsKey] = "android";
    mockGetGeneration.mockReturnValue({ status: "available", generation });
  });

  afterAll(() => {
    if (originalExpoOs === undefined) delete process.env[expoOsKey];
    else process.env[expoOsKey] = originalExpoOs;
  });

  it.each([
    timerUrl(),
    `/exercise/42?tab=record&source=notification&timerId=timer-42-1&endAt=1000&navigationGeneration=${encodeURIComponent(generation)}`,
    `exercise/42?tab=record&source=notification&timerId=timer-42-1&endAt=1000&navigationGeneration=${encodeURIComponent(generation)}`,
  ])("accepts installed Router absolute and relative current-generation forms", (path) => {
    expect(loadGuard().guardRestTimerNavigationPath(path)).toBe(path);
  });

  it("permits a canonical legacy link only while native generation is physically absent", () => {
    const path = "liftinglog://exercise/42?tab=record&source=notification&timerId=timer-42-1&endAt=1000";
    mockGetGeneration.mockReturnValue({ status: "available", generation: null });
    expect(loadGuard().guardRestTimerNavigationPath(path)).toBe(path);

    mockGetGeneration.mockReturnValue({ status: "available", generation });
    expect(loadGuard().guardRestTimerNavigationPath(path)).toBe("/");
  });

  it.each([
    [
      "stale generation",
      timerUrl().replace(
        encodeURIComponent(generation),
        encodeURIComponent("timer-nav-v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
      ),
    ],
    ["duplicate generation", timerUrl(`&navigationGeneration=${encodeURIComponent(generation)}`)],
    ["duplicate notification source", timerUrl("&source=notification")],
    ["missing timer id", `liftinglog://exercise/42?tab=record&source=notification&endAt=1000&navigationGeneration=${encodeURIComponent(generation)}`],
    ["blank timer id", timerUrl().replace("timerId=timer-42-1", "timerId=%20%20")],
    ["nonpositive end time", timerUrl().replace("endAt=1000", "endAt=0")],
    ["malformed end time", timerUrl().replace("endAt=1000", "endAt=01")],
    ["noncanonical exercise id", timerUrl().replace("exercise/42", "exercise/042")],
    ["wrong route", timerUrl().replace("exercise/42", "settings")],
  ])("fails closed for %s", (_label, path) => {
    expect(loadGuard().guardRestTimerNavigationPath(path)).toBe("/");
  });

  it("classifies timer markers before validation but preserves unrelated source parameters", () => {
    const guard = loadGuard();
    expect(guard.isTimerLikeNavigationPath("/settings?source=share")).toBe(false);
    expect(guard.guardRestTimerNavigationPath("/settings?source=share")).toBe(
      "/settings?source=share"
    );
    expect(guard.isTimerLikeNavigationPath("/settings?source=notification")).toBe(true);
    expect(guard.guardRestTimerNavigationPath("/settings?source=notification")).toBe("/");
    expect(guard.guardRestTimerNavigationPath("/settings?timerId=old")).toBe("/");
    expect(
      guard.guardRestTimerNavigationPath(
        "/exercise/42%3Fsource%3Dnotification%26timerId%3Dold%26endAt%3D1"
      )
    ).toBe("/");
    expect(
      guard.guardRestTimerNavigationPath(
        "liftinglog://exercise/42?source%3Dnotification%26timerId%3Dold%26endAt%3D1"
      )
    ).toBe("/");
    expect(guard.guardRestTimerNavigationPath("/exercise/42%3Fsource%3Dshare")).toBe(
      "/exercise/42%3Fsource%3Dshare"
    );
  });

  it("fails closed when native generation is unreadable or unavailable", () => {
    const guard = loadGuard();
    mockGetGeneration.mockReturnValue({ status: "unreadable", code: "bad_state" });
    expect(guard.guardRestTimerNavigationPath(timerUrl())).toBe("/");
    mockGetGeneration.mockReturnValue({ status: "unavailable" });
    expect(guard.guardRestTimerNavigationPath(timerUrl())).toBe("/");
  });

  it.each([
    [{ timerId: "   ", exerciseId: 42, endAt: 1000 }, "blank timer id"],
    [{ timerId: "timer-42-1", exerciseId: 42, endAt: 0 }, "nonpositive end time"],
  ])("rejects malformed Expo payloads with %s", (data) => {
    const guard = loadGuard();
    expect(
      guard.canDeliverRestTimerNotificationResponse(
        { ...data, navigationGeneration: generation },
        guard.getRestTimerNavigationEpoch()
      )
    ).toBe(false);
  });

  it("invalidates already queued delivery epochs synchronously on quarantine", () => {
    const guard = loadGuard();
    const epoch = guard.getRestTimerNavigationEpoch();
    const data = {
      timerId: "timer-42-1",
      exerciseId: 42,
      endAt: 1000,
      navigationGeneration: generation,
    };
    expect(guard.canDeliverRestTimerNotificationResponse(data, epoch)).toBe(true);
    guard.beginRestTimerNavigationQuarantine();
    expect(guard.canDeliverRestTimerNotificationResponse(data, epoch)).toBe(false);
    expect(guard.guardRestTimerNavigationPath(timerUrl())).toBe("/");
    guard.endRestTimerNavigationQuarantine();
    expect(guard.canDeliverRestTimerNotificationResponse(data, epoch)).toBe(false);
    expect(
      guard.canDeliverRestTimerNotificationResponse(
        data,
        guard.getRestTimerNavigationEpoch()
      )
    ).toBe(true);
  });

  it("rejects a pre-quarantine retained legacy response after quarantine safely ends", () => {
    const guard = loadGuard();
    mockGetGeneration.mockReturnValue({ status: "available", generation: null });
    const epochAtRequestStart = guard.getRestTimerNavigationEpoch();
    const legacyData = {
      timerId: "timer-42-1",
      exerciseId: 42,
      endAt: 1000,
    };

    expect(
      guard.canDeliverRestTimerNotificationResponse(legacyData, epochAtRequestStart)
    ).toBe(true);
    guard.beginRestTimerNavigationQuarantine();
    guard.endRestTimerNavigationQuarantine();
    expect(
      guard.canDeliverRestTimerNotificationResponse(legacyData, epochAtRequestStart)
    ).toBe(false);
  });

  it("preserves ordinary non-Android Expo response behavior", () => {
    process.env[expoOsKey] = "ios";
    const guard = loadGuard();
    expect(guard.canDeliverRestTimerNotificationResponse({}, 0)).toBe(true);
    expect(mockGetGeneration).not.toHaveBeenCalled();
  });
});
