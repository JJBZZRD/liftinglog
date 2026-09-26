import {
  getDatabaseStartupSnapshot,
  performDatabaseStartupAction,
  subscribeDatabaseStartup,
} from "../lib/db/replacementRestoreLifecycle";

import "./global.css";

import { Stack } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { useEffect, useSyncExternalStore } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import ReplacementRestoreGate from "../components/ReplacementRestoreGate";
import { UnitPreferenceProvider } from "../lib/contexts/UnitPreferenceContext";
import { appCapabilities, releaseProfile } from "../lib/config/releaseProfile";
import { seedTestDataExercise } from "../lib/db/seedTestData";
import { useNotificationHandler } from "../lib/notificationHandler";
import { isCapabilityEnabled } from "../lib/routing/capabilityAccess";
import { ThemeProvider, useTheme } from "../lib/theme/ThemeContext";
import { timerStore } from "../lib/timerStore";

function isActivityUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("current activity is no longer available");
}

function RootLayoutContent() {
  // Set up notification tap handling for deep linking
  useNotificationHandler();
  const { isDark } = useTheme();

  // This subtree only mounts once startup has permitted the app to run.
  useEffect(() => {
    timerStore.activateWhenAppReady();
  }, []);

  // Lock app to portrait orientation on mount
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
      .catch((error) => {
        if (isActivityUnavailableError(error)) {
          return;
        }
        console.warn("Failed to lock portrait orientation:", error);
      });
  }, []);

  // Seed test data in development mode
  useEffect(() => {
    if (releaseProfile !== "full") {
      return;
    }

    seedTestDataExercise().catch(console.error);
  }, []);

  return (
    <GestureHandlerRootView className="flex-1">
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack>
        <Stack.Screen 
          name="(tabs)" 
          options={{ headerShown: false, animation: "fade_from_bottom" }} />
        <Stack.Screen
          name="exercise/[id]"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="add-exercise"
          options={{ presentation: "transparentModal", headerShown: false, animation: "fade_from_bottom"}}
        />
        <Stack.Screen
          name="edit-workout"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="workout-history"
          options={{ presentation: "card" }}
        />
        <Stack.Screen name="workout-session/[id]" options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Protected guard={__DEV__}>
          <Stack.Screen name="dev/design-catalog" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={isCapabilityEnabled("healthMetrics", appCapabilities)}>
          <Stack.Screen
            name="user-metrics"
            options={{ presentation: "card" }}
          />
          <Stack.Screen
            name="user-metric/[metric]"
            options={{ presentation: "card" }}
          />
          <Stack.Screen
            name="performance-guide"
            options={{ presentation: "card" }}
          />
        </Stack.Protected>
        <Stack.Screen
          name="calculators"
          options={{ presentation: "card", headerShown: false }}
        />
        <Stack.Protected guard={isCapabilityEnabled("programsExperience", appCapabilities)}>
          <Stack.Screen
            name="programs/manage"
            options={{ presentation: "card" }}
          />
          <Stack.Screen
            name="programs/create/basics"
            options={{ presentation: "card" }}
          />
          <Stack.Screen
            name="programs/create/editor"
            options={{ presentation: "card" }}
          />
          <Stack.Screen
            name="programs/create/schedule"
            options={{ presentation: "card" }}
          />
          <Stack.Screen
            name="programs/create/exercise-picker"
            options={{ presentation: "card" }}
          />
          <Stack.Screen
            name="programs/templates"
            options={{ presentation: "card" }}
          />
          <Stack.Screen
            name="programs/template-import"
            options={{ presentation: "card" }}
          />
          <Stack.Screen
            name="programs/template-exercise-picker"
            options={{ presentation: "card" }}
          />
          <Stack.Screen
            name="programs/exercise-log/[id]"
            options={{ presentation: "card" }}
          />
        </Stack.Protected>
        <Stack.Protected guard={isCapabilityEnabled("videoRecording", appCapabilities)}>
          <Stack.Screen
            name="exercise/record-video"
            options={{ presentation: "card" }}
          />
        </Stack.Protected>
      </Stack>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const startup = useSyncExternalStore(
    subscribeDatabaseStartup,
    getDatabaseStartupSnapshot,
    getDatabaseStartupSnapshot
  );

  return (
    <ReplacementRestoreGate
      snapshot={startup}
      performAction={performDatabaseStartupAction}
    >
      <ThemeProvider>
        <UnitPreferenceProvider>
          <RootLayoutContent />
        </UnitPreferenceProvider>
      </ThemeProvider>
    </ReplacementRestoreGate>
  );
}
