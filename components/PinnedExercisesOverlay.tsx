import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getPinnedExercises, type Exercise } from "../lib/db/exercises";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function PinnedExercisesOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [pinnedExercises, setPinnedExercises] = useState<Exercise[]>([]);
  const slideAnim = useRef(new Animated.Value(-SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const buttonRotation = useRef(new Animated.Value(0)).current;

  const loadPinnedExercises = useCallback(async () => {
    const exercises = await getPinnedExercises();
    setPinnedExercises(exercises);
  }, []);

  // Load pinned exercises when opening
  useEffect(() => {
    if (isOpen) {
      loadPinnedExercises();
    }
  }, [isOpen, loadPinnedExercises]);

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
            <BlurView intensity={20} tint="dark" style={styles.blurView} />
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
        <View style={styles.dropdown}>
          <View style={styles.dropdownHeader}>
            <MaterialCommunityIcons name="pin" size={20} color="#007AFF" />
            <Text style={styles.dropdownTitle}>Pinned Exercises</Text>
          </View>

          {pinnedExercises.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="pin-off-outline"
                size={48}
                color="#ccc"
              />
              <Text style={styles.emptyText}>No pinned exercises</Text>
              <Text style={styles.emptySubtext}>
                Pin exercises from their detail page for quick access
              </Text>
            </View>
          ) : (
            <View style={styles.exerciseList}>
              {pinnedExercises.map((exercise) => (
                <Pressable
                  key={exercise.id}
                  style={styles.exerciseItem}
                  onPress={() => handleExercisePress(exercise)}
                >
                  <View style={styles.exerciseIcon}>
                    <MaterialCommunityIcons
                      name="dumbbell"
                      size={20}
                      color="#007AFF"
                    />
                  </View>
                  <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseName}>{exercise.name}</Text>
                    {exercise.muscleGroup && (
                      <Text style={styles.exerciseMuscle}>
                        {exercise.muscleGroup}
                      </Text>
                    )}
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={24}
                    color="#ccc"
                  />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </Animated.View>

      {/* Floating Action Button */}
      <Pressable style={styles.fab} onPress={handleToggle}>
        <Animated.View style={{ transform: [{ rotate: rotateInterpolation }] }}>
          <MaterialCommunityIcons
            name={isOpen ? "close" : "pin"}
            size={24}
            color="#fff"
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
    backgroundColor: "#fff",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  dropdownTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
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
  exerciseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0f8ff",
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
    color: "#000",
  },
  exerciseMuscle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  fab: {
    position: "absolute",
    top: 48,
    right: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 1000,
  },
});

