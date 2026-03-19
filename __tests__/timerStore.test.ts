const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

type LoadedTimerStore = {
  TimerStore: typeof import("../lib/timerStore").TimerStore;
  notifications: any;
  nativeModule: any;
  emitAppState: (state: string) => Promise<void>;
};

function loadTimerStore(
  platformOS: "android" | "ios",
  withNativeModule = true,
  options: {
    getPermissionsAsync?: () => Promise<{ status: string }>;
    requestPermissionsAsync?: () => Promise<{ status: string }>;
    setNotificationChannelAsync?: () => Promise<unknown>;
  } = {}
): LoadedTimerStore {
  jest.resetModules();

  const listeners: Array<(state: string) => void> = [];
  const notifications = {
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest
      .fn()
      .mockImplementation(options.getPermissionsAsync ?? (async () => ({ status: "granted" }))),
    requestPermissionsAsync: jest
      .fn()
      .mockImplementation(options.requestPermissionsAsync ?? (async () => ({ status: "granted" }))),
    setNotificationChannelAsync: jest
      .fn()
      .mockImplementation(options.setNotificationChannelAsync ?? (async () => null)),
    scheduleNotificationAsync: jest
      .fn()
      .mockImplementation(async (request: { identifier?: string }) => request.identifier ?? "notification-id"),
    dismissNotificationAsync: jest.fn().mockResolvedValue(null),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(null),
    AndroidImportance: { LOW: 2, HIGH: 4 },
    AndroidNotificationPriority: { LOW: "low", HIGH: "high" },
    SchedulableTriggerInputTypes: { DATE: "date" },
  };
  const nativeModule = {
    showCountdownNotification: jest.fn().mockResolvedValue(null),
    dismissCountdownNotification: jest.fn().mockResolvedValue(null),
    cancelCompletionNotification: jest.fn().mockResolvedValue(null),
    showCompletionNotification: jest.fn().mockResolvedValue(null),
  };

  jest.doMock("expo-notifications", () => notifications);
  jest.doMock("react-native", () => ({
    Platform: { OS: platformOS },
    NativeModules: withNativeModule ? { RestTimerNotifications: nativeModule } : {},
    AppState: {
      currentState: "active",
      addEventListener: jest.fn((_event: string, listener: (state: string) => void) => {
        listeners.push(listener);
        return {
          remove: () => {
            const index = listeners.indexOf(listener);
            if (index >= 0) {
              listeners.splice(index, 1);
            }
          },
        };
      }),
    },
  }));

  const timerStoreModule = require("../lib/timerStore") as typeof import("../lib/timerStore");
  timerStoreModule.timerStore.dispose();

  return {
    TimerStore: timerStoreModule.TimerStore,
    notifications,
    nativeModule,
    emitAppState: async (state: string) => {
      listeners.forEach((listener) => listener(state));
      await flushPromises();
    },
  };
}

