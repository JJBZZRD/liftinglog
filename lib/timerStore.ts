// In-memory timer store for managing multiple concurrent rest timers
// Timers persist in memory even when navigating between screens
// Includes persistent notification support

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
};

type TimerListener = (timers: Map<number, Timer>, tick: number) => void;

class TimerStore {
  private timers: Map<string, InternalTimer> = new Map();
  private listeners: Set<TimerListener> = new Set();
  private notificationsInitialized = false;
  private tick = 0; // Increment on each update to force React re-renders

  constructor() {
    this.initNotifications();
  }

  private async initNotifications() {
    if (this.notificationsInitialized) return;

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("Notification permissions not granted");
      }

      // Android-specific channel
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("rest-timer", {
          name: "Rest Timer",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#007AFF",
        });
      }

      this.notificationsInitialized = true;
    } catch (error) {
      console.log("Error initializing notifications:", error);
    }
  }

  subscribe(listener: TimerListener): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.getTimersByExercise(), this.tick);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.tick += 1;
    const timersByExercise = this.getTimersByExercise();
    this.listeners.forEach((listener) => listener(timersByExercise, this.tick));
  }

  // Returns a Map of exerciseId -> Timer (deep cloned for React state)
  private getTimersByExercise(): Map<number, Timer> {
    const result = new Map<number, Timer>();
    this.timers.forEach((timer) => {
      // Deep clone to ensure React detects changes
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
    // Remove existing timer for this exercise if any
    const existingTimer = Array.from(this.timers.values()).find((t) => t.exerciseId === exerciseId);
    if (existingTimer) {
      this.deleteTimer(existingTimer.id);
    }

    const id = `timer-${exerciseId}-${Date.now()}`;
    const timer: InternalTimer = {
      id,
      exerciseId,
      exerciseName,
      durationSeconds,
      remainingSeconds: durationSeconds,
      isRunning: false,
      startedAt: null,
      intervalId: null,
      notificationId: null,
    };
    this.timers.set(id, timer);
    this.notify();
    return id;
  }

  async startTimer(id: string): Promise<void> {
    const timer = this.timers.get(id);
    if (!timer || timer.isRunning) return;

    // Reset to duration if at 0
    if (timer.remainingSeconds <= 0) {
      timer.remainingSeconds = timer.durationSeconds;
    }

    timer.isRunning = true;
    timer.startedAt = Date.now();

    // Schedule/update notification
    await this.updateNotification(timer);
    this.notify();

    timer.intervalId = setInterval(async () => {
      const t = this.timers.get(id);
      if (!t) return;

      if (t.remainingSeconds > 0) {
        t.remainingSeconds -= 1;
        // Update notification every second
        await this.updateNotification(t);
        this.notify();
      } else {
        await this.timerComplete(id);
      }
    }, 1000);
  }

  private async timerComplete(id: string): Promise<void> {
    const timer = this.timers.get(id);
    if (!timer) return;

    await this.stopTimer(id);

    // Send completion notification
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Rest Complete! 💪",
          body: `Time to continue ${timer.exerciseName}`,
          sound: true,
        },
        trigger: null, // Immediate
      });
    } catch (error) {
      console.log("Error sending completion notification:", error);
    }
  }

  private async updateNotification(timer: InternalTimer): Promise<void> {
    try {
      // Cancel previous notification
      if (timer.notificationId) {
        await Notifications.dismissNotificationAsync(timer.notificationId);
      }

      // Create ongoing notification showing countdown
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏱️ ${timer.exerciseName}`,
          body: `Rest: ${TimerStore.formatTime(timer.remainingSeconds)}`,
          sticky: true, // Android: makes it ongoing
          autoDismiss: false,
          data: { timerId: timer.id },
        },
        trigger: null, // Immediate
      });

      timer.notificationId = notificationId;
    } catch (error) {
      console.log("Error updating notification:", error);
    }
  }

  async stopTimer(id: string): Promise<void> {
    const timer = this.timers.get(id);
    if (!timer) return;

    if (timer.intervalId) {
      clearInterval(timer.intervalId);
      timer.intervalId = null;
    }
    timer.isRunning = false;

    // Dismiss notification when stopped
    if (timer.notificationId) {
      try {
        await Notifications.dismissNotificationAsync(timer.notificationId);
        timer.notificationId = null;
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
    this.notify();
  }

  updateTimerDuration(id: string, durationSeconds: number): void {
    const timer = this.timers.get(id);
    if (!timer) return;

    timer.durationSeconds = durationSeconds;
    if (!timer.isRunning) {
      timer.remainingSeconds = durationSeconds;
    }
    this.notify();
  }

  async deleteTimer(id: string): Promise<void> {
    const timer = this.timers.get(id);
    if (!timer) return;

    if (timer.intervalId) {
      clearInterval(timer.intervalId);
    }

    if (timer.notificationId) {
      try {
        await Notifications.dismissNotificationAsync(timer.notificationId);
      } catch (error) {
        console.log("Error dismissing notification:", error);
      }
    }

    this.timers.delete(id);
    this.notify();
  }

  // Format seconds as MM:SS
  static formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
}

// Singleton instance
export const timerStore = new TimerStore();
