import { Stack } from "expo-router";
import { StatusBar } from 'expo-status-bar';

import "./global.css";

export default function RootLayout() {
  return (
    <>
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
    </>
  );
}
