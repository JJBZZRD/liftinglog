import { Stack } from "expo-router";
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from "react-native-gesture-handler";

import "./global.css";
import { useNotificationHandler } from "../lib/notificationHandler";

export default function RootLayout() {
  // Set up notification tap handling for deep linking
  useNotificationHandler();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
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
      </Stack>
    </GestureHandlerRootView>
  );
}
