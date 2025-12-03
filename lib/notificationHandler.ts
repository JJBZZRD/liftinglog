// Handles notification taps and navigates to the relevant exercise
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
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
  const lastNotificationResponse = useRef<string | null>(null);

  useEffect(() => {
    // Handle notification taps when app is in foreground or background
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as TimerNotificationData;
      
      // Prevent duplicate handling
      const responseId = response.notification.request.identifier;
      if (lastNotificationResponse.current === responseId) {
        return;
      }
      lastNotificationResponse.current = responseId;
      
      console.log("📱 Notification tapped:", data);
      
      if (data?.exerciseId) {
        // Navigate to the exercise screen
        // Use setTimeout to ensure navigation happens after any pending operations
        setTimeout(() => {
          router.push({
            pathname: "/exercise/[id]",
            params: { 
              id: String(data.exerciseId),
              name: data.exerciseName || "Exercise",
            },
          });
        }, 100);
      }
    });

    // Check if app was opened from a notification (cold start)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        const data = response.notification.request.content.data as TimerNotificationData;
        
        // Prevent duplicate handling
        const responseId = response.notification.request.identifier;
        if (lastNotificationResponse.current === responseId) {
          return;
        }
        lastNotificationResponse.current = responseId;
        
        console.log("📱 App opened from notification:", data);
        
        if (data?.exerciseId) {
          setTimeout(() => {
            router.push({
              pathname: "/exercise/[id]",
              params: { 
                id: String(data.exerciseId),
                name: data.exerciseName || "Exercise",
              },
            });
          }, 500); // Longer delay for cold start
        }
      }
    });

    return () => {
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);
}

