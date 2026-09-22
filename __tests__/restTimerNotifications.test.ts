/* eslint-disable @typescript-eslint/no-require-imports */
function loadAdapter(platformOS: "android" | "ios", withNativeModule = true) {
  jest.resetModules();

  const nativeModule = {
    showCountdownNotification: jest.fn().mockResolvedValue(null),
    dismissCountdownNotification: jest.fn().mockResolvedValue(null),
    cancelCompletionNotification: jest.fn().mockResolvedValue(null),
    showCompletionNotification: jest.fn().mockResolvedValue(null),
    canScheduleExactAlarms: jest.fn().mockResolvedValue(true),
    openExactAlarmSettings: jest.fn().mockResolvedValue(true),
    retireRestTimerArtifactsForReplacementRestore: jest.fn().mockResolvedValue({
      status: "retired",
      registeredTimersRetired: 2,
      displayedNotificationsCleared: true,
    }),
  };

  jest.doMock("react-native", () => ({
    Platform: { OS: platformOS },
    NativeModules: withNativeModule ? { RestTimerNotifications: nativeModule } : {},
  }));

  const adapter = require("../lib/native/restTimerNotifications") as typeof import("../lib/native/restTimerNotifications");
  return { adapter, nativeModule };
}

describe("restTimerNotifications adapter", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("calls the Android native module when available", async () => {
    const { adapter, nativeModule } = loadAdapter("android");
    const payload = {
      timerId: "timer-1",
      exerciseId: 1,
      exerciseName: "Bench Press",
      endAt: 1_234_567,
    };

    await expect(adapter.showCountdownNotification(payload)).resolves.toBe(true);
    await expect(adapter.dismissCountdownNotification(payload.timerId, payload.exerciseId)).resolves.toBe(
      true
    );
    await expect(
      adapter.cancelCompletionNotification(payload.timerId, payload.exerciseId)
    ).resolves.toBe(true);
    await expect(adapter.showCompletionNotification(payload)).resolves.toBe(true);
    await expect(adapter.canScheduleExactAlarms()).resolves.toBe(true);
    await expect(adapter.openExactAlarmSettings()).resolves.toBe(true);
    await expect(adapter.retireRestTimerArtifactsForReplacementRestore()).resolves.toEqual({
      status: "retired",
      registeredTimersRetired: 2,
      displayedNotificationsCleared: true,
    });

    expect(nativeModule.showCountdownNotification).toHaveBeenCalledWith(
      "timer-1",
      1,
      "Bench Press",
      1_234_567
    );
    expect(nativeModule.dismissCountdownNotification).toHaveBeenCalledWith("timer-1", 1);
    expect(nativeModule.cancelCompletionNotification).toHaveBeenCalledWith("timer-1", 1);
    expect(nativeModule.showCompletionNotification).toHaveBeenCalledWith(
      "timer-1",
      1,
      "Bench Press",
      1_234_567
    );
    expect(nativeModule.canScheduleExactAlarms).toHaveBeenCalledTimes(1);
    expect(nativeModule.openExactAlarmSettings).toHaveBeenCalledTimes(1);
    expect(nativeModule.retireRestTimerArtifactsForReplacementRestore).toHaveBeenCalledTimes(1);
  });

  it("falls back to a no-op on unsupported platforms", async () => {
    const { adapter, nativeModule } = loadAdapter("ios", false);
    const payload = {
      timerId: "timer-2",
      exerciseId: 2,
      exerciseName: "Squat",
      endAt: 9_876_543,
    };

    await expect(adapter.showCountdownNotification(payload)).resolves.toBe(false);
    await expect(adapter.dismissCountdownNotification(payload.timerId, payload.exerciseId)).resolves.toBe(
      false
    );
    await expect(
      adapter.cancelCompletionNotification(payload.timerId, payload.exerciseId)
    ).resolves.toBe(false);
    await expect(adapter.showCompletionNotification(payload)).resolves.toBe(false);
    await expect(adapter.canScheduleExactAlarms()).resolves.toBe(false);
    await expect(adapter.openExactAlarmSettings()).resolves.toBe(false);
    expect(adapter.supportsNativeCountdownNotifications()).toBe(false);

    expect(nativeModule.showCountdownNotification).not.toHaveBeenCalled();
    expect(nativeModule.dismissCountdownNotification).not.toHaveBeenCalled();
    expect(nativeModule.cancelCompletionNotification).not.toHaveBeenCalled();
    expect(nativeModule.showCompletionNotification).not.toHaveBeenCalled();
  });

  it("rejects retirement when the Android native capability is unavailable", async () => {
    const { adapter } = loadAdapter("android", false);

    await expect(adapter.retireRestTimerArtifactsForReplacementRestore()).rejects.toMatchObject({
      code: adapter.ERR_REST_TIMER_RETIRE_UNAVAILABLE,
    });
  });

  it("rejects retirement when an older Android module lacks the method", async () => {
    const { adapter, nativeModule } = loadAdapter("android");
    (
      nativeModule as { retireRestTimerArtifactsForReplacementRestore?: unknown }
    ).retireRestTimerArtifactsForReplacementRestore = undefined;

    await expect(adapter.retireRestTimerArtifactsForReplacementRestore()).rejects.toMatchObject({
      code: adapter.ERR_REST_TIMER_RETIRE_UNAVAILABLE,
    });
  });

  it("rejects retirement on iOS even if a similarly named module exists", async () => {
    const { adapter, nativeModule } = loadAdapter("ios");

    await expect(adapter.retireRestTimerArtifactsForReplacementRestore()).rejects.toMatchObject({
      code: adapter.ERR_REST_TIMER_RETIRE_UNAVAILABLE,
    });
    expect(nativeModule.retireRestTimerArtifactsForReplacementRestore).not.toHaveBeenCalled();
  });

  it("maps native retirement failures to the restore error", async () => {
    const { adapter, nativeModule } = loadAdapter("android");
    nativeModule.retireRestTimerArtifactsForReplacementRestore.mockRejectedValueOnce(
      new Error("persistence failed")
    );

    await expect(adapter.retireRestTimerArtifactsForReplacementRestore()).rejects.toMatchObject({
      code: adapter.ERR_REST_TIMER_RETIRE_RESTORE,
      cause: expect.objectContaining({ message: "persistence failed" }),
    });
  });

  it.each([
    null,
    {},
    { status: "retired", registeredTimersRetired: -1, displayedNotificationsCleared: true },
    { status: "retired", registeredTimersRetired: 1.5, displayedNotificationsCleared: true },
    { status: "retired", registeredTimersRetired: 1, displayedNotificationsCleared: false },
  ])("rejects malformed retirement acknowledgement %#", async (acknowledgement) => {
    const { adapter, nativeModule } = loadAdapter("android");
    nativeModule.retireRestTimerArtifactsForReplacementRestore.mockResolvedValueOnce(
      acknowledgement
    );

    await expect(adapter.retireRestTimerArtifactsForReplacementRestore()).rejects.toMatchObject({
      code: adapter.ERR_REST_TIMER_RETIRE_RESTORE,
    });
  });

  it("preserves idempotent native retirement acknowledgements", async () => {
    const { adapter, nativeModule } = loadAdapter("android");
    nativeModule.retireRestTimerArtifactsForReplacementRestore
      .mockResolvedValueOnce({
        status: "retired",
        registeredTimersRetired: 3,
        displayedNotificationsCleared: true,
      })
      .mockResolvedValueOnce({
        status: "retired",
        registeredTimersRetired: 0,
        displayedNotificationsCleared: true,
      });

    await expect(adapter.retireRestTimerArtifactsForReplacementRestore()).resolves.toMatchObject({
      registeredTimersRetired: 3,
    });
    await expect(adapter.retireRestTimerArtifactsForReplacementRestore()).resolves.toMatchObject({
      registeredTimersRetired: 0,
    });
  });
});
