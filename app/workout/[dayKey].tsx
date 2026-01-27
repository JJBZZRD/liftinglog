import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import SetItem from "../../components/lists/SetItem";
import {
  dayKeyToTimestamp,
  deleteWorkoutExercise,
  getWorkoutDayPage,
  type WorkoutDayExerciseEntry,
  type WorkoutDayPageData,
} from "../../lib/db/workouts";
import { useTheme } from "../../lib/theme/ThemeContext";

// Helper to get alphabet letter (A-Z)
const getAlphabetLetter = (index: number) => String.fromCharCode(65 + index);

export default function WorkoutDayScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ dayKey: string }>();
  const dayKey = typeof params.dayKey === "string" ? params.dayKey : "";

  const [data, setData] = useState<WorkoutDayPageData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Action modal state
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WorkoutDayExerciseEntry | null>(null);

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

  // Handle long press on exercise card - show action modal
  const handleLongPressExercise = useCallback((entry: WorkoutDayExerciseEntry) => {
    setSelectedEntry(entry);
    setActionModalVisible(true);
  }, []);

  // Handle edit action - navigate to edit page
  const handleEdit = useCallback(() => {
    if (!selectedEntry) return;
    setActionModalVisible(false);
    const entry = selectedEntry;
    setSelectedEntry(null);
    router.push({
      pathname: "/edit-workout",
      params: {
        workoutExerciseId: String(entry.workoutExerciseId),
        exerciseName: entry.exerciseName,
      },
    });
  }, [selectedEntry]);

  // Handle delete action - delete the workout exercise entry
  const handleDelete = useCallback(async () => {
    if (!selectedEntry) return;
    
    try {
      await deleteWorkoutExercise(selectedEntry.workoutExerciseId);
      setActionModalVisible(false);
      setSelectedEntry(null);
      await loadData();
    } catch (error) {
      console.error("Error deleting workout exercise:", error);
    }
  }, [selectedEntry, loadData]);

  if (!dayKey) {
    return (
      <View style={[styles.container, { backgroundColor: rawColors.background }]}>
        <Stack.Screen
          options={{
            title: "Workout",
            headerStyle: { backgroundColor: rawColors.surface },
            headerTitleStyle: { color: rawColors.foreground },
          }}
        />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: rawColors.destructive }]}>
            Invalid workout day
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: rawColors.background }]}>
      <Stack.Screen
        options={{
          title,
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={rawColors.primary} />
        </View>
      ) : !data ? (
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons
            name="clipboard-text-outline"
            size={64}
            color={rawColors.foregroundMuted}
          />
          <Text style={[styles.emptyText, { color: rawColors.foregroundMuted }]}>
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
          <View style={[styles.statsCard, { backgroundColor: rawColors.surface, shadowColor: rawColors.shadow }]}>
            <Text style={[styles.statsTitle, { color: rawColors.foreground }]}>Workout Stats</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: rawColors.foreground }]}>
                  {data.totals.totalExercises}
                </Text>
                <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>
                  Exercises
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: rawColors.foreground }]}>
                  {data.totals.totalSets}
                </Text>
                <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>
                  Sets
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: rawColors.foreground }]}>
                  {data.totals.totalReps}
                </Text>
                <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>
                  Reps
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: rawColors.foreground }]}>
                  {data.totals.totalVolumeKg.toLocaleString()}
                </Text>
                <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>
                  Volume (kg)
                </Text>
              </View>
              {data.totals.bestE1rmKg && (
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: rawColors.foreground }]}>
                    {data.totals.bestE1rmKg}
                  </Text>
                  <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>
                    Best e1RM
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Exercise List */}
          <View style={styles.exerciseListSection}>
            <Text style={[styles.sectionTitle, { color: rawColors.foreground }]}>
              Exercises ({data.entries.length})
            </Text>

            {data.entries.map((entry, index) => (
              <Pressable
                key={entry.workoutExerciseId}
                style={[styles.exerciseCard, { backgroundColor: rawColors.surface, shadowColor: rawColors.shadow }]}
                onLongPress={() => handleLongPressExercise(entry)}
                delayLongPress={400}
              >
                {/* Header Row - A-Z badge + exercise name */}
                <View style={[styles.exerciseHeader, { borderBottomColor: rawColors.border }]}>
                  <View style={[styles.alphabetCircle, { backgroundColor: rawColors.primary }]}>
                    <Text style={styles.alphabetText}>{getAlphabetLetter(index)}</Text>
                  </View>
                  <Text style={[styles.exerciseName, { color: rawColors.foreground }]} numberOfLines={1}>
                    {entry.exerciseName}
                  </Text>
                </View>

                {/* Sets List */}
                <View style={styles.setsContainer}>
                  {entry.sets.length === 0 ? (
                    <Text style={[styles.noSetsText, { color: rawColors.foregroundMuted }]}>
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
              <Text style={[styles.showMoreText, { color: rawColors.foregroundMuted }]}>
                Showing first 26 exercises
              </Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* Action Modal */}
      <Modal
        visible={actionModalVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => {
          setActionModalVisible(false);
          setSelectedEntry(null);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setActionModalVisible(false);
            setSelectedEntry(null);
          }}
        >
          <View style={[styles.actionModalContent, { backgroundColor: rawColors.surface }]}>
            <Pressable
              style={[styles.actionButton, { borderBottomColor: rawColors.border }]}
              onPress={(e) => {
                e.stopPropagation();
                handleEdit();
              }}
            >
              <Text style={[styles.actionButtonText, { color: rawColors.primary }]}>Edit</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.deleteActionButton]}
              onPress={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
            >
              <Text style={[styles.actionButtonText, { color: rawColors.destructive }]}>Delete</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.cancelActionButton, { backgroundColor: rawColors.surfaceSecondary }]}
              onPress={(e) => {
                e.stopPropagation();
                setActionModalVisible(false);
                setSelectedEntry(null);
              }}
            >
              <Text style={[styles.cancelActionButtonText, { color: rawColors.foregroundSecondary }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  actionModalContent: {
    borderRadius: 16,
    width: "100%",
    maxWidth: 300,
    padding: 0,
    overflow: "hidden",
  },
  actionButton: {
    padding: 16,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  deleteActionButton: {
    borderBottomWidth: 0,
  },
  cancelActionButton: {
    borderBottomWidth: 0,
  },
  cancelActionButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
