import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import SetItem from "../../components/lists/SetItem";
import {
  dayKeyToTimestamp,
  getWorkoutDayPage,
  type WorkoutDayExerciseEntry,
  type WorkoutDayPageData,
} from "../../lib/db/workouts";
import { useTheme } from "../../lib/theme/ThemeContext";

// Helper to get alphabet letter (A-Z)
const getAlphabetLetter = (index: number) => String.fromCharCode(65 + index);

export default function WorkoutDayScreen() {
  const { themeColors } = useTheme();
  const params = useLocalSearchParams<{ dayKey: string }>();
  const dayKey = typeof params.dayKey === "string" ? params.dayKey : "";

  const [data, setData] = useState<WorkoutDayPageData | null>(null);
  const [loading, setLoading] = useState(true);

  // Compute display title from dayKey
  const displayDate = dayKey ? new Date(dayKeyToTimestamp(dayKey)) : new Date();
  const title = `${displayDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} Workout`;

  // Load data on focus (refreshes when returning from edit)
  const loadData = useCallback(async () => {
    if (!dayKey) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await getWorkoutDayPage(dayKey);
      setData(result);
    } catch (error) {
      console.error("Error loading workout day page:", error);
    } finally {
      setLoading(false);
    }
  }, [dayKey]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Handle long press on exercise card - navigate to edit
  const handleLongPressExercise = useCallback((entry: WorkoutDayExerciseEntry) => {
    router.push({
      pathname: "/edit-workout",
      params: {
        workoutExerciseId: String(entry.workoutExerciseId),
        exerciseName: entry.exerciseName,
      },
    });
  }, []);

  if (!dayKey) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <Stack.Screen
          options={{
            title: "Workout",
            headerStyle: { backgroundColor: themeColors.surface },
            headerTitleStyle: { color: themeColors.text },
          }}
        />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: themeColors.error }]}>
            Invalid workout day
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Stack.Screen
        options={{
          title,
          headerStyle: { backgroundColor: themeColors.surface },
          headerTitleStyle: { color: themeColors.text },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={themeColors.text} />
            </Pressable>
          ),
        }}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      ) : !data ? (
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons
            name="clipboard-text-outline"
            size={64}
            color={themeColors.textLight}
          />
          <Text style={[styles.emptyText, { color: themeColors.textTertiary }]}>
            No workout data found
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          {/* Stats Card */}
          <View style={[styles.statsCard, { backgroundColor: themeColors.surface, shadowColor: themeColors.shadow }]}>
            <Text style={[styles.statsTitle, { color: themeColors.text }]}>Workout Stats</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: themeColors.text }]}>
                  {data.totals.totalExercises}
                </Text>
                <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>
                  Exercises
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: themeColors.text }]}>
                  {data.totals.totalSets}
                </Text>
                <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>
                  Sets
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: themeColors.text }]}>
                  {data.totals.totalReps}
                </Text>
                <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>
                  Reps
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: themeColors.text }]}>
                  {data.totals.totalVolumeKg.toLocaleString()}
                </Text>
                <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>
                  Volume (kg)
                </Text>
              </View>
              {data.totals.bestE1rmKg && (
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: themeColors.text }]}>
                    {data.totals.bestE1rmKg}
                  </Text>
                  <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>
                    Best e1RM
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Exercise List */}
          <View style={styles.exerciseListSection}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
              Exercises ({data.entries.length})
            </Text>

            {data.entries.map((entry, index) => (
              <Pressable
                key={entry.workoutExerciseId}
                style={[styles.exerciseCard, { backgroundColor: themeColors.surface, shadowColor: themeColors.shadow }]}
                onLongPress={() => handleLongPressExercise(entry)}
                delayLongPress={400}
              >
                {/* Header Row - A-Z badge + exercise name */}
                <View style={[styles.exerciseHeader, { borderBottomColor: themeColors.border }]}>
                  <View style={[styles.alphabetCircle, { backgroundColor: themeColors.primary }]}>
                    <Text style={styles.alphabetText}>{getAlphabetLetter(index)}</Text>
                  </View>
                  <Text style={[styles.exerciseName, { color: themeColors.text }]} numberOfLines={1}>
                    {entry.exerciseName}
                  </Text>
                </View>

                {/* Sets List */}
                <View style={styles.setsContainer}>
                  {entry.sets.length === 0 ? (
                    <Text style={[styles.noSetsText, { color: themeColors.textTertiary }]}>
                      No sets recorded
                    </Text>
                  ) : (
                    entry.sets.map((set, setIndex) => (
                      <SetItem
                        key={set.id}
                        index={setIndex + 1}
                        weightKg={set.weightKg}
                        reps={set.reps}
                        note={set.note}
                        variant="compact"
                      />
                    ))
                  )}
                </View>
              </Pressable>
            ))}

            {/* Overflow indicator */}
            {data.hasMore && (
              <Text style={[styles.showMoreText, { color: themeColors.textTertiary }]}>
                Showing first 26 exercises
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    padding: 8,
    marginLeft: -8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  // Stats Card
  statsCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
    minWidth: 70,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  // Exercise List Section
  exerciseListSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  // Exercise Card (similar to HistoryTab.tsx)
  exerciseCard: {
    borderRadius: 12,
    padding: 16,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  exerciseHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
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
  exerciseName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  setsContainer: {
    gap: 4,
  },
  noSetsText: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 8,
  },
  showMoreText: {
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 12,
    fontStyle: "italic",
  },
});
