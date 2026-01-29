import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { TabBar, TabView } from "react-native-tab-view";
import { TabSwipeContext } from "../../lib/contexts/TabSwipeContext";
import { MAX_PINNED_EXERCISES, getPinnedExercisesCount, isExercisePinned, togglePinExercise } from "../../lib/db/exercises";
import { useTheme } from "../../lib/theme/ThemeContext";
import HistoryTab from "./tabs/HistoryTab";
import RecordTab from "./tabs/RecordTab";
import VisualisationTab from "./tabs/VisualisationTab";

export default function ExerciseModalScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; name?: string; refreshHistory?: string }>();
  const exerciseId = typeof params.id === "string" ? parseInt(params.id, 10) : null;
  const title = typeof params.name === "string" ? params.name : "Exercise";
  const layout = useWindowDimensions();
  const navigation = useNavigation();
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: "record", title: "Record" },
    { key: "history", title: "History" },
    { key: "visualisation", title: "Visualisation" },
  ]);
  const [isPinned, setIsPinned] = useState(false);
  const [showPinLimitTooltip, setShowPinLimitTooltip] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  
  // State to control tab swiping (disabled during chart interactions)
  const [swipeEnabled, setSwipeEnabled] = useState(true);

  const triggerHistoryRefresh = useCallback(() => {
    setHistoryRefreshKey((prev) => prev + 1);
  }, []);

  const renderScene = useCallback(
    ({ route }: { route: { key: string } }) => {
      switch (route.key) {
        case "record":
          return <RecordTab onHistoryRefresh={triggerHistoryRefresh} />;
        case "history":
          return <HistoryTab refreshKey={historyRefreshKey} />;
        case "visualisation":
          return <VisualisationTab />;
        default:
          return null;
      }
    },
    [historyRefreshKey, triggerHistoryRefresh]
  );

  // Load pin state on mount
  useEffect(() => {
    if (exerciseId) {
      isExercisePinned(exerciseId).then(setIsPinned);
    }
  }, [exerciseId]);

  // Switch to history tab when returning from edit-workout (indicated by refreshHistory param)
  useEffect(() => {
    if (params.refreshHistory) {
      setIndex(1); // Switch to History tab (index 1)
    }
  }, [params.refreshHistory]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (index === 0) {
        return;
      }
      event.preventDefault();
      setIndex(0);
    });

    return unsubscribe;
  }, [navigation, index]);

  const handlePinExercise = useCallback(async () => {
    if (!exerciseId) return;
    
    // If already pinned, allow unpinning
    if (isPinned) {
      const newPinnedState = await togglePinExercise(exerciseId);
      setIsPinned(newPinnedState);
      return;
    }
    
    // Check if we're at the limit before pinning
    const currentCount = await getPinnedExercisesCount();
    if (currentCount >= MAX_PINNED_EXERCISES) {
      setShowPinLimitTooltip(true);
      return;
    }
    
    const newPinnedState = await togglePinExercise(exerciseId);
    setIsPinned(newPinnedState);
  }, [exerciseId, isPinned]);

  return (
    <View style={{ flex: 1, backgroundColor: rawColors.background }}>
      {/* Pin limit tooltip overlay */}
      <Modal
        visible={showPinLimitTooltip}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPinLimitTooltip(false)}
      >
        <Pressable 
          style={styles.tooltipOverlay} 
          onPress={() => setShowPinLimitTooltip(false)}
        >
          <View style={styles.tooltipContainer}>
            <View style={[styles.tooltipArrow, { borderBottomColor: rawColors.surfaceSecondary }]} />
            <View style={[styles.tooltip, { backgroundColor: rawColors.surfaceSecondary }]}>
              <Text style={[styles.tooltipText, { color: rawColors.foreground }]}>
                Max {MAX_PINNED_EXERCISES} pins! Unpin one first 📌
              </Text>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Stack.Screen
        options={{
          presentation: "modal",
          title,
          headerStyle: { backgroundColor: rawColors.background },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => {
                if (index === 0) {
                  router.back();
                  return;
                }
                setIndex(0);
              }}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPinned ? "Unpin exercise" : "Pin exercise"}
              onPress={handlePinExercise}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <MaterialCommunityIcons 
                name={isPinned ? "pin" : "pin-outline"} 
                size={24} 
                color={isPinned ? rawColors.primary : rawColors.foregroundSecondary} 
              />
            </Pressable>
          ),
        }}
      />

      <TabSwipeContext.Provider value={{ setSwipeEnabled }}>
        <TabView
          navigationState={{ index, routes }}
          renderScene={renderScene}
          onIndexChange={setIndex}
          initialLayout={{ width: layout.width }}
          swipeEnabled={swipeEnabled}
          renderTabBar={(props) => (
            <TabBar
              {...props}
              indicatorStyle={{ backgroundColor: rawColors.primary }}
              style={{ backgroundColor: rawColors.background }}
              activeColor={rawColors.primary}
              inactiveColor={rawColors.foregroundSecondary}
              pressColor={rawColors.pressed}
            />
          )}
        />
      </TabSwipeContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  tooltipOverlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  tooltipContainer: {
    position: "absolute",
    top: 64,
    right: 16,
    alignItems: "flex-end",
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginRight: 20,
  },
  tooltip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    maxWidth: 200,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  tooltipText: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
});
