import { Tabs } from "expo-router";
import { View } from "react-native";
import { DockedTabBar } from "../../features/navigation/components/docked-tab-bar";

// Icons, the live-workout strip and the "Soon" badge live in DockedTabBar.
const TabsLayout = () => (
  <View className="flex-1 bg-background">
    <Tabs tabBar={(props) => <DockedTabBar {...props} />} screenOptions={{ animation: "shift", headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Workouts" }} />
      <Tabs.Screen name="exercises" options={{ animation: "none", title: "Exercises" }} />
      <Tabs.Screen name="programs" options={{ title: "Programs" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  </View>
);

export default TabsLayout;
