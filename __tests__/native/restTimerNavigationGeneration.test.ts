/* eslint-disable @typescript-eslint/no-require-imports */

const CURRENT_GENERATION = "timer-nav-v1:123e4567-e89b-42d3-a456-426614174000";

function loadAdapter(
  platformOS: "android" | "ios",
  acknowledgement: unknown = { status: "available", generation: CURRENT_GENERATION },
  includeModule = true,
  includeMethod = true
) {
  jest.resetModules();
  const getRestTimerNavigationGeneration = jest.fn(() => acknowledgement);
  const nativeModule = includeMethod ? { getRestTimerNavigationGeneration } : {};

  jest.doMock("react-native", () => ({
    Platform: { OS: platformOS },
    NativeModules: includeModule ? { RestTimerNotifications: nativeModule } : {},
  }));

  const adapter = require("../../lib/native/restTimerNotifications") as typeof import("../../lib/native/restTimerNotifications");
  return { adapter, getRestTimerNavigationGeneration };
}

describe("rest-timer navigation generation adapter", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    [{ status: "available", generation: null }, { status: "available", generation: null }],
    [
      { status: "available", generation: CURRENT_GENERATION },
      { status: "available", generation: CURRENT_GENERATION },
    ],
    [
      { status: "unreadable", code: "ERR_NATIVE_READ" },
      { status: "unreadable", code: "ERR_NATIVE_READ" },
    ],
    [{ status: "unavailable" }, { status: "unavailable" }],
  ])("accepts an exact native acknowledgement %#", (acknowledgement, expected) => {
    const { adapter, getRestTimerNavigationGeneration } = loadAdapter(
      "android",
      acknowledgement
    );

    expect(adapter.getRestTimerNavigationGeneration()).toEqual(expected);
    expect(getRestTimerNavigationGeneration).toHaveBeenCalledTimes(1);
  });

  it("preserves repeated synchronous reads", () => {
    const { adapter, getRestTimerNavigationGeneration } = loadAdapter("android");

    expect(adapter.getRestTimerNavigationGeneration()).toEqual({
      status: "available",
      generation: CURRENT_GENERATION,
    });
    expect(adapter.getRestTimerNavigationGeneration()).toEqual({
      status: "available",
      generation: CURRENT_GENERATION,
    });
    expect(getRestTimerNavigationGeneration).toHaveBeenCalledTimes(2);
  });

  it.each([
    null,
    {},
    { status: "available" },
    { status: "available", generation: "" },
    { status: "available", generation: "timer-nav-v1:123E4567-E89B-42D3-A456-426614174000" },
    { status: "available", generation: "timer-nav-v1:123e4567-e89b-12d3-a456-426614174000" },
    { status: "available", generation: `${CURRENT_GENERATION}\n` },
    { status: "available", generation: `${CURRENT_GENERATION}\r` },
    { status: "available", generation: `${CURRENT_GENERATION}\r\n` },
    { status: "available", generation: `${CURRENT_GENERATION}\u2028` },
    { status: "available", generation: `${CURRENT_GENERATION}\u2029` },
    { status: "available", generation: CURRENT_GENERATION, extra: true },
    { status: "unreadable", code: "" },
    { status: "unreadable", code: "ERR_NATIVE_READ", extra: true },
    { status: "unavailable", extra: true },
  ])("fails closed for malformed native acknowledgement %#", (acknowledgement) => {
    const { adapter } = loadAdapter("android", acknowledgement);

    expect(adapter.getRestTimerNavigationGeneration()).toEqual({
      status: "unreadable",
      code: adapter.ERR_REST_TIMER_NAVIGATION_GENERATION_INVALID_ACKNOWLEDGEMENT,
    });
  });

  it("fails closed when the synchronous native read throws", () => {
    const { adapter, getRestTimerNavigationGeneration } = loadAdapter("android");
    getRestTimerNavigationGeneration.mockImplementationOnce(() => {
      throw new Error("disk unavailable");
    });

    expect(adapter.getRestTimerNavigationGeneration()).toEqual({
      status: "unreadable",
      code: adapter.ERR_REST_TIMER_NAVIGATION_GENERATION_READ_FAILED,
    });
  });

  it.each([
    ["ios" as const, true, true],
    ["android" as const, false, false],
    ["android" as const, true, false],
  ])(
    "reports unavailable for unsupported runtime %#",
    (platformOS, includeModule, includeMethod) => {
      const { adapter, getRestTimerNavigationGeneration } = loadAdapter(
        platformOS,
        undefined,
        includeModule,
        includeMethod
      );

      expect(adapter.getRestTimerNavigationGeneration()).toEqual({ status: "unavailable" });
      expect(getRestTimerNavigationGeneration).not.toHaveBeenCalled();
    }
  );
});
