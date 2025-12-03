import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { SceneMap, TabBar, TabView } from "react-native-tab-view";
import HistoryTab from "./tabs/HistoryTab";
import RecordTab from "./tabs/RecordTab";
import VisualisationTab from "./tabs/VisualisationTab";

const renderScene = SceneMap({
  record: RecordTab,
  history: HistoryTab,
  visualisation: VisualisationTab,
});

export default function ExerciseModalScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string; refreshHistory?: string }>();
  const title = typeof params.name === "string" ? params.name : "Exercise";
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: "record", title: "Record" },
    { key: "history", title: "History" },
    { key: "visualisation", title: "Visualisation" },
  ]);

  // Switch to history tab when returning from edit-workout (indicated by refreshHistory param)
  useEffect(() => {
    if (params.refreshHistory) {
      setIndex(1); // Switch to History tab (index 1)
    }
  }, [params.refreshHistory]);

  const handlePinExercise = useCallback(() => {
    // Placeholder for future feature
    console.log("Pin exercise feature - to be implemented");
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <Stack.Screen
        options={{
          presentation: "modal",
          title,
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pin exercise"
              onPress={handlePinExercise}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <MaterialCommunityIcons name="pin" size={24} color="#007AFF" />
            </Pressable>
          ),
        }}
      />

      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={setIndex}
        initialLayout={{ width: layout.width }}
        renderTabBar={(props) => (
          <TabBar
            {...props}
            indicatorStyle={{ backgroundColor: "#007AFF" }}
            style={{ backgroundColor: "#fff" }}
            activeColor="#007AFF"
            inactiveColor="#666"
            pressColor="#e5e5ea"
          />
        )}
      />
    </View>
  );
}

