import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { TabBar, TabView } from "react-native-tab-view";
import VariationExerciseLabel from "../../components/exercise/VariationExerciseLabel";
import { TabSwipeContext } from "../../lib/contexts/TabSwipeContext";
import {
  MAX_PINNED_EXERCISES,
  getExerciseWithParentById,
  getPinnedExercisesCount,
  isExercisePinned,
  togglePinExercise,
  type ExerciseWithParent,
} from "../../lib/db/exercises";
import { parseExerciseRouteId } from "../../lib/routing/exerciseRouteId";
import { useTheme } from "../../lib/theme/ThemeContext";
import AnalyticsTab from "./tabs/AnalyticsTab";
import HistoryTab from "./tabs/HistoryTab";
import RecordTab from "./tabs/RecordTab";

export default function ExerciseModalScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; name?: string; refreshHistory?: string; tab?: string; source?: string }>();
  const exerciseId = parseExerciseRouteId(params.id);
  const title = typeof params.name === "string" ? params.name : "Exercise";
  const layout = useWindowDimensions();
  const navigation = useNavigation();
  const [index, setIndex] = useState(0);
  const [headerExercise, setHeaderExercise] = useState<ExerciseWithParent | null>(null);
  const [validatedExerciseId, setValidatedExerciseId] = useState<number | null>(null);
  const [exerciseStatus, setExerciseStatus] = useState<"loading" | "available" | "unavailable" | "error">(
    exerciseId ? "loading" : "unavailable"
  );
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [routes] = useState([
    { key: "record", title: "Record" },
    { key: "history", title: "History" },
    { key: "analytics", title: "Analytics" },
  ]);
  const [isPinned, setIsPinned] = useState(false);
  const [showPinLimitTooltip, setShowPinLimitTooltip] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  
  // State to control tab swiping (disabled during chart interactions)
  const [swipeEnabled, setSwipeEnabled] = useState(true);

  const triggerHistoryRefresh = useCallback(() => {
    setHistoryRefreshKey((prev) => prev + 1);
  }, []);

  const goBackToExercises = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/exercises");
  }, []);

  const renderScene = useCallback(
    ({ route }: { route: { key: string } }) => {
      switch (route.key) {
        case "record":
          return <RecordTab onHistoryRefresh={triggerHistoryRefresh} />;
        case "history":
          return <HistoryTab refreshKey={historyRefreshKey} />;
        case "analytics":
          return <AnalyticsTab refreshKey={historyRefreshKey} />;
        default:
          return null;
      }
    },
    [historyRefreshKey, triggerHistoryRefresh]
  );

  useEffect(() => {
    let cancelled = false;

    if (!exerciseId) {
      setValidatedExerciseId(null);
      setExerciseStatus("unavailable");
      setHeaderExercise(null);
      setIsPinned(false);
      return () => {
        cancelled = true;
      };
    }

    setValidatedExerciseId(null);
    setExerciseStatus("loading");
    setHeaderExercise(null);
    setIsPinned(false);

    getExerciseWithParentById(exerciseId)
      .then((exercise) => {
        if (!cancelled && exercise) {
          setHeaderExercise(exercise);
          setValidatedExerciseId(exerciseId);
          setExerciseStatus("available");
          void isExercisePinned(exerciseId)
            .then((pinned) => {
              if (!cancelled) {
                setIsPinned(pinned);
              }
            })
            .catch(() => {
              if (!cancelled) {
                setIsPinned(false);
              }
            });
          return;
        }
        if (!cancelled) {
          setValidatedExerciseId(null);
          setExerciseStatus("unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setValidatedExerciseId(null);
          setExerciseStatus("error");
          setHeaderExercise(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [exerciseId, validationAttempt]);

  const isExerciseAvailable =
    exerciseStatus === "available" && validatedExerciseId === exerciseId;

  // Switch to history tab when returning from edit-workout (indicated by refreshHistory param)
  useEffect(() => {
    if (params.refreshHistory) {
      setIndex(1); // Switch to History tab (index 1)
    }
  }, [params.refreshHistory]);

  // Ensure Record tab is selected when routed from notifications or deep links
  useEffect(() => {
    if (params.tab === "record") {
      setIndex(0);
    }
  }, [params.tab]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (index === 0) {
        return;
      }
      (event as unknown as { preventDefault: () => void }).preventDefault();
      setIndex(0);
    });

    return unsubscribe;
  }, [navigation, index]);

  const handlePinExercise = useCallback(async () => {
    if (!exerciseId || !isExerciseAvailable) return;
    
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
  }, [exerciseId, isExerciseAvailable, isPinned]);

  const exerciseStatusMessage =
    exerciseStatus === "loading"
      ? "Loading exercise…"
      : exerciseStatus === "error"
        ? "We couldn’t load this exercise."
        : exerciseId
          ? "This exercise is no longer available."
          : "This exercise link is invalid.";

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
          headerStyle: { backgroundColor: rawColors.background },
          headerTitleStyle: { color: rawColors.foreground },
          headerTitle: () =>
            headerExercise ? (
              <VariationExerciseLabel
                exercise={headerExercise}
                numberOfLines={1}
                style={styles.headerTitle}
                suffixStyle={styles.headerTitleSuffix}
              />
            ) : (
              <Text style={[styles.headerTitle, { color: rawColors.foreground }]} numberOfLines={1}>
                {title}
              </Text>
            ),
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => {
                if (index === 0) {
                  goBackToExercises();
                  return;
                }
                setIndex(0);
              }}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
          headerRight: () => isExerciseAvailable ? (
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
          ) : null,
        }}
      />

      {isExerciseAvailable ? (
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
      ) : (
        <View className="flex-1 items-center justify-center gap-4 p-6 bg-background">
          <Text className="text-base text-foreground-secondary text-center">
            {exerciseStatusMessage}
          </Text>
          <View className="flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={goBackToExercises}
              className="items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
            >
              <Text className="text-base font-semibold text-foreground-secondary">Go back</Text>
            </Pressable>
            {exerciseStatus === "error" && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading exercise"
                onPress={() => setValidationAttempt((attempt) => attempt + 1)}
                className="items-center justify-center p-3.5 rounded-lg bg-primary"
              >
                <Text className="text-base font-semibold text-primary-foreground">Retry</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
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
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  headerTitleSuffix: {
    fontWeight: "500",
  },
});
