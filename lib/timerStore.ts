// In-memory timer store for managing multiple concurrent rest timers
// Timers persist in memory even when navigating between screens
// Includes persistent notification support

import * as Notifications from "expo-notifications";
import { Alert, AppState, type AppStateStatus, Platform } from "react-native";
import {
  canScheduleExactAlarms as canUseExactAlarms,
  cancelCompletionNotification as cancelNativeCompletionNotification,
  dismissCountdownNotification as dismissNativeCountdownNotification,
  openExactAlarmSettings as openNativeExactAlarmSettings,
  showCountdownNotification as showNativeCountdownNotification,
} from "./native/restTimerNotifications";
import type { TimerNotificationData } from "./restTimerNotificationTypes";

// ============================================================
// TOGGLE THIS FLAG FOR EXPO GO vs DEV BUILD TESTING
// Set to false when testing in Expo Go to avoid errors
// Set to true when testing notifications in a development build
// ============================================================
const ENABLE_NOTIFICATIONS = true;
const RUNNING_NOTIFICATION_CHANNEL_ID = "rest-timer";
const COMPLETION_NOTIFICATION_CHANNEL_ID = "rest-timer-complete";

export type Timer = {
  id: string;
  exerciseId: number;
  exerciseName: string;
  durationSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  startedAt: number | null;
  notificationId: string | null;
};

// Internal timer with intervalId (not exposed to subscribers)
type InternalTimer = Timer & {
  intervalId: ReturnType<typeof setInterval> | null;
  endAt: number | null;
  completionNotificationId: string | null;
  usesNativeCountdown: boolean;
  nativeCountdownRequested: boolean;
  hasNativeCompletionNotification: boolean;
};

type TimerListener = (timers: Map<number, Timer>, tick: number) => void;

export class TimerStore {
  private timers: Map<string, InternalTimer> = new Map();
  private listeners: Set<TimerListener> = new Set();
  private notificationsReady = false;
  private notificationsInitPromise: Promise<void> | null = null;
  private tick = 0;
  private appStateSubscription: { remove: () => void } | null = null;
  private appState: AppStateStatus = "active";
  private exactAlarmPermissionPromptShown = false;
  private lifecycleState: "inactive" | "active" | "suspended" = "inactive";
  private generation = 0;
  private pendingNativeOperations = new Set<Promise<unknown>>();
  private quiescePromise: Promise<void> | null = null;
  private cleanupFailed = false;

  /** Starts timer side effects only after the application is permitted to mount. */
  activateWhenAppReady(): void {
    if (this.lifecycleState === "active" || this.quiescePromise || this.cleanupFailed) {
      return;
    }

    this.lifecycleState = "active";
    const generation = ++this.generation;
    this.appState = AppState.currentState ?? "active";

    if (ENABLE_NOTIFICATIONS) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      this.notificationsInitPromise = this.track(this.initNotifications(generation));
    }

