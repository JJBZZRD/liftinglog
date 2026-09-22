const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

type LoadedTimerStore = {
  TimerStore: typeof import("../lib/timerStore").TimerStore;
  notifications: any;
  nativeModule: any;
  alert: any;
  appState: any;
  emitAppState: (state: string) => Promise<void>;
};

function loadTimerStore(
  platformOS: "android" | "ios",
  withNativeModule = true,
  options: {
    getPermissionsAsync?: () => Promise<{ status: string }>;
    requestPermissionsAsync?: () => Promise<{ status: string }>;
    setNotificationChannelAsync?: () => Promise<unknown>;
    nativeAdapter?: Record<string, jest.Mock>;
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
    canScheduleExactAlarms: jest.fn().mockResolvedValue(true),
    openExactAlarmSettings: jest.fn().mockResolvedValue(true),
  };
  const alert = {
    alert: jest.fn(),
  };
  const appState = {
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
  };

  jest.doMock("expo-notifications", () => notifications);
  jest.doMock("react-native", () => ({
    Platform: { OS: platformOS },
    NativeModules: withNativeModule ? { RestTimerNotifications: nativeModule } : {},
    Alert: alert,
    AppState: appState,
  }));
  if (options.nativeAdapter) {
    jest.doMock("../lib/native/restTimerNotifications", () => options.nativeAdapter);
  } else {
    jest.dontMock("../lib/native/restTimerNotifications");
  }

  const timerStoreModule = require("../lib/timerStore") as typeof import("../lib/timerStore");
  timerStoreModule.timerStore.dispose();

  return {
    TimerStore: timerStoreModule.TimerStore,
    notifications,
    nativeModule,
    alert,
    appState,
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

  it("creates the Android completion channel with default system sound semantics", async () => {
    const { TimerStore, notifications } = loadTimerStore("android");
    const store = new TimerStore();
    store.activateWhenAppReady();
    await flushPromises();

    const completionChannelCall = notifications.setNotificationChannelAsync.mock.calls.find(
      ([channelId]: [string]) => channelId === "rest-timer-complete"
    );

    expect(completionChannelCall).toBeDefined();
    expect(completionChannelCall[1]).toEqual(
      expect.objectContaining({
        importance: notifications.AndroidImportance.HIGH,
        enableVibrate: true,
      })
    );
    expect(completionChannelCall[1]).not.toHaveProperty("sound");

    store.dispose();
  });

  it("starts Android timers with a native countdown notification and leaves completion scheduling to native Android", async () => {
    const { TimerStore, notifications, nativeModule, alert } = loadTimerStore("android");
    const store = new TimerStore();
    store.activateWhenAppReady();
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
    expect(alert.alert).not.toHaveBeenCalled();

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
    store.activateWhenAppReady();

    const timerId = await store.createTimer(7, "Incline Press", 75);
    const startPromise = store.startTimer(timerId);
    await flushPromises();

    expect(nativeModule.showCountdownNotification).not.toHaveBeenCalled();

    (resolvePermissions as ((value: { status: string }) => void) | null)?.({
      status: "granted",
    });
    await startPromise;

    expect(nativeModule.showCountdownNotification).toHaveBeenCalledWith(
      timerId,
      7,
      "Incline Press",
      Date.now() + 75_000
    );

    store.dispose();
  });

  it("prompts for exact alarm access on the first Android timer start when Android reports inexact delivery", async () => {
    const { TimerStore, nativeModule, alert } = loadTimerStore("android");
    nativeModule.canScheduleExactAlarms.mockResolvedValue(false);
    const store = new TimerStore();
    store.activateWhenAppReady();
    await flushPromises();

    const timerId = await store.createTimer(8, "Paused Squat", 45);
    await store.startTimer(timerId);
    await flushPromises();

    expect(nativeModule.canScheduleExactAlarms).toHaveBeenCalledTimes(1);
    expect(alert.alert).toHaveBeenCalledWith(
      "Allow Timer Alerts",
      "Allow this permission so rest timers keep working properly in the background.",
      expect.any(Array)
    );

    store.dispose();
  });

  it("stopping an Android timer dismisses the native countdown and cancels the completion alert", async () => {
    const { TimerStore, notifications, nativeModule } = loadTimerStore("android");
    const store = new TimerStore();
    store.activateWhenAppReady();
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
    store.activateWhenAppReady();
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
    store.activateWhenAppReady();
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
    expect(store.getTimer(timerId)?.remainingSeconds).toBe(30);
    expect(nativeModule.dismissCountdownNotification).toHaveBeenCalledWith(timerId, 5);
    expect(nativeModule.showCompletionNotification).not.toHaveBeenCalled();
    expect(nativeModule.cancelCompletionNotification).not.toHaveBeenCalled();
    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.dismissNotificationAsync).not.toHaveBeenCalledWith(
      "rest-timer-complete-5"
    );

    store.dispose();
  });

  it("resets completed timers back to their configured duration", async () => {
    const { TimerStore } = loadTimerStore("ios", false);
    const store = new TimerStore();
    store.activateWhenAppReady();
    await flushPromises();

    const timerId = await store.createTimer(9, "Hammer Curl", 10);
    await store.startTimer(timerId);

    await jest.advanceTimersByTimeAsync(10_000);
    await flushPromises();

    expect(store.getTimer(timerId)?.isRunning).toBe(false);
    expect(store.getTimer(timerId)?.remainingSeconds).toBe(10);

    store.dispose();
  });

  it("uses iOS fallback notifications with a live foreground body and a background end-time summary", async () => {
    const { TimerStore, notifications, emitAppState } = loadTimerStore("ios", false);
    const store = new TimerStore();
    store.activateWhenAppReady();
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

  it("keeps the singleton import inert until the ready lifecycle activates it", () => {
    const { notifications, appState } = loadTimerStore("android");

    expect(notifications.setNotificationHandler).not.toHaveBeenCalled();
    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(appState.addEventListener).not.toHaveBeenCalled();
  });

  it("activates side effects once when readiness is reached", async () => {
    const { TimerStore, notifications, appState } = loadTimerStore("android");
    const store = new TimerStore();

    store.activateWhenAppReady();
    store.activateWhenAppReady();
    await flushPromises();

    expect(notifications.setNotificationHandler).toHaveBeenCalledTimes(1);
    expect(notifications.getPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(appState.addEventListener).toHaveBeenCalledTimes(1);

    store.dispose();
  });

  it("quiesces before a held permission continuation can schedule timer notifications", async () => {
    let resolvePermissions: ((value: { status: string }) => void) | undefined;
    const permissions = new Promise<{ status: string }>((resolve) => {
      resolvePermissions = resolve;
    });
    const { TimerStore, nativeModule, appState } = loadTimerStore("android", true, {
      getPermissionsAsync: () => permissions,
    });
    const store = new TimerStore();
    store.activateWhenAppReady();
    const timerId = await store.createTimer(23, "Paused Press", 45);
    const start = store.startTimer(timerId);
    const quiesce = store.quiesceForReplacementRestore();

    expect(appState.addEventListener).toHaveBeenCalledTimes(1);
    (resolvePermissions as (value: { status: string }) => void)({ status: "granted" });
    await quiesce;
    await start;

    expect(nativeModule.showCountdownNotification).not.toHaveBeenCalled();
    expect(store.getTimers()).toEqual([]);
    await expect(store.createTimer(24, "Blocked", 30)).rejects.toThrow("unavailable");
  });

  it("drains an issued native countdown call before releasing its timer identity", async () => {
    let resolveNativeCountdown: (() => void) | undefined;
    const nativeCountdown = new Promise<void>((resolve) => {
      resolveNativeCountdown = resolve;
    });
    const { TimerStore, nativeModule } = loadTimerStore("android");
    nativeModule.showCountdownNotification.mockImplementation(() => nativeCountdown);
    const store = new TimerStore();
    store.activateWhenAppReady();
    await flushPromises();
    const timerId = await store.createTimer(241, "In-flight Press", 45);
    const start = store.startTimer(timerId);
    await flushPromises();
    const quiesce = store.quiesceForReplacementRestore();

    expect(store.getTimer(timerId)).toBeDefined();
    (resolveNativeCountdown as () => void)();
    await quiesce;
    await start;

    expect(nativeModule.dismissCountdownNotification).toHaveBeenCalledWith(timerId, 241);
    expect(store.getTimer(timerId)).toBeUndefined();
  });

  it("rejects a stale replacement create after quiescence even if a new generation activates", async () => {
    let resolveDismiss: (() => void) | undefined;
    const dismiss = new Promise<void>((resolve) => {
      resolveDismiss = resolve;
    });
    const { TimerStore, nativeModule } = loadTimerStore("android");
    const store = new TimerStore();
    store.activateWhenAppReady();
    await flushPromises();
    const timerId = await store.createTimer(242, "Existing Press", 45);
    await store.startTimer(timerId);
    nativeModule.dismissCountdownNotification.mockImplementation(() => dismiss);

    const replacement = store.createTimer(242, "Replacement Press", 30);
    await flushPromises();
    const quiesce = store.quiesceForReplacementRestore();
    (resolveDismiss as () => void)();
    await quiesce;

    store.activateWhenAppReady();
    await expect(replacement).rejects.toThrow("superseded");
    expect(store.getTimers()).toEqual([]);

    const freshId = await store.createTimer(242, "Fresh Press", 30);
    expect(store.getTimer(freshId)?.exerciseName).toBe("Fresh Press");
    store.dispose();
  });

  it("rejects quiescence and preserves timer identities when cleanup fails", async () => {
    const { TimerStore, nativeModule } = loadTimerStore("android");
    const store = new TimerStore();
    store.activateWhenAppReady();
    await flushPromises();
    const timerId = await store.createTimer(25, "Cleanup Press", 45);
    await store.startTimer(timerId);
    nativeModule.dismissCountdownNotification.mockRejectedValueOnce(new Error("native cleanup failed"));

    await expect(store.quiesceForReplacementRestore()).rejects.toThrow("Failed to clear rest timer artifacts");
    expect(store.getTimer(timerId)).toBeDefined();
    await expect(store.createTimer(26, "Still blocked", 30)).rejects.toThrow("unavailable");
  });

  it("retains immutable native ownership when completion cleanup fails after countdown dismissal", async () => {
    let resolveCancel: ((value: boolean) => void) | undefined;
    const heldCancel = new Promise<boolean>((resolve) => {
      resolveCancel = resolve;
    });
    const cancelCompletionNotification = jest
      .fn()
      .mockImplementationOnce(() => heldCancel)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const dismissCountdownNotification = jest.fn().mockResolvedValue(true);
    const nativeAdapter = {
      showCountdownNotification: jest.fn().mockResolvedValue(true),
      dismissCountdownNotification,
      cancelCompletionNotification,
      canScheduleExactAlarms: jest.fn().mockResolvedValue(true),
      openExactAlarmSettings: jest.fn().mockResolvedValue(true),
    };
    const { TimerStore } = loadTimerStore("android", true, { nativeAdapter });
    const store = new TimerStore();
    store.activateWhenAppReady();
    await flushPromises();
    const timerId = await store.createTimer(28, "Ownership Press", 45);
    await store.startTimer(timerId);

    const firstAttempt = store.quiesceForReplacementRestore();
    await flushPromises();
    await flushPromises();
    expect(dismissCountdownNotification).toHaveBeenCalledWith(timerId, 28);
    (resolveCancel as (value: boolean) => void)(false);
    await expect(firstAttempt).rejects.toThrow("Failed to clear rest timer artifacts");
    expect(store.getTimer(timerId)).toBeDefined();

    await expect(store.quiesceForReplacementRestore()).rejects.toThrow("Failed to clear rest timer artifacts");
    expect(store.getTimer(timerId)).toBeDefined();

    await expect(store.quiesceForReplacementRestore()).resolves.toBeUndefined();
    expect(store.getTimer(timerId)).toBeUndefined();
  });

  it("does not let a stale ordinary stop erase native ownership needed by a retirement retry", async () => {
    let resolveDismiss: ((value: boolean) => void) | undefined;
    let resolveCancel: ((value: boolean) => void) | undefined;
    const heldDismiss = new Promise<boolean>((resolve) => {
      resolveDismiss = resolve;
    });
    const heldCancel = new Promise<boolean>((resolve) => {
      resolveCancel = resolve;
    });
    const dismissCountdownNotification = jest
      .fn()
      .mockImplementationOnce(() => heldDismiss)
      .mockResolvedValue(true);
    const cancelCompletionNotification = jest
      .fn()
      .mockImplementationOnce(() => heldCancel)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const nativeAdapter = {
      showCountdownNotification: jest.fn().mockResolvedValue(true),
      dismissCountdownNotification,
      cancelCompletionNotification,
      canScheduleExactAlarms: jest.fn().mockResolvedValue(true),
      openExactAlarmSettings: jest.fn().mockResolvedValue(true),
    };
    const { TimerStore } = loadTimerStore("android", true, { nativeAdapter });
    const store = new TimerStore();
    store.activateWhenAppReady();
    await flushPromises();
    const timerId = await store.createTimer(29, "Stale Stop Press", 45);
    await store.startTimer(timerId);

    const stop = store.stopTimer(timerId);
    await flushPromises();
    const firstAttempt = store.quiesceForReplacementRestore();
    (resolveDismiss as (value: boolean) => void)(true);
    await stop;
    await flushPromises();
    (resolveCancel as (value: boolean) => void)(false);

    await expect(firstAttempt).rejects.toThrow("Failed to clear rest timer artifacts");
    expect(store.getTimer(timerId)).toBeDefined();
    await expect(store.quiesceForReplacementRestore()).rejects.toThrow("Failed to clear rest timer artifacts");
    expect(store.getTimer(timerId)).toBeDefined();
    await expect(store.quiesceForReplacementRestore()).resolves.toBeUndefined();
    expect(store.getTimer(timerId)).toBeUndefined();
  });

  it("retains native completion ownership after an active stop cancellation failure until retirement succeeds", async () => {
    const cancelCompletionNotification = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const nativeAdapter = {
      showCountdownNotification: jest.fn().mockResolvedValue(true),
      dismissCountdownNotification: jest.fn().mockResolvedValue(true),
      cancelCompletionNotification,
      canScheduleExactAlarms: jest.fn().mockResolvedValue(true),
      openExactAlarmSettings: jest.fn().mockResolvedValue(true),
    };
    const { TimerStore } = loadTimerStore("android", true, { nativeAdapter });
    const store = new TimerStore();
    store.activateWhenAppReady();
    await flushPromises();
    const timerId = await store.createTimer(30, "Active Stop Press", 45);
    await store.startTimer(timerId);

    await expect(store.stopTimer(timerId)).rejects.toThrow(
      "Native completion notification cleanup was not acknowledged"
    );
    expect(store.getTimer(timerId)).toEqual(expect.objectContaining({ isRunning: false }));

    await expect(store.quiesceForReplacementRestore()).rejects.toThrow("Failed to clear rest timer artifacts");
    expect(store.getTimer(timerId)).toBeDefined();
    await expect(store.quiesceForReplacementRestore()).rejects.toThrow("Failed to clear rest timer artifacts");
    expect(store.getTimer(timerId)).toBeDefined();
    await expect(store.quiesceForReplacementRestore()).resolves.toBeUndefined();
    expect(store.getTimer(timerId)).toBeUndefined();
  });

  it("retains a stopped timer when active deletion cannot cancel its native completion", async () => {
    const nativeAdapter = {
      showCountdownNotification: jest.fn().mockResolvedValue(true),
      dismissCountdownNotification: jest.fn().mockResolvedValue(true),
      cancelCompletionNotification: jest.fn().mockResolvedValue(false),
      canScheduleExactAlarms: jest.fn().mockResolvedValue(true),
      openExactAlarmSettings: jest.fn().mockResolvedValue(true),
    };
    const { TimerStore } = loadTimerStore("android", true, { nativeAdapter });
    const store = new TimerStore();
    store.activateWhenAppReady();
    await flushPromises();
    const timerId = await store.createTimer(31, "Delete Failure Press", 45);
    await store.startTimer(timerId);

    await expect(store.deleteTimer(timerId)).rejects.toThrow(
      "Native completion notification cleanup was not acknowledged"
    );
    expect(store.getTimer(timerId)).toEqual(expect.objectContaining({ isRunning: false }));
    store.dispose();
  });

  it("ignores an old activation generation and allows a clean later activation", async () => {
    let resolvePermissions: ((value: { status: string }) => void) | undefined;
    const permissions = new Promise<{ status: string }>((resolve) => {
      resolvePermissions = resolve;
    });
    const { TimerStore, notifications, nativeModule } = loadTimerStore("android", true, {
      getPermissionsAsync: () => permissions,
    });
    const store = new TimerStore();
    store.activateWhenAppReady();
    const quiesce = store.quiesceForReplacementRestore();
    (resolvePermissions as (value: { status: string }) => void)({ status: "granted" });
    await quiesce;

    store.activateWhenAppReady();
    await flushPromises();
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(2);

    const timerId = await store.createTimer(27, "Fresh Press", 30);
    await store.startTimer(timerId);
    expect(nativeModule.showCountdownNotification).toHaveBeenCalledWith(
      timerId,
      27,
      "Fresh Press",
      Date.now() + 30_000
    );

    store.dispose();
  });
});
