import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { TabBar, TabView } from "react-native-tab-view";
import { getPinnedExercises, togglePinExercise, type Exercise } from "../lib/db/exercises";
import { getActiveWorkout, listInProgressExercises, type InProgressExercise } from "../lib/db/workouts";
import { useTheme } from "../lib/theme/ThemeContext";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

type OverlayTabKey = "pinned" | "inProgress";

export default function PinnedExercisesOverlay() {
  const { rawColors, isDark } = useTheme();
  const layout = useWindowDimensions();
  const [isOpen, setIsOpen] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  const [tabRoutes] = useState<Array<{ key: OverlayTabKey; title: string }>>([
    { key: "pinned", title: "Pinned" },
    { key: "inProgress", title: "In Progress" },
  ]);
  const [pinnedExercises, setPinnedExercises] = useState<Exercise[]>([]);
  const [inProgressExercises, setInProgressExercises] = useState<InProgressExercise[]>([]);
  const slideAnim = useRef(new Animated.Value(-SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const buttonRotation = useRef(new Animated.Value(0)).current;

  const loadPinnedExercises = useCallback(async () => {
    const exercises = await getPinnedExercises();
    setPinnedExercises(exercises);
  }, []);

  const loadInProgressExercises = useCallback(async () => {
    const activeWorkout = await getActiveWorkout();
    if (!activeWorkout) {
      setInProgressExercises([]);
      return;
    }

    const rows = await listInProgressExercises(activeWorkout.id);
    setInProgressExercises(rows);
  }, []);

  // Load pinned exercises when opening
  useEffect(() => {
    if (isOpen) {
      void Promise.all([loadPinnedExercises(), loadInProgressExercises()]);
    }
  }, [isOpen, loadPinnedExercises, loadInProgressExercises]);

  const openDropdown = useCallback(() => {
    setIsOpen(true);
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(buttonRotation, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }),
    ]).start();
  }, [slideAnim, fadeAnim, buttonRotation]);

  const closeDropdown = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: -SCREEN_HEIGHT,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.spring(buttonRotation, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }),
    ]).start(() => {
      setIsOpen(false);
    });
  }, [slideAnim, fadeAnim, buttonRotation]);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }, [isOpen, openDropdown, closeDropdown]);

  const handleExercisePress = useCallback((exercise: Exercise) => {
    closeDropdown();
    router.push({
      pathname: "/exercise/[id]",
      params: { id: String(exercise.id), name: exercise.name },
    });
  }, [closeDropdown]);

  const handleInProgressExercisePress = useCallback((entry: InProgressExercise) => {
    closeDropdown();
    router.push({
      pathname: "/exercise/[id]",
      params: { id: String(entry.exerciseId), name: entry.exerciseName, tab: "record", source: "in-progress-overlay" },
    });
  }, [closeDropdown]);

  const handleUnpinExercise = useCallback(async (exerciseId: number) => {
    await togglePinExercise(exerciseId);
    // Update the list immediately
    setPinnedExercises((prev) => prev.filter((e) => e.id !== exerciseId));
  }, []);

  const renderRightActions = useCallback(
    (
      progress: Animated.AnimatedInterpolation<number>,
      _dragX: Animated.AnimatedInterpolation<number>,
      exerciseId: number
    ) => {
      const translateX = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [140, 0],
      });

      return (
        <Animated.View
          style={[styles.swipeAction, { transform: [{ translateX }] }]}
        >
          <Pressable
            style={[styles.removeButton, { backgroundColor: rawColors.destructive }]}
            onPress={() => handleUnpinExercise(exerciseId)}
          >
            <MaterialCommunityIcons name="pin-off" size={22} color={rawColors.surface} />
            <Text style={[styles.removeButtonText, { color: rawColors.surface }]}>Unpin</Text>
          </Pressable>
        </Animated.View>
      );
    },
    [handleUnpinExercise, rawColors]
  );

  const renderPinnedContent = useCallback(() => {
    if (pinnedExercises.length === 0) {
      return (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons
            name="pin-off-outline"
            size={48}
            color={rawColors.foregroundMuted}
          />
          <Text style={[styles.emptyText, { color: rawColors.foregroundSecondary }]}>No pinned exercises</Text>
          <Text style={[styles.emptySubtext, { color: rawColors.foregroundMuted }]}>
            Pin exercises from their detail page for quick access
          </Text>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.exerciseList} showsVerticalScrollIndicator={false}>
        {pinnedExercises.map((exercise) => (
          <Swipeable
            key={exercise.id}
            renderRightActions={(progress, dragX) =>
              renderRightActions(progress, dragX, exercise.id)
            }
            overshootRight={false}
            rightThreshold={140}
            friction={2}
            onSwipeableOpen={() => handleUnpinExercise(exercise.id)}
          >
            <Pressable
              style={[styles.exerciseItem, { backgroundColor: rawColors.surface }]}
              onPress={() => handleExercisePress(exercise)}
            >
              <View style={[styles.exerciseIcon, { backgroundColor: rawColors.primaryLight }]}>
                <MaterialCommunityIcons
                  name="dumbbell"
                  size={20}
                  color={rawColors.primary}
                />
              </View>
              <View style={styles.exerciseInfo}>
                <Text style={[styles.exerciseName, { color: rawColors.foreground }]}>{exercise.name}</Text>
                {exercise.muscleGroup && (
                  <Text style={[styles.exerciseMuscle, { color: rawColors.foregroundSecondary }]}>
                    {exercise.muscleGroup}
                  </Text>
                )}
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={rawColors.foregroundMuted}
              />
            </Pressable>
          </Swipeable>
        ))}
      </ScrollView>
    );
  }, [
    pinnedExercises,
    rawColors.foreground,
    rawColors.foregroundMuted,
    rawColors.foregroundSecondary,
    rawColors.primary,
    rawColors.primaryLight,
    rawColors.surface,
    handleExercisePress,
    handleUnpinExercise,
    renderRightActions,
  ]);

  const renderInProgressContent = useCallback(() => {
    if (inProgressExercises.length === 0) {
      return (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons
            name="progress-clock"
            size={48}
            color={rawColors.foregroundMuted}
          />
          <Text style={[styles.emptyText, { color: rawColors.foregroundSecondary }]}>No exercises in progress</Text>
          <Text style={[styles.emptySubtext, { color: rawColors.foregroundMuted }]}>
            Start recording sets to see your active exercises here
          </Text>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.exerciseList} showsVerticalScrollIndicator={false}>
        {inProgressExercises.map((entry) => (
          <Pressable
            key={entry.workoutExerciseId}
            style={[styles.exerciseItem, { backgroundColor: rawColors.surface }]}
            onPress={() => handleInProgressExercisePress(entry)}
          >
            <View style={[styles.exerciseIcon, { backgroundColor: rawColors.primaryLight }]}>
              <MaterialCommunityIcons
                name="progress-clock"
                size={20}
                color={rawColors.primary}
              />
            </View>
            <View style={styles.exerciseInfo}>
              <Text style={[styles.exerciseName, { color: rawColors.foreground }]}>{entry.exerciseName}</Text>
              {entry.muscleGroup && (
                <Text style={[styles.exerciseMuscle, { color: rawColors.foregroundSecondary }]}>
                  {entry.muscleGroup}
                </Text>
              )}
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={rawColors.foregroundMuted}
            />
          </Pressable>
        ))}
      </ScrollView>
    );
  }, [
    inProgressExercises,
    rawColors.foreground,
    rawColors.foregroundMuted,
    rawColors.foregroundSecondary,
    rawColors.primary,
    rawColors.primaryLight,
    rawColors.surface,
    handleInProgressExercisePress,
  ]);

  const renderScene = useCallback(
    ({ route }: { route: { key: OverlayTabKey } }) => {
      switch (route.key) {
        case "pinned":
          return renderPinnedContent();
        case "inProgress":
          return renderInProgressContent();
        default:
          return null;
      }
    },
    [renderPinnedContent, renderInProgressContent]
  );

  const handleTabIndexChange = useCallback(
    (nextIndex: number) => {
      setTabIndex(nextIndex);
      if (tabRoutes[nextIndex]?.key === "inProgress" && isOpen) {
        void loadInProgressExercises();
      }
    },
    [isOpen, loadInProgressExercises, tabRoutes]
  );

  const rotateInterpolation = buttonRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  return (
    <>
      {/* Backdrop with blur */}
      {isOpen && (
        <Animated.View
          style={[styles.backdrop, { opacity: fadeAnim }]}
          pointerEvents={isOpen ? "auto" : "none"}
        >
          <Pressable style={styles.backdropPressable} onPress={closeDropdown}>
            <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={styles.blurView} />
          </Pressable>
        </Animated.View>
      )}

      {/* Dropdown panel */}
      <Animated.View
        style={[
          styles.dropdownContainer,
          { transform: [{ translateY: slideAnim }] },
        ]}
        pointerEvents={isOpen ? "auto" : "none"}
      >
        <View
          style={[
            styles.dropdown,
            {
              backgroundColor: rawColors.surface,
              shadowColor: rawColors.shadow,
            },
          ]}
        >
          <TabView
            navigationState={{ index: tabIndex, routes: tabRoutes }}
            renderScene={renderScene}
            onIndexChange={handleTabIndexChange}
            initialLayout={{ width: layout.width - 32 }}
            swipeEnabled={false}
            renderTabBar={(props) => (
              <View style={[styles.dropdownHeader, { borderBottomColor: rawColors.borderLight }]}>
                <View style={styles.dropdownTitleRow}>
                  <MaterialCommunityIcons name="dumbbell" size={20} color={rawColors.primary} />
                  <Text style={[styles.dropdownTitle, { color: rawColors.foreground }]}>Exercises</Text>
                </View>
                <TabBar
                  {...props}
                  indicatorStyle={{ backgroundColor: rawColors.primary }}
                  style={[styles.tabBar, { backgroundColor: rawColors.surface }]}
                  activeColor={rawColors.primary}
                  inactiveColor={rawColors.foregroundSecondary}
                  pressColor={rawColors.pressed}
                />
              </View>
            )}
          />
        </View>
      </Animated.View>

      {/* Floating Action Button */}
      <Pressable style={[styles.fab, { backgroundColor: rawColors.primary, shadowColor: rawColors.primary }]} onPress={handleToggle}>
        <Animated.View style={{ transform: [{ rotate: rotateInterpolation }] }}>
          <MaterialCommunityIcons
            name={isOpen ? "close" : "pin"}
            size={24}
            color={rawColors.surface}
          />
        </Animated.View>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 998,
  },
  backdropPressable: {
    flex: 1,
  },
  blurView: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  dropdownContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    paddingTop: 108,
    paddingHorizontal: 16,
  },
  dropdown: {
    borderRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    height: SCREEN_HEIGHT * 0.6,
  },
  dropdownHeader: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 0,
    borderBottomWidth: 1,
  },
  dropdownTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 10,
  },
  dropdownTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  tabBar: {
    marginHorizontal: -16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
  },
  exerciseList: {
    paddingVertical: 8,
  },
  exerciseItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  swipeAction: {
    justifyContent: "center",
    alignItems: "flex-end",
  },
  removeButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 140,
    height: "100%",
    flexDirection: "column",
    gap: 4,
  },
  removeButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  exerciseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: "600",
  },
  exerciseMuscle: {
    fontSize: 13,
    marginTop: 2,
  },
  fab: {
    position: "absolute",
    top: 48,
    right: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 1000,
  },
});