describe("TimerStore", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-18T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("starts Android timers with a native countdown notification and leaves completion scheduling to native Android", async () => {
    const { TimerStore, notifications, nativeModule } = loadTimerStore("android");
    const store = new TimerStore();
    await flushPromises();

    const timerId = await store.createTimer(1, "Bench Press", 90);
    const expectedEndAt = Date.now() + 90_000;

    await store.startTimer(timerId);

    expect(nativeModule.showCountdownNotification).toHaveBeenCalledWith(
      timerId,
      1,
      "Bench Press",
      expectedEndAt
    );
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "rest-timer-complete-1",
      })
    );

    store.dispose();
  });

  it("waits for notification initialization before attaching the first Android background notification flow", async () => {
    let resolvePermissions: ((value: { status: string }) => void) | null = null;
    const permissionsPromise = new Promise<{ status: string }>((resolve) => {
      resolvePermissions = resolve;
    });

    const { TimerStore, nativeModule } = loadTimerStore("android", true, {
      getPermissionsAsync: () => permissionsPromise,
    });
    const store = new TimerStore();

    const timerId = await store.createTimer(7, "Incline Press", 75);
    const startPromise = store.startTimer(timerId);
    await flushPromises();

    expect(nativeModule.showCountdownNotification).not.toHaveBeenCalled();

    resolvePermissions?.({ status: "granted" });
    await startPromise;

    expect(nativeModule.showCountdownNotification).toHaveBeenCalledWith(
      timerId,
      7,
      "Incline Press",
      Date.now() + 75_000
    );

    store.dispose();
  });

  it("stopping an Android timer dismisses the native countdown and cancels the completion alert", async () => {
    const { TimerStore, notifications, nativeModule } = loadTimerStore("android");
    const store = new TimerStore();
    await flushPromises();

    const timerId = await store.createTimer(2, "Squat", 120);
    await store.startTimer(timerId);
    nativeModule.dismissCountdownNotification.mockClear();
    notifications.cancelScheduledNotificationAsync.mockClear();

    await store.stopTimer(timerId);

    expect(nativeModule.dismissCountdownNotification).toHaveBeenCalledWith(timerId, 2);
    expect(nativeModule.cancelCompletionNotification).toHaveBeenCalledWith(
      timerId,
      2
    );
    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.dismissNotificationAsync).not.toHaveBeenCalledWith(
      "rest-timer-complete-2"
    );

    store.dispose();
  });

  it("resetting and deleting Android timers clean up native countdown notifications", async () => {
    const { TimerStore, notifications, nativeModule } = loadTimerStore("android");
    const store = new TimerStore();
    await flushPromises();

    const resetTimerId = await store.createTimer(3, "Deadlift", 60);
    await store.startTimer(resetTimerId);
    nativeModule.dismissCountdownNotification.mockClear();

    await store.resetTimer(resetTimerId);

    expect(nativeModule.dismissCountdownNotification).toHaveBeenCalledWith(resetTimerId, 3);
    expect(store.getTimer(resetTimerId)?.remainingSeconds).toBe(60);
    expect(store.getTimer(resetTimerId)?.isRunning).toBe(false);

    const deleteTimerId = await store.createTimer(4, "Row", 45);
    await store.startTimer(deleteTimerId);
    nativeModule.dismissCountdownNotification.mockClear();
    notifications.cancelScheduledNotificationAsync.mockClear();
    notifications.dismissNotificationAsync.mockClear();

    await store.deleteTimer(deleteTimerId);

    expect(nativeModule.dismissCountdownNotification).toHaveBeenCalledWith(deleteTimerId, 4);
    expect(nativeModule.cancelCompletionNotification).toHaveBeenCalledWith(
      deleteTimerId,
      4
    );
    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.dismissNotificationAsync).not.toHaveBeenCalledWith(
      "rest-timer-complete-4"
    );
    expect(store.getTimer(deleteTimerId)).toBeUndefined();

    store.dispose();
  });

  it("reconciles expired Android timers on app resume without canceling the native completion alert", async () => {
    const { TimerStore, notifications, nativeModule, emitAppState } = loadTimerStore("android");
    const store = new TimerStore();
    await flushPromises();

    const timerId = await store.createTimer(5, "Overhead Press", 30);
    await store.startTimer(timerId);
    nativeModule.dismissCountdownNotification.mockClear();
    notifications.cancelScheduledNotificationAsync.mockClear();
    notifications.dismissNotificationAsync.mockClear();

    await emitAppState("background");
    jest.setSystemTime(new Date("2026-03-18T12:00:45.000Z"));
    await emitAppState("active");

    expect(store.getTimer(timerId)?.isRunning).toBe(false);
    expect(store.getTimer(timerId)?.remainingSeconds).toBe(0);
    expect(nativeModule.dismissCountdownNotification).toHaveBeenCalledWith(timerId, 5);
    expect(nativeModule.showCompletionNotification).not.toHaveBeenCalled();
    expect(nativeModule.cancelCompletionNotification).not.toHaveBeenCalled();
    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.dismissNotificationAsync).not.toHaveBeenCalledWith(
      "rest-timer-complete-5"
    );

    store.dispose();
  });

  it("uses iOS fallback notifications with a live foreground body and a background end-time summary", async () => {
    const { TimerStore, notifications, emitAppState } = loadTimerStore("ios", false);
    const store = new TimerStore();
    await flushPromises();

    const timerId = await store.createTimer(6, "Lunge", 90);
    const expectedEndAt = Date.now() + 90_000;

    await store.startTimer(timerId);

    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "rest-timer-6",
        content: expect.objectContaining({
          title: "Lunge",
          body: "Rest: 01:30 remaining",
          data: expect.objectContaining({
            timerId,
            exerciseId: 6,
            exerciseName: "Lunge",
            endAt: expectedEndAt,
          }),
        }),
        trigger: null,
      })
    );
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "rest-timer-complete-6",
        trigger: expect.objectContaining({
          type: "date",
          date: new Date(expectedEndAt),
        }),
      })
    );

    notifications.scheduleNotificationAsync.mockClear();
    await emitAppState("background");

    const expectedEndTime = new Date(expectedEndAt);
    const expectedBody = `Rest ends at ${expectedEndTime
      .getHours()
      .toString()
      .padStart(2, "0")}:${expectedEndTime.getMinutes().toString().padStart(2, "0")}`;

    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "rest-timer-6",
        content: expect.objectContaining({
          body: expectedBody,
        }),
      })
    );

    store.dispose();
  });

  it("formats timer values as MM:SS", () => {
    const { TimerStore } = loadTimerStore("ios", false);

    expect(TimerStore.formatTime(0)).toBe("00:00");
    expect(TimerStore.formatTime(90)).toBe("01:30");
    expect(TimerStore.formatTime(3600)).toBe("60:00");
  });
});
