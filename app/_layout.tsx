import "../lib/db/connection"; // Initialize database
import "./global.css";

import { Stack } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { UnitPreferenceProvider } from "../lib/contexts/UnitPreferenceContext";
import { seedTestDataExercise } from "../lib/db/seedTestData";
import { useNotificationHandler } from "../lib/notificationHandler";
import { ThemeProvider, useTheme } from "../lib/theme/ThemeContext";

function isActivityUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("current activity is no longer available");
}

function RootLayoutContent() {
  // Set up notification tap handling for deep linking
  useNotificationHandler();
  const { isDark } = useTheme();

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
        <Stack.Screen
          name="programs/[id]"
          options={{ presentation: "card" }}
        />
        <Stack.Screen
          name="programs/builder"
          options={{ presentation: "card" }}
        />
        <Stack.Screen
          name="programs/day/[dayKey]"
          options={{ presentation: "card" }}
        />
        <Stack.Screen
          name="programs/exercise-config"
          options={{ presentation: "card" }}
        />
        <Stack.Screen
          name="programs/templates"
          options={{ presentation: "card" }}
        />
        <Stack.Screen
          name="programs/planned/[plannedWorkoutId]"
          options={{ presentation: "modal" }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <UnitPreferenceProvider>
        <RootLayoutContent />
      </UnitPreferenceProvider>
    </ThemeProvider>
  );
}
