// In-memory timer store for managing multiple concurrent rest timers
// Timers persist in memory even when navigating between screens
// Includes persistent notification support

import * as Notifications from "expo-notifications";
import { AppState, type AppStateStatus, Platform } from "react-native";
import {
  cancelCompletionNotification as cancelNativeCompletionNotification,
  dismissCountdownNotification as dismissNativeCountdownNotification,
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

// Configure notifications (only if enabled)
if (ENABLE_NOTIFICATIONS) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

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
};

type TimerListener = (timers: Map<number, Timer>, tick: number) => void;

export class TimerStore {
  private timers: Map<string, InternalTimer> = new Map();
  private listeners: Set<TimerListener> = new Set();
  private notificationsReady = false;
  private notificationsInitPromise: Promise<void> | null = null;
  private tick = 0;
  private appStateSubscription: { remove: () => void } | null = null;
  private appState: AppStateStatus = AppState.currentState ?? "active";

  constructor() {
    if (ENABLE_NOTIFICATIONS) {
      this.notificationsInitPromise = this.initNotifications();
    }
    this.appStateSubscription = AppState.addEventListener("change", (state) => {
      this.appState = state;
      if (state === "active") {
        void this.syncRunningTimers();
      }
      void this.refreshRunningTimerNotifications();
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
  }

  private async initNotifications() {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
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
        await Notifications.setNotificationChannelAsync(COMPLETION_NOTIFICATION_CHANNEL_ID, {
          name: "Rest Timer Complete",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#007AFF",
          sound: "default",
          enableVibrate: true,
        });
      }

      this.notificationsReady = true;
      await this.refreshRunningTimerNotifications();
      await this.rescheduleRunningTimerCompletions();
    } catch (error) {
      console.log("Error initializing notifications:", error);
    }
  }

  private async waitForNotificationsReady(): Promise<boolean> {
    if (!ENABLE_NOTIFICATIONS) {
      return false;
    }

    if (this.notificationsReady) {
      return true;
    }

    await this.notificationsInitPromise;
    return this.notificationsReady;
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
    const existingTimer = Array.from(this.timers.values()).find((t) => t.exerciseId === exerciseId);
    if (existingTimer) {
      await this.deleteTimer(existingTimer.id);
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
    };
    this.timers.set(id, timer);
    this.notify();
    return id;
  }

  async startTimer(id: string): Promise<void> {
    const timer = this.timers.get(id);
    if (!timer || timer.isRunning) return;

    if (timer.remainingSeconds <= 0) {
      timer.remainingSeconds = timer.durationSeconds;
    }

    timer.isRunning = true;
    timer.startedAt = Date.now();
    timer.endAt = timer.startedAt + timer.remainingSeconds * 1000;

    await this.syncRunningTimerNotifications(timer);
    this.notify();

    timer.intervalId = setInterval(() => {
      void this.handleIntervalTick(id);
    }, 1000);
  }

  private async handleIntervalTick(id: string): Promise<void> {
    const timer = this.timers.get(id);
    if (!timer) return;

    const remaining = TimerStore.computeRemainingSeconds(timer);
    if (remaining > 0) {
      if (timer.remainingSeconds !== remaining) {
        timer.remainingSeconds = remaining;
        if (this.shouldRefreshForegroundNotification(timer)) {
          await this.showRunningTimerNotification(timer);
        }
        this.notify();
      }
      return;
    }

    await this.timerComplete(id, { notifyImmediately: this.appState === "active" });
  }

  private async timerComplete(
    id: string,
    options: { notifyImmediately: boolean }
  ): Promise<void> {
    const timer = this.timers.get(id);
    if (!timer) return;

    const immediateShown = options.notifyImmediately
      ? await this.showImmediateCompletionNotification(timer)
      : false;

    await this.stopTimer(id, {
      cancelCompletionNotification: immediateShown,
    });
  }

  private async syncRunningTimerNotifications(timer: InternalTimer): Promise<void> {
    await this.showRunningTimerNotification(timer);
    if (Platform.OS !== "android") {
      await this.scheduleCompletionNotification(timer);
    }
  }

