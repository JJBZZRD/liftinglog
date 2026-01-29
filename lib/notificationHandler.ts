// Handles notification taps and navigates to the relevant exercise
import * as Notifications from "expo-notifications";
import { router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";

// Type for notification data
interface TimerNotificationData {
  timerId?: string;
  exerciseId?: number;
  exerciseName?: string;
}

// Hook to set up notification response handling
export function useNotificationHandler() {
  const responseListener = useRef<Notifications.Subscription>();
  const lastNotificationResponse = useRef<{ key: string; handledAt: number } | null>(null);
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

  const handleNotificationNavigation = (data?: TimerNotificationData) => {
    if (!data?.exerciseId) return;

    setTimeout(() => {
      const openExercise = () => {
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
        router.replace("/(tabs)/exercises");
        setTimeout(openExercise, 100);
        return;
      }

      openExercise();
    }, 100);
  };

  useEffect(() => {
    // Handle notification taps when app is in foreground or background
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as TimerNotificationData;

      // Prevent rapid duplicate handling across listener + cold-start response
      const responseId = response.notification.request.identifier;
      const responseKey = `${responseId}|${data?.timerId ?? "no-timer"}`;
      if (shouldIgnoreResponse(responseKey)) return;

      console.log("ðŸ“± Notification tapped:", data);
      handleNotificationNavigation(data);
    });

    // Check if app was opened from a notification (cold start)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;

      const data = response.notification.request.content.data as TimerNotificationData;

      // Prevent duplicate handling
      const responseId = response.notification.request.identifier;
      const responseKey = `${responseId}|${data?.timerId ?? "no-timer"}`;
      if (shouldIgnoreResponse(responseKey)) return;

      console.log("ðŸ“± App opened from notification:", data);

      setTimeout(() => {
        handleNotificationNavigation(data);
      }, 400); // Longer delay for cold start
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);
}
