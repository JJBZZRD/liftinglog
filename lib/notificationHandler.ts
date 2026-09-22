// Handles Expo NotificationResponse taps. Native ACTION_VIEW links are handled
// independently by app/+native-intent.ts.
import * as Notifications from "expo-notifications";
import { router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";

import type { TimerNotificationData } from "./restTimerNotificationTypes";
import {
  canDeliverRestTimerNotificationResponse,
  getRestTimerNavigationEpoch,
} from "./restTimerNavigationGuard";

type DurableTimerNotificationData = TimerNotificationData & {
  navigationGeneration?: unknown;
};

export function useNotificationHandler() {
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const lastNotificationResponse = useRef<{ key: string; handledAt: number } | null>(null);
  const hookGeneration = useRef(0);
  const pendingNavigationTimeouts = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const pathname = usePathname();

  const shouldIgnoreResponse = (key: string) => {
    const now = Date.now();
    const last = lastNotificationResponse.current;
    if (last && last.key === key && now - last.handledAt < 1000) return true;
    lastNotificationResponse.current = { key, handledAt: now };
    return false;
  };

  useEffect(() => {
    const mountedGeneration = ++hookGeneration.current;
    const timeouts = pendingNavigationTimeouts.current;

    const isDeliverable = (
      data: DurableTimerNotificationData,
      navigationEpoch: number
    ) =>
      hookGeneration.current === mountedGeneration &&
      canDeliverRestTimerNotificationResponse(data, navigationEpoch);

    const scheduleNavigation = (
      data: DurableTimerNotificationData,
      navigationEpoch: number,
      callback: () => void,
      delay: number
    ) => {
      const timeoutId = setTimeout(() => {
        pendingNavigationTimeouts.current.delete(timeoutId);
        if (!isDeliverable(data, navigationEpoch)) return;
        callback();
      }, delay);
      pendingNavigationTimeouts.current.add(timeoutId);
    };

    const handleNotificationNavigation = (data: DurableTimerNotificationData | undefined) => {
      if (!data?.exerciseId) return;
      const navigationEpoch = getRestTimerNavigationEpoch();
      if (!isDeliverable(data, navigationEpoch)) return;

      scheduleNavigation(data, navigationEpoch, () => {
        const openExercise = () => {
          if (!isDeliverable(data, navigationEpoch)) return;
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
          if (!isDeliverable(data, navigationEpoch)) return;
          router.replace("/(tabs)/exercises");
          scheduleNavigation(data, navigationEpoch, openExercise, 100);
          return;
        }
        openExercise();
      }, 100);
    };

    const handleResponse = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as DurableTimerNotificationData;
      const responseId = response.notification.request.identifier;
      const responseKey = `${responseId}|${data?.timerId ?? "no-timer"}`;
      if (shouldIgnoreResponse(responseKey)) return;
      handleNotificationNavigation(data);
    };

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      handleResponse
    );

    const retainedResponseEpoch = getRestTimerNavigationEpoch();
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (hookGeneration.current !== mountedGeneration || !response) return;
        const data = response.notification.request.content.data as DurableTimerNotificationData;
        if (!isDeliverable(data, retainedResponseEpoch)) return;

        const responseId = response.notification.request.identifier;
        const responseKey = `${responseId}|${data?.timerId ?? "no-timer"}`;
        if (shouldIgnoreResponse(responseKey)) return;
        scheduleNavigation(
          data,
          retainedResponseEpoch,
          () => handleNotificationNavigation(data),
          400
        );
      })
      .catch((error) => {
        if (hookGeneration.current === mountedGeneration) {
          console.log("Unable to read notification response:", error);
        }
      });

    return () => {
      hookGeneration.current += 1;
      responseListener.current?.remove();
      responseListener.current = null;
      timeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      timeouts.clear();
    };
    // pathname is intentionally captured at ready-subtree mount. Delivery is
    // guarded again at each delayed continuation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