  private async showRunningTimerNotification(timer: InternalTimer): Promise<void> {
    if (!ENABLE_NOTIFICATIONS || !timer.endAt) return;
    if (!(await this.waitForNotificationsReady())) return;
    if (!timer.isRunning || !timer.endAt) return;

    const data = this.getNotificationData(timer);
    try {
      timer.usesNativeCountdown = await showNativeCountdownNotification({
        timerId: timer.id,
        exerciseId: timer.exerciseId,
        exerciseName: timer.exerciseName,
        endAt: timer.endAt,
      });
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

  private async scheduleCompletionNotification(timer: InternalTimer): Promise<void> {
    if (!ENABLE_NOTIFICATIONS || !timer.endAt) return;
    if (!(await this.waitForNotificationsReady())) return;
    if (!timer.isRunning || !timer.endAt) return;

    try {
      await this.cancelCompletionNotification(timer);
      timer.completionNotificationId = await Notifications.scheduleNotificationAsync({
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
    } catch (error) {
      console.log("Error scheduling completion notification:", error);
    }
  }

  private async showImmediateCompletionNotification(timer: InternalTimer): Promise<boolean> {
    if (!ENABLE_NOTIFICATIONS || !this.notificationsReady) return false;

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
    options: { cancelCompletionNotification?: boolean } = {}
  ): Promise<void> {
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
    timer.endAt = null;

    await this.dismissRunningTimerNotification(timer);

    if (options.cancelCompletionNotification ?? true) {
      await this.cancelCompletionNotification(timer);
    }

    this.notify();
  }

  async resetTimer(id: string): Promise<void> {
    const timer = this.timers.get(id);
    if (!timer) return;

    await this.stopTimer(id);
    timer.remainingSeconds = timer.durationSeconds;
    timer.endAt = null;
    this.notify();
  }

  async updateTimerDuration(id: string, durationSeconds: number): Promise<void> {
    const timer = this.timers.get(id);
    if (!timer) return;

    timer.durationSeconds = durationSeconds;
    if (timer.isRunning) {
      timer.remainingSeconds = durationSeconds;
      timer.startedAt = Date.now();
      timer.endAt = timer.startedAt + durationSeconds * 1000;
      await this.syncRunningTimerNotifications(timer);
    } else {
      timer.remainingSeconds = durationSeconds;
      timer.endAt = null;
    }
    this.notify();
  }

  async deleteTimer(id: string): Promise<void> {
    const timer = this.timers.get(id);
    if (!timer) return;

    if (timer.intervalId) {
      clearInterval(timer.intervalId);
    }

    await this.dismissRunningTimerNotification(timer);
    await this.cancelCompletionNotification(timer);

    this.timers.delete(id);
    this.notify();
  }

  private async syncRunningTimers(): Promise<void> {
    const updates: Array<Promise<void>> = [];
    let shouldNotify = false;
    this.timers.forEach((timer) => {
      if (!timer.isRunning) return;
      const remaining = TimerStore.computeRemainingSeconds(timer);
      if (remaining <= 0) {
        updates.push(this.timerComplete(timer.id, { notifyImmediately: false }));
        return;
      }
      if (timer.remainingSeconds !== remaining) {
        timer.remainingSeconds = remaining;
        if (this.shouldRefreshForegroundNotification(timer)) {
          updates.push(this.showRunningTimerNotification(timer));
        }
        shouldNotify = true;
      }
    });
    if (updates.length > 0) {
      await Promise.all(updates);
    }
    if (shouldNotify) {
      this.notify();
    }
  }


  private async refreshRunningTimerNotifications(): Promise<void> {
    if (!ENABLE_NOTIFICATIONS || !this.notificationsReady) return;
    const updates: Array<Promise<void>> = [];
    this.timers.forEach((timer) => {
      if (!timer.isRunning) return;
      if (timer.usesNativeCountdown && Platform.OS === "android") {
        return;
      }
      updates.push(this.showRunningTimerNotification(timer));
    });
    if (updates.length > 0) {
      await Promise.all(updates);
    }
  }

  private async rescheduleRunningTimerCompletions(): Promise<void> {
    if (!ENABLE_NOTIFICATIONS || !this.notificationsReady) return;
    if (Platform.OS === "android") return;
    const updates: Array<Promise<void>> = [];
    this.timers.forEach((timer) => {
      if (!timer.isRunning || !timer.endAt) return;
      updates.push(this.scheduleCompletionNotification(timer));
    });
    if (updates.length > 0) {
      await Promise.all(updates);
    }
  }

  private async dismissRunningTimerNotification(timer: InternalTimer): Promise<void> {
    if (!timer.notificationId || !ENABLE_NOTIFICATIONS) return;

    try {
      if (timer.usesNativeCountdown) {
        await dismissNativeCountdownNotification(timer.id, timer.exerciseId);
        timer.usesNativeCountdown = false;
        return;
      }

      await Notifications.dismissNotificationAsync(timer.notificationId);
    } catch (error) {
      console.log("Error dismissing timer notification:", error);
    }
  }

  private async cancelCompletionNotification(timer: InternalTimer): Promise<void> {
    if (!timer.completionNotificationId || !ENABLE_NOTIFICATIONS) return;

    if (Platform.OS === "android") {
      try {
        await cancelNativeCompletionNotification(timer.id, timer.exerciseId);
      } catch (error) {
        console.log("Error canceling native completion notification:", error);
      }
      return;
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