    this.appStateSubscription = AppState.addEventListener("change", (state) => {
      if (!this.isCurrent(generation)) {
        return;
      }
      this.appState = state;
      if (state === "active") {
        void this.track(this.syncRunningTimers(generation));
      }
      void this.track(this.refreshRunningTimerNotifications(generation));
    });
  }

  dispose(): void {
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.timers.forEach((timer) => {
      if (timer.intervalId) {
        clearInterval(timer.intervalId);
      }
    });
    this.timers.clear();
    this.listeners.clear();
    this.lifecycleState = "suspended";
    this.generation += 1;
  }

  /**
   * Stops JS timer work before asynchronous cleanup begins. The caller that
   * schedules a replacement restore owns native bulk retirement separately.
   */
  quiesceForReplacementRestore(): Promise<void> {
    if (this.quiescePromise) {
      return this.quiescePromise;
    }

    this.lifecycleState = "suspended";
    this.generation += 1;
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    const timers = Array.from(this.timers.values());
    const cleanupTargets = timers.map((timer) => ({
      timer,
      hasKnownNativeCountdown: timer.usesNativeCountdown || timer.nativeCountdownRequested,
      hasKnownNativeCompletion: timer.hasNativeCompletionNotification,
    }));
    timers.forEach((timer) => {
      if (timer.intervalId) {
        clearInterval(timer.intervalId);
        timer.intervalId = null;
      }
      timer.isRunning = false;
      timer.startedAt = null;
      timer.endAt = null;
    });

    const quiescePromise = (async () => {
      await this.drainNativeOperations();

      const cleanup = await Promise.allSettled(
        cleanupTargets.flatMap(({ timer, hasKnownNativeCountdown, hasKnownNativeCompletion }) => [
          this.dismissRunningTimerArtifact(timer, hasKnownNativeCountdown),
          this.cancelCompletionTimerArtifact(timer, hasKnownNativeCompletion),
        ])
      );
      await this.drainNativeOperations();

      const failures = cleanup.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      if (failures.length > 0) {
        this.cleanupFailed = true;
        throw new AggregateError(
          failures.map((result) => result.reason),
          "Failed to clear rest timer artifacts before replacement restore"
        );
      }

      this.timers.clear();
      this.cleanupFailed = false;
      this.notificationsReady = false;
      this.notificationsInitPromise = null;
      this.notify();
    })();
    this.quiescePromise = quiescePromise;
    void quiescePromise.finally(() => {
      if (this.quiescePromise === quiescePromise) {
        this.quiescePromise = null;
      }
    }).catch(() => undefined);
    return quiescePromise;
  }

  private isCurrent(generation: number): boolean {
    return this.lifecycleState === "active" && this.generation === generation;
  }

  private requireActive(): number {
    if (this.lifecycleState !== "active") {
      throw new Error("Rest timers are unavailable until the app is ready");
    }
    return this.generation;
  }

  private requireCurrent(generation: number): void {
    if (!this.isCurrent(generation)) {
      throw new Error("Rest timer operation was superseded by a lifecycle transition");
    }
  }

  private track<T>(operation: Promise<T>): Promise<T> {
    this.pendingNativeOperations.add(operation);
    operation.finally(() => this.pendingNativeOperations.delete(operation)).catch(() => undefined);
    return operation;
  }

  private async drainNativeOperations(): Promise<void> {
    while (this.pendingNativeOperations.size > 0) {
      await Promise.allSettled(Array.from(this.pendingNativeOperations));
    }
  }

  private async initNotifications(generation: number): Promise<void> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      if (!this.isCurrent(generation)) return;
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        if (!this.isCurrent(generation)) return;
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("⚠️ Notification permissions not granted");
        return;
      }

      // Android-specific channel
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(RUNNING_NOTIFICATION_CHANNEL_ID, {
          name: "Rest Timer",
          importance: Notifications.AndroidImportance.LOW, // LOW = no sound, no popup, just shows in tray
          vibrationPattern: [0],
          lightColor: "#007AFF",
          sound: undefined,
          enableVibrate: false,
        });
        if (!this.isCurrent(generation)) return;
        await Notifications.setNotificationChannelAsync(COMPLETION_NOTIFICATION_CHANNEL_ID, {
          name: "Rest Timer Complete",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#007AFF",
          enableVibrate: true,
        });
        if (!this.isCurrent(generation)) return;
      }

      this.notificationsReady = true;
      await this.track(this.refreshRunningTimerNotifications(generation));
      if (!this.isCurrent(generation)) return;
      await this.track(this.rescheduleRunningTimerCompletions(generation));
    } catch (error) {
      console.log("Error initializing notifications:", error);
    }
  }

  private async waitForNotificationsReady(generation: number): Promise<boolean> {
    if (!ENABLE_NOTIFICATIONS) {
      return false;
    }

    if (this.isCurrent(generation) && this.notificationsReady) {
      return true;
    }

    await this.notificationsInitPromise;
    return this.isCurrent(generation) && this.notificationsReady;
  }

  subscribe(listener: TimerListener): () => void {
    this.listeners.add(listener);
    listener(this.getTimersByExercise(), this.tick);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.tick += 1;
    const timersByExercise = this.getTimersByExercise();
    this.listeners.forEach((listener) => listener(timersByExercise, this.tick));
  }

  private getTimersByExercise(): Map<number, Timer> {
    const result = new Map<number, Timer>();
    this.timers.forEach((timer) => {
      result.set(timer.exerciseId, {
        id: timer.id,
        exerciseId: timer.exerciseId,
        exerciseName: timer.exerciseName,
        durationSeconds: timer.durationSeconds,
        remainingSeconds: timer.remainingSeconds,
        isRunning: timer.isRunning,
        startedAt: timer.startedAt,
        notificationId: timer.notificationId,
      });
    });
    return result;
  }

  getTimers(): Timer[] {
    return Array.from(this.timers.values()).map((t) => ({
      id: t.id,
      exerciseId: t.exerciseId,
      exerciseName: t.exerciseName,
      durationSeconds: t.durationSeconds,
      remainingSeconds: t.remainingSeconds,
      isRunning: t.isRunning,
      startedAt: t.startedAt,
      notificationId: t.notificationId,
    }));
  }

  getTimer(id: string): Timer | undefined {
    const timer = this.timers.get(id);
    if (!timer) return undefined;
    return {
      id: timer.id,
      exerciseId: timer.exerciseId,
      exerciseName: timer.exerciseName,
      durationSeconds: timer.durationSeconds,
      remainingSeconds: timer.remainingSeconds,
      isRunning: timer.isRunning,
      startedAt: timer.startedAt,
      notificationId: timer.notificationId,
    };
  }

  getTimerForExercise(exerciseId: number): Timer | undefined {
    const timer = Array.from(this.timers.values()).find((t) => t.exerciseId === exerciseId);
    if (!timer) return undefined;
    return {
      id: timer.id,
      exerciseId: timer.exerciseId,
      exerciseName: timer.exerciseName,
      durationSeconds: timer.durationSeconds,
      remainingSeconds: timer.remainingSeconds,
      isRunning: timer.isRunning,
      startedAt: timer.startedAt,
      notificationId: timer.notificationId,
    };
  }

  async createTimer(exerciseId: number, exerciseName: string, durationSeconds: number): Promise<string> {
    const generation = this.requireActive();
    const existingTimer = Array.from(this.timers.values()).find((t) => t.exerciseId === exerciseId);
    if (existingTimer) {
      await this.deleteTimer(existingTimer.id);
      this.requireCurrent(generation);
    }

    const id = `timer-${exerciseId}-${Date.now()}`;
    const notificationId = `rest-timer-${exerciseId}`;
    
    const timer: InternalTimer = {
      id,
      exerciseId,
      exerciseName,
      durationSeconds,
      remainingSeconds: durationSeconds,
      isRunning: false,
      startedAt: null,
      intervalId: null,
      endAt: null,
      notificationId,
      completionNotificationId: TimerStore.buildCompletionNotificationIdentifier(exerciseId),
      usesNativeCountdown: false,
      nativeCountdownRequested: false,
      hasNativeCompletionNotification: false,
    };
    this.timers.set(id, timer);
    this.notify();
    return id;
  }

  async startTimer(id: string): Promise<void> {
    const generation = this.requireActive();
    const timer = this.timers.get(id);
    if (!timer || timer.isRunning) return;

    if (timer.remainingSeconds <= 0) {
      timer.remainingSeconds = timer.durationSeconds;
    }

    timer.isRunning = true;
    timer.startedAt = Date.now();
    timer.endAt = timer.startedAt + timer.remainingSeconds * 1000;

    await this.track(this.syncRunningTimerNotifications(timer, generation));
    if (!this.isCurrent(generation) || !timer.isRunning) return;
    void this.track(this.maybePromptForExactAlarmPermission(generation));
    this.notify();

    timer.intervalId = setInterval(() => {
      void this.track(this.handleIntervalTick(id, generation));
    }, 1000);
  }

  private async handleIntervalTick(id: string, generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return;
    const timer = this.timers.get(id);
    if (!timer) return;

    const remaining = TimerStore.computeRemainingSeconds(timer);
    if (remaining > 0) {
      if (timer.remainingSeconds !== remaining) {
        timer.remainingSeconds = remaining;
        if (this.shouldRefreshForegroundNotification(timer)) {
          await this.track(this.showRunningTimerNotification(timer, generation));
        }
        if (!this.isCurrent(generation)) return;
        this.notify();
      }
      return;
    }

    await this.track(this.timerComplete(id, { notifyImmediately: this.appState === "active" }, generation));
  }

  private async timerComplete(
    id: string,
    options: { notifyImmediately: boolean },
    generation: number
  ): Promise<void> {
    if (!this.isCurrent(generation)) return;
    const timer = this.timers.get(id);
    if (!timer) return;

    const immediateShown = options.notifyImmediately
      ? await this.track(this.showImmediateCompletionNotification(timer, generation))
      : false;

    await this.stopTimer(id, {
      cancelCompletionNotification: immediateShown,
    }, generation);
    if (!this.isCurrent(generation)) return;

    const completedTimer = this.timers.get(id);
    if (!completedTimer) {
      return;
    }

    completedTimer.remainingSeconds = completedTimer.durationSeconds;
    this.notify();
  }

  private async syncRunningTimerNotifications(timer: InternalTimer, generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return;
    await this.track(this.showRunningTimerNotification(timer, generation));
    if (!this.isCurrent(generation)) return;
    if (Platform.OS !== "android") {
      await this.track(this.scheduleCompletionNotification(timer, generation));
    }
  }

  private async showRunningTimerNotification(timer: InternalTimer, generation: number): Promise<void> {
    if (!ENABLE_NOTIFICATIONS || !timer.endAt) return;
    if (!(await this.waitForNotificationsReady(generation))) return;
    if (!this.isCurrent(generation) || !timer.isRunning || !timer.endAt) return;

    const data = this.getNotificationData(timer);
    try {
      timer.nativeCountdownRequested = true;
      timer.hasNativeCompletionNotification = true;
      const usesNativeCountdown = await showNativeCountdownNotification({
        timerId: timer.id,
        exerciseId: timer.exerciseId,
        exerciseName: timer.exerciseName,
        endAt: timer.endAt,
      });
      if (!this.isCurrent(generation) || !timer.isRunning) return;
      timer.usesNativeCountdown = usesNativeCountdown;
      timer.nativeCountdownRequested = usesNativeCountdown;
      timer.hasNativeCompletionNotification = usesNativeCountdown;
      if (timer.usesNativeCountdown) {
        return;
      }

      await Notifications.scheduleNotificationAsync({
        identifier: timer.notificationId!,
        content: {
          title: timer.exerciseName,
          body: this.getRunningNotificationBody(timer),
          sound: false,
          sticky: Platform.OS === "android" ? true : undefined,
          autoDismiss: Platform.OS === "android" ? false : undefined,
          priority:
            Platform.OS === "android"
              ? Notifications.AndroidNotificationPriority.LOW
              : undefined,
          data,
        },
        trigger: this.getImmediateTrigger(RUNNING_NOTIFICATION_CHANNEL_ID),
      });
    } catch (error) {
      console.log("Error showing timer notification:", error);
    }
  }

  private async scheduleCompletionNotification(timer: InternalTimer, generation: number): Promise<void> {
    if (!ENABLE_NOTIFICATIONS || !timer.endAt) return;
    if (!(await this.waitForNotificationsReady(generation))) return;
    if (!this.isCurrent(generation) || !timer.isRunning || !timer.endAt) return;

    try {
      const canceled = await this.cancelCompletionNotification(timer, generation);
      if (!canceled) return;
      if (!this.isCurrent(generation) || !timer.isRunning || !timer.endAt) return;
      const notificationId = await Notifications.scheduleNotificationAsync({
        identifier:
          timer.completionNotificationId ??
          TimerStore.buildCompletionNotificationIdentifier(timer.exerciseId),
        content: {
          title: `${timer.exerciseName} Timer finished`,
          body: "Tap to return to this exercise",
          sound: true,
          priority:
            Platform.OS === "android"
              ? Notifications.AndroidNotificationPriority.HIGH
              : undefined,
          data: this.getNotificationData(timer),
        },
        trigger:
          Platform.OS === "android"
            ? {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                channelId: COMPLETION_NOTIFICATION_CHANNEL_ID,
                date: new Date(timer.endAt),
              }
            : {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: new Date(timer.endAt),
              },
      });
      if (!this.isCurrent(generation) || !timer.isRunning) return;
      timer.completionNotificationId = notificationId;
    } catch (error) {
      console.log("Error scheduling completion notification:", error);
    }
  }

  private async showImmediateCompletionNotification(timer: InternalTimer, generation: number): Promise<boolean> {
    if (!ENABLE_NOTIFICATIONS || !this.isCurrent(generation) || !this.notificationsReady) return false;

    if (Platform.OS === "android") {
      return false;
    }

    const data = this.getNotificationData(timer);
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${timer.exerciseName} Timer finished`,
          body: "Tap to return to this exercise",
          sound: true,
          data,
        },
        trigger: this.getImmediateTrigger(COMPLETION_NOTIFICATION_CHANNEL_ID),
      });
      return true;
    } catch (error) {
      console.log("Error sending completion notification:", error);
      return false;
    }
  }

  async stopTimer(
    id: string,
    options: { cancelCompletionNotification?: boolean } = {},
    generation = this.requireActive()
  ): Promise<void> {
    if (!this.isCurrent(generation)) return;
    const timer = this.timers.get(id);
    if (!timer) return;

    if (timer.isRunning) {
      timer.remainingSeconds = TimerStore.computeRemainingSeconds(timer);
    }

    if (timer.intervalId) {
      clearInterval(timer.intervalId);
      timer.intervalId = null;
    }
    timer.isRunning = false;
    timer.startedAt = null;
    timer.endAt = null;

    await this.track(this.dismissRunningTimerNotification(timer, generation));
    if (!this.isCurrent(generation)) return;

    if (options.cancelCompletionNotification ?? true) {
      const canceled = await this.track(this.cancelCompletionNotification(timer, generation));
      if (!this.isCurrent(generation)) return;
      if (!canceled) {
        throw new Error("Native completion notification cleanup was not acknowledged");
      }
    }
    if (!this.isCurrent(generation)) return;
    this.notify();
  }

  async resetTimer(id: string): Promise<void> {
    const generation = this.requireActive();
    const timer = this.timers.get(id);
    if (!timer) return;

    await this.stopTimer(id, {}, generation);
    if (!this.isCurrent(generation)) return;
    timer.remainingSeconds = timer.durationSeconds;
    timer.endAt = null;
    this.notify();
  }

  async updateTimerDuration(id: string, durationSeconds: number): Promise<void> {
    const generation = this.requireActive();
    const timer = this.timers.get(id);
    if (!timer) return;

    timer.durationSeconds = durationSeconds;
    if (timer.isRunning) {
      timer.remainingSeconds = durationSeconds;
      timer.startedAt = Date.now();
      timer.endAt = timer.startedAt + durationSeconds * 1000;
      await this.track(this.syncRunningTimerNotifications(timer, generation));
    } else {
      timer.remainingSeconds = durationSeconds;
      timer.endAt = null;
    }
    if (this.isCurrent(generation)) this.notify();
  }

  async deleteTimer(id: string): Promise<void> {
    const generation = this.requireActive();
    const timer = this.timers.get(id);
    if (!timer) return;

    if (timer.intervalId) {
      clearInterval(timer.intervalId);
      timer.intervalId = null;
    }
    timer.isRunning = false;
    timer.startedAt = null;
    timer.endAt = null;

    await this.track(this.dismissRunningTimerNotification(timer, generation));
    if (!this.isCurrent(generation)) return;
    const canceled = await this.track(this.cancelCompletionNotification(timer, generation));
    if (!this.isCurrent(generation)) return;
    if (!canceled) {
      throw new Error("Native completion notification cleanup was not acknowledged");
    }

    this.timers.delete(id);
    this.notify();
  }

  private async syncRunningTimers(generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return;
    const updates: Promise<void>[] = [];
    let shouldNotify = false;
    this.timers.forEach((timer) => {
      if (!timer.isRunning) return;
      const remaining = TimerStore.computeRemainingSeconds(timer);
      if (remaining <= 0) {
        updates.push(this.timerComplete(timer.id, { notifyImmediately: false }, generation));
        return;
      }
      if (timer.remainingSeconds !== remaining) {
        timer.remainingSeconds = remaining;
        if (this.shouldRefreshForegroundNotification(timer)) {
          updates.push(this.showRunningTimerNotification(timer, generation));
        }
        shouldNotify = true;
      }
    });
    if (updates.length > 0) {
      await Promise.all(updates);
    }
    if (shouldNotify && this.isCurrent(generation)) {
      this.notify();
    }
  }


  private async refreshRunningTimerNotifications(generation: number): Promise<void> {
    if (!ENABLE_NOTIFICATIONS || !this.isCurrent(generation) || !this.notificationsReady) return;
    const updates: Promise<void>[] = [];
    this.timers.forEach((timer) => {
      if (!timer.isRunning) return;
      if (Platform.OS === "android") {
        updates.push(this.showRunningTimerNotification(timer, generation));
        return;
      }
      if (timer.usesNativeCountdown) {
        return;
      }
      updates.push(this.showRunningTimerNotification(timer, generation));
    });
    if (updates.length > 0) {
      await Promise.all(updates);
    }
  }

  private async rescheduleRunningTimerCompletions(generation: number): Promise<void> {
    if (!ENABLE_NOTIFICATIONS || !this.isCurrent(generation) || !this.notificationsReady) return;
    if (Platform.OS === "android") return;
    const updates: Promise<void>[] = [];
    this.timers.forEach((timer) => {
      if (!timer.isRunning || !timer.endAt) return;
      updates.push(this.scheduleCompletionNotification(timer, generation));
    });
    if (updates.length > 0) {
      await Promise.all(updates);
    }
  }

  private async dismissRunningTimerNotification(
    timer: InternalTimer,
    generation: number
  ): Promise<void> {
    if (!timer.notificationId || !ENABLE_NOTIFICATIONS) return;

    try {
      if (timer.usesNativeCountdown) {
        const dismissed = await dismissNativeCountdownNotification(timer.id, timer.exerciseId);
        if (!this.isCurrent(generation)) {
          return;
        }
        if (!dismissed) {
          throw new Error("Native countdown notification cleanup is unavailable");
        }
        timer.usesNativeCountdown = false;
        timer.nativeCountdownRequested = false;
        return;
      }

      await Notifications.dismissNotificationAsync(timer.notificationId);
    } catch (error) {
      console.log("Error dismissing timer notification:", error);
    }
  }

  private async cancelCompletionNotification(
    timer: InternalTimer,
    generation: number
  ): Promise<boolean> {
    if (!timer.completionNotificationId || !ENABLE_NOTIFICATIONS) return true;

    if (Platform.OS === "android") {
      try {
        const canceled = await cancelNativeCompletionNotification(timer.id, timer.exerciseId);
        if (!this.isCurrent(generation)) return false;
        if (timer.hasNativeCompletionNotification && !canceled) {
          throw new Error("Native completion notification cleanup is unavailable");
        }
        if (canceled) {
          timer.hasNativeCompletionNotification = false;
        }
        return true;
      } catch (error) {
        console.log("Error canceling native completion notification:", error);
        return !timer.hasNativeCompletionNotification;
      }
    }

    try {
      await Notifications.cancelScheduledNotificationAsync(timer.completionNotificationId);
    } catch (error) {
      console.log("Error canceling scheduled completion notification:", error);
    }

    try {
      await Notifications.dismissNotificationAsync(timer.completionNotificationId);
    } catch (error) {
      console.log("Error dismissing completion notification:", error);
    }
    return this.isCurrent(generation);
  }

  private async dismissRunningTimerArtifact(
    timer: InternalTimer,
    hasKnownNativeArtifacts: boolean
  ): Promise<void> {
    if (!timer.notificationId || !ENABLE_NOTIFICATIONS) return;
    // A native countdown call may have been issued immediately before
    // suspension and not yet returned to set usesNativeCountdown. Android
    // retirement therefore always dismisses the timer identity first.
    if (Platform.OS === "android") {
      const dismissed = await this.track(dismissNativeCountdownNotification(timer.id, timer.exerciseId));
      if (hasKnownNativeArtifacts && !dismissed) {
        throw new Error("Native countdown notification cleanup is unavailable");
      }
      if (hasKnownNativeArtifacts) return;
    }
    await this.track(Notifications.dismissNotificationAsync(timer.notificationId));
  }

  private async cancelCompletionTimerArtifact(
    timer: InternalTimer,
    hasKnownNativeCompletion: boolean
  ): Promise<void> {
    if (!timer.completionNotificationId || !ENABLE_NOTIFICATIONS) return;
    if (Platform.OS === "android") {
      const canceled = await this.track(cancelNativeCompletionNotification(timer.id, timer.exerciseId));
      if (hasKnownNativeCompletion && !canceled) {
        throw new Error("Native completion notification cleanup is unavailable");
      }
      return;
    }
    await this.track(Notifications.cancelScheduledNotificationAsync(timer.completionNotificationId));
    await this.track(Notifications.dismissNotificationAsync(timer.completionNotificationId));
  }

  private getRunningNotificationBody(timer: InternalTimer): string {
    const remaining = TimerStore.computeRemainingSeconds(timer);
    if (this.appState === "active") {
      return `Rest: ${TimerStore.formatTime(remaining)} remaining`;
    }
    if (!timer.endAt) {
      return "Rest running";
    }
    const endTime = new Date(timer.endAt);
    const hours = endTime.getHours().toString().padStart(2, "0");
    const minutes = endTime.getMinutes().toString().padStart(2, "0");
    return `Rest ends at ${hours}:${minutes}`;
  }

  private shouldRefreshForegroundNotification(timer: InternalTimer): boolean {
    return this.appState === "active" && !timer.usesNativeCountdown;
  }

  private async maybePromptForExactAlarmPermission(generation: number): Promise<void> {
    if (Platform.OS !== "android" || this.exactAlarmPermissionPromptShown) {
      return;
    }

    if (!(await this.waitForNotificationsReady(generation)) || !this.isCurrent(generation)) {
      return;
    }

    try {
      if (await canUseExactAlarms()) {
        return;
      }

      if (!this.isCurrent(generation)) return;

      this.exactAlarmPermissionPromptShown = true;
      Alert.alert(
        "Allow Timer Alerts",
        "Allow this permission so rest timers keep working properly in the background.",
        [
          {
            text: "Not now",
            style: "cancel",
          },
          {
            text: "Allow",
            onPress: () => {
              if (this.isCurrent(generation)) {
                void this.track(openNativeExactAlarmSettings());
              }
            },
          },
        ]
      );
    } catch (error) {
      console.log("Error checking exact alarm access:", error);
    }
  }

  private getNotificationData(timer: InternalTimer): TimerNotificationData {
    return {
      timerId: timer.id,
      exerciseId: timer.exerciseId,
      exerciseName: timer.exerciseName,
      endAt: timer.endAt ?? undefined,
    };
  }

  private getImmediateTrigger(channelId: string) {
    return Platform.OS === "android" ? { channelId } : null;
  }

  private static computeRemainingSeconds(timer: InternalTimer): number {
    if (!timer.endAt) return timer.remainingSeconds;
    const remainingMs = timer.endAt - Date.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  private static buildCompletionNotificationIdentifier(exerciseId: number): string {
    return `rest-timer-complete-${exerciseId}`;
  }

  static formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
}

export const timerStore = new TimerStore();
