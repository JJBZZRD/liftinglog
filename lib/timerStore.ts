// In-memory timer store for managing multiple concurrent rest timers
// Timers persist in memory even when navigating between screens
// Includes persistent notification support

import * as Notifications from "expo-notifications";
import { AppState, type AppStateStatus, Platform } from "react-native";

// ============================================================
// TOGGLE THIS FLAG FOR EXPO GO vs DEV BUILD TESTING
// Set to false when testing in Expo Go to avoid errors
// Set to true when testing notifications in a development build
// ============================================================
const ENABLE_NOTIFICATIONS = true;

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
};

type TimerListener = (timers: Map<number, Timer>, tick: number) => void;

class TimerStore {
  private timers: Map<string, InternalTimer> = new Map();
  private listeners: Set<TimerListener> = new Set();
  private notificationsReady = false;
  private tick = 0;
  private appStateSubscription: { remove: () => void } | null = null;
  private appState: AppStateStatus = AppState.currentState ?? "active";

  constructor() {
    if (ENABLE_NOTIFICATIONS) {
      this.initNotifications();
    }
    this.appStateSubscription = AppState.addEventListener("change", (state) => {
      this.appState = state;
      void this.refreshRunningTimerNotifications();
      if (state === "active") {
        void this.syncRunningTimers();
      }
    });
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
        await Notifications.setNotificationChannelAsync("rest-timer", {
          name: "Rest Timer",
          importance: Notifications.AndroidImportance.LOW, // LOW = no sound, no popup, just shows in tray
          vibrationPattern: [0],
          lightColor: "#007AFF",
          sound: undefined,
          enableVibrate: false,
        });
      }

      this.notificationsReady = true;
      console.log("✅ Notifications initialized successfully");
    } catch (error) {
      console.log("❌ Error initializing notifications:", error);
    }
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

  createTimer(exerciseId: number, exerciseName: string, durationSeconds: number): string {
    const existingTimer = Array.from(this.timers.values()).find((t) => t.exerciseId === exerciseId);
    if (existingTimer) {
      this.deleteTimer(existingTimer.id);
    }

    const id = `timer-${exerciseId}-${Date.now()}`;
    // Use a stable notification ID based on exercise ID (so updates replace instead of create new)
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

    // Show initial notification
    await this.showTimerNotification(timer);
    this.notify();

    timer.intervalId = setInterval(async () => {
      const t = this.timers.get(id);
      if (!t) return;

      const remaining = TimerStore.computeRemainingSeconds(t);
      if (remaining > 0) {
        if (t.remainingSeconds !== remaining) {
          t.remainingSeconds = remaining;
          await this.showTimerNotification(t);
          this.notify();
        }
      } else {
        await this.timerComplete(id);
      }
    }, 1000);
  }

  private async timerComplete(id: string): Promise<void> {
    const timer = this.timers.get(id);
    if (!timer) return;

    const exerciseName = timer.exerciseName;
    await this.stopTimer(id);

    // Send completion notification
    if (ENABLE_NOTIFICATIONS && this.notificationsReady) {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Rest Complete! 💪",
            body: `Time to continue ${exerciseName}`,
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
            data: { 
              exerciseId: timer.exerciseId, 
              exerciseName: exerciseName,
            },
          },
          trigger: null,
        });
        console.log("✅ Sent completion notification");
      } catch (error) {
        console.log("❌ Error sending completion notification:", error);
      }
    }
  }

  private async showTimerNotification(timer: InternalTimer): Promise<void> {
    if (!ENABLE_NOTIFICATIONS || !this.notificationsReady) return;

    try {
      const body = this.getNotificationBody(timer);
      // Use scheduleNotificationAsync with a fixed identifier to update in place
      // By using the same identifier, the notification is replaced instead of creating a new one
      await Notifications.scheduleNotificationAsync({
        identifier: timer.notificationId!, // Fixed ID per exercise - replaces existing
        content: {
          title: `⏱️ ${timer.exerciseName}`,
          body,
          sticky: true,
          autoDismiss: false,
          priority: Notifications.AndroidNotificationPriority.LOW, // Low = silent update
          data: { 
            timerId: timer.id, 
            exerciseId: timer.exerciseId,
            exerciseName: timer.exerciseName,
          },
        },
        trigger: null,
      });
    } catch (error) {
      console.log("❌ Error showing timer notification:", error);
    }
  }

  async stopTimer(id: string): Promise<void> {
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

    // Dismiss notification
    if (timer.notificationId && ENABLE_NOTIFICATIONS) {
      try {
        await Notifications.dismissNotificationAsync(timer.notificationId);
      } catch (error) {
        console.log("Error dismissing notification:", error);
      }
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

  updateTimerDuration(id: string, durationSeconds: number): void {
    const timer = this.timers.get(id);
    if (!timer) return;

    timer.durationSeconds = durationSeconds;
    if (timer.isRunning) {
      timer.remainingSeconds = durationSeconds;
      timer.startedAt = Date.now();
      timer.endAt = timer.startedAt + durationSeconds * 1000;
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

    if (timer.notificationId && ENABLE_NOTIFICATIONS) {
      try {
        await Notifications.dismissNotificationAsync(timer.notificationId);
      } catch (error) {
        console.log("Error dismissing notification:", error);
      }
    }

    this.timers.delete(id);
    this.notify();
  }

  private async syncRunningTimers(): Promise<void> {
    const updates: Array<Promise<void>> = [];
    this.timers.forEach((timer) => {
      if (!timer.isRunning) return;
      const remaining = TimerStore.computeRemainingSeconds(timer);
      if (remaining <= 0) {
        updates.push(this.timerComplete(timer.id));
        return;
      }
      if (timer.remainingSeconds !== remaining) {
        timer.remainingSeconds = remaining;
        updates.push(this.showTimerNotification(timer));
      }
    });
    if (updates.length > 0) {
      await Promise.all(updates);
      this.notify();
    }
  }


  private async refreshRunningTimerNotifications(): Promise<void> {
    if (!ENABLE_NOTIFICATIONS || !this.notificationsReady) return;
    const updates: Array<Promise<void>> = [];
    this.timers.forEach((timer) => {
      if (!timer.isRunning) return;
      updates.push(this.showTimerNotification(timer));
    });
    if (updates.length > 0) {
      await Promise.all(updates);
    }
  }

  private getNotificationBody(timer: InternalTimer): string {
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

  private static computeRemainingSeconds(timer: InternalTimer): number {
    if (!timer.endAt) return timer.remainingSeconds;
    const remainingMs = timer.endAt - Date.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  static formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
}

export const timerStore = new TimerStore();
