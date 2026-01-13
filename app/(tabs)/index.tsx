import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getLastWorkoutDay, type LastWorkoutDayResult } from "../../lib/db/workouts";
import { useTheme } from "../../lib/theme/ThemeContext";

export default function OverviewScreen() {
  const { themeColors } = useTheme();
  const [lastWorkout, setLastWorkout] = useState<LastWorkoutDayResult | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLastWorkout = useCallback(async () => {
    try {
      const result = await getLastWorkoutDay();
      setLastWorkout(result);
    } catch (error) {
      console.error("Error loading last workout:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      loadLastWorkout();
    }, [loadLastWorkout])
  );

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const getAlphabetLetter = (index: number) => {
    return String.fromCharCode(65 + index); // A = 65
  };

  const handleWorkoutHistoryPress = () => {
    // TODO: Navigate to full workout history screen
    console.log("Navigate to workout history");
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>
            WorkoutLog
          </Text>
        </View>

        {/* Quick Stats */}
        <View
          style={[
            styles.card,
            { backgroundColor: themeColors.surface, shadowColor: themeColors.shadow }
          ]}
        >
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>
            Quick Stats
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="dumbbell" size={32} color={themeColors.primary} />
              <Text style={[styles.statValue, { color: themeColors.text }]}>0</Text>
              <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Workouts</Text>
            </View>
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="fire" size={32} color={themeColors.warning} />
              <Text style={[styles.statValue, { color: themeColors.text }]}>0</Text>
              <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Day Streak</Text>
            </View>
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="trophy" size={32} color={themeColors.success} />
              <Text style={[styles.statValue, { color: themeColors.text }]}>0</Text>
              <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>PRs</Text>
            </View>
          </View>
        </View>

        {/* Workout History */}
        <View
          style={[
            styles.card,
            styles.workoutHistoryCard,
            { backgroundColor: themeColors.surface, shadowColor: themeColors.shadow }
          ]}
        >
          {/* Card Header */}
          <Pressable
            style={styles.cardHeader}
            onPress={handleWorkoutHistoryPress}
          >
            <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 0 }]}>
              Workout History
            </Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={themeColors.textSecondary}
            />
          </Pressable>

          {/* Content */}
          {loading ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: themeColors.textTertiary }]}>
                Loading...
              </Text>
            </View>
          ) : lastWorkout === null ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="clipboard-text-outline"
                size={48}
                color={themeColors.textLight}
              />
              <Text style={[styles.emptyText, { color: themeColors.textTertiary }]}>
                No workouts yet
              </Text>
              <Text style={[styles.emptySubtext, { color: themeColors.textLight }]}>
                Complete an exercise to see your activity here
              </Text>
            </View>
          ) : (
            <View style={styles.lastWorkoutContent}>
              {/* Last Workout Header */}
              <View style={styles.lastWorkoutHeader}>
                <Text style={[styles.lastWorkoutLabel, { color: themeColors.textSecondary }]}>
                  Last Workout
                </Text>
                <Text style={[styles.lastWorkoutDate, { color: themeColors.text }]}>
                  {formatDate(lastWorkout.date)}
                </Text>
              </View>

              {/* Exercise List */}
              <ScrollView
                style={styles.exerciseList}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {lastWorkout.exercises.map((exercise, index) => (
                  <View key={exercise.workoutExerciseId} style={styles.exerciseItem}>
                    {/* Alphabet Circle */}
                    <View style={[styles.alphabetCircle, { backgroundColor: themeColors.primary }]}>
                      <Text style={styles.alphabetText}>
                        {getAlphabetLetter(index)}
                      </Text>
                    </View>

                    {/* Exercise Details */}
                    <View style={styles.exerciseDetails}>
                      <Text
                        style={[styles.exerciseName, { color: themeColors.text }]}
                        numberOfLines={1}
                      >
                        {exercise.exerciseName}
                      </Text>
                      <Text style={[styles.bestSetText, { color: themeColors.textSecondary }]}>
                        {exercise.bestSet
                          ? `Best set: ${exercise.bestSet.weightKg} kg × ${exercise.bestSet.reps} (e1RM ${exercise.bestSet.e1rm} kg)`
                          : "Best set: —"}
                      </Text>
                    </View>
                  </View>
                ))}

                {/* Show more indicator */}
                {lastWorkout.hasMore && (
                  <Text style={[styles.showMoreText, { color: themeColors.textTertiary }]}>
                    Showing first 26 exercises
                  </Text>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
    marginTop: 48,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  workoutHistoryCard: {
    minHeight: 400,
    maxHeight: 700,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  lastWorkoutContent: {
    flex: 1,
  },
  lastWorkoutHeader: {
    marginBottom: 16,
  },
  lastWorkoutLabel: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  lastWorkoutDate: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 4,
  },
  exerciseList: {
    flex: 1,
  },
  exerciseItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  alphabetCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  alphabetText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  exerciseDetails: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  bestSetText: {
    fontSize: 13,
  },
  showMoreText: {
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 8,
    fontStyle: "italic",
  },
});
