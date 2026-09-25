import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs, useSegments } from "expo-router";
import { View } from "react-native";
import PinnedExercisesOverlay from "../../components/PinnedExercisesOverlay";
import { useTheme } from "../../lib/theme/ThemeContext";
import { useWorkoutTheme } from "../../components/workouts/workout-theme";

const TabsLayout = () => {
  const theme = useTheme();
  const workoutTheme = useWorkoutTheme();
  const segments = useSegments();
  const activeTab = segments[segments.length - 1];
  const isWorkoutsTab = activeTab === "(tabs)";
  const rawColors = (isWorkoutsTab || activeTab === "exercises") ? workoutTheme.rawColors : theme.rawColors;

  return (
    <View className="flex-1 bg-background">
      <Tabs
        screenOptions={{
          animation: "shift",
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 24,
            borderRadius: 16,
            height: 64,
            paddingBottom: 8,
            paddingTop: 8,
            backgroundColor: rawColors.surface,
            borderTopWidth: 0,
            elevation: 8,
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 10,
          },
          tabBarActiveTintColor: rawColors.primary,
          tabBarInactiveTintColor: rawColors.foregroundSecondary,
        }}
      >
        <Tabs.Screen 
          name="index" 
          options={{ title: "Workouts", headerShown: false, tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons name="view-day-outline" color={color} size={size} />
        )}} />
        <Tabs.Screen 
          name="exercises" 
          options={{ animation: "none", title: "Exercises", headerShown: false, tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons name="dumbbell" color={color} size={size} />
        )}} />
        <Tabs.Screen 
          name="programs" 
          options={{ title: "Programs", headerShown: false, tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons name="book" color={color} size={size} />
        )}} />
        <Tabs.Screen 
          name="settings" 
          options={{ title: "Settings", headerShown: false, tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons name="cog" color={color} size={size} />
        )}} />
      </Tabs>
      {!isWorkoutsTab && <PinnedExercisesOverlay />}

    </View>
  );
};

export default TabsLayout;
