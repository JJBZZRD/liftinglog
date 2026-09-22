// Handles notification taps and navigates to the relevant exercise
import * as Notifications from "expo-notifications";
import { router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import type { TimerNotificationData } from "./restTimerNotificationTypes";

// Hook to set up notification response handling
export function useNotificationHandler() {
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const lastNotificationResponse = useRef<{ key: string; handledAt: number } | null>(null);
  const navigationGeneration = useRef(0);
  const pendingNavigationTimeouts = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const pathname = usePathname();

  const shouldIgnoreResponse = (key: string) => {
    const now = Date.now();
    const last = lastNotificationResponse.current;
    if (last && last.key === key && now - last.handledAt < 1000) {
      return true;
    }
    lastNotificationResponse.current = { key, handledAt: now };
    return false;
  };

  const scheduleNavigation = (generation: number, callback: () => void, delay: number) => {
    const timeoutId = setTimeout(() => {
      pendingNavigationTimeouts.current.delete(timeoutId);
      if (navigationGeneration.current !== generation) return;
      callback();
    }, delay);
    pendingNavigationTimeouts.current.add(timeoutId);
  };

  const handleNotificationNavigation = (data: TimerNotificationData | undefined, generation: number) => {
    if (!data?.exerciseId) return;

    scheduleNavigation(generation, () => {
      const openExercise = () => {
        if (navigationGeneration.current !== generation) return;
        router.push({
          pathname: "/exercise/[id]",
          params: {
            id: String(data.exerciseId),
            name: data.exerciseName || "Exercise",
            tab: "record",
            source: "notification",
          },
        });
      };

      if (pathname !== "/(tabs)/exercises") {
        if (navigationGeneration.current !== generation) return;
        router.replace("/(tabs)/exercises");
        scheduleNavigation(generation, openExercise, 100);
        return;
      }

      openExercise();
    }, 100);
  };

  useEffect(() => {
    const generation = ++navigationGeneration.current;
    const timeouts = pendingNavigationTimeouts.current;
    // Handle notification taps when app is in foreground or background
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      if (navigationGeneration.current !== generation) return;
      const data = response.notification.request.content.data as TimerNotificationData;

      // Prevent rapid duplicate handling across listener + cold-start response
      const responseId = response.notification.request.identifier;
      const responseKey = `${responseId}|${data?.timerId ?? "no-timer"}`;
      if (shouldIgnoreResponse(responseKey)) return;

      console.log("ðŸ“± Notification tapped:", data);
      handleNotificationNavigation(data, generation);
    });

    // Check if app was opened from a notification (cold start)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (navigationGeneration.current !== generation) return;
      if (!response) return;

      const data = response.notification.request.content.data as TimerNotificationData;

      // Prevent duplicate handling
      const responseId = response.notification.request.identifier;
      const responseKey = `${responseId}|${data?.timerId ?? "no-timer"}`;
      if (shouldIgnoreResponse(responseKey)) return;

      console.log("ðŸ“± App opened from notification:", data);

      scheduleNavigation(generation, () => {
        handleNotificationNavigation(data, generation);
      }, 400); // Longer delay for cold start
    }).catch((error) => {
      if (navigationGeneration.current === generation) {
        console.log("Unable to read notification response:", error);
      }
    });

    return () => {
      navigationGeneration.current += 1;
      if (responseListener.current) {
        responseListener.current.remove();
        responseListener.current = null;
      }
      timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      timeouts.clear();
    };
    // pathname is intentionally captured at ready-subtree mount; a response
    // cannot navigate once this effect's generation is invalidated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
