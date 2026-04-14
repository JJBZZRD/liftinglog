import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs, router, useSegments } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PinnedExercisesOverlay from "../../components/PinnedExercisesOverlay";
import { useTheme } from "../../lib/theme/ThemeContext";

const TabsLayout = () => {
  const { rawColors } = useTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const activeTab = segments[segments.length - 1];
  const showAddExerciseFab = activeTab === "exercises";
  const exerciseCardHorizontalInset = 20;
  const floatingTabBarBottom = 24;
  const floatingTabBarHeight = 64;
  const addExerciseFabGapAboveTabBar = 9;
  const addExerciseFabBottom = Math.max(
    insets.bottom + floatingTabBarBottom + floatingTabBarHeight + addExerciseFabGapAboveTabBar,
    112
  );

  return (
    <View className="flex-1 bg-background">
      <Tabs
        screenOptions={{
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
          options={{ title: "Overview", headerShown: false, tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons name="home" color={color} size={size} />
        )}} />
        <Tabs.Screen 
          name="exercises" 
          options={{ title: "Exercises", headerShown: false, tabBarIcon: ({ color, size }) => (
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
      <PinnedExercisesOverlay />
      {showAddExerciseFab ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            right: exerciseCardHorizontalInset,
            bottom: addExerciseFabBottom,
            width: 58,
            height: 58,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: rawColors.primary,
            shadowColor: rawColors.primary,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.22,
            shadowRadius: 20,
            elevation: 8,
            zIndex: 1001,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add exercise"
            onPress={() => router.setParams({ addExerciseRequest: `${Date.now()}` })}
            style={({ pressed }) => ({
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <MaterialCommunityIcons name="plus" size={28} color={rawColors.primaryForeground} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};

export default TabsLayout;
