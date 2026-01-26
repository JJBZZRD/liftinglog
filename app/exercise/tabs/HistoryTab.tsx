import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import SetItem from "../../../components/lists/SetItem";
import { getPREventsBySetIds } from "../../../lib/db/prEvents";
import { deleteExerciseSession, getExerciseHistory, type WorkoutHistoryEntry, type SetRow } from "../../../lib/db/workouts";
import { useTheme } from "../../../lib/theme/ThemeContext";

// Extended set row with PR badge
type SetWithPR = SetRow & { prBadge?: string };

export default function HistoryTab() {
  const { themeColors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; name?: string; workoutId?: string; refreshHistory?: string }>();
  const exerciseId = typeof params.id === "string" ? parseInt(params.id, 10) : null;
  const exerciseName = typeof params.name === "string" ? params.name : "Exercise";
  const [history, setHistory] = useState<(WorkoutHistoryEntry & { sets: SetWithPR[] })[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    if (!exerciseId) {
      setLoading(false);
      return;
    }

    try {
      const exerciseHistory = await getExerciseHistory(exerciseId);
      
      // Get all set IDs to fetch PR events
      const allSetIds = exerciseHistory.flatMap(entry => entry.sets.map(set => set.id));
      const prEventsMap = await getPREventsBySetIds(allSetIds);
      
      // Map PR events to sets
      const historyWithPRs = exerciseHistory.map(entry => ({
        ...entry,
        sets: entry.sets.map(set => ({
          ...set,
          prBadge: prEventsMap.get(set.id)?.type.toUpperCase() || undefined,
        })),
      }));
      
      setHistory(historyWithPRs);
    } catch (error) {
      console.error("Error loading exercise history:", error);
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Reload history when component comes into focus (after returning from edit page)
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  // Also reload when refreshHistory param changes (triggered after saving edits)
  useEffect(() => {
    if (params.refreshHistory) {
      loadHistory();
      // Clear the param after refreshing
      router.setParams({ refreshHistory: undefined });
    }
  }, [params.refreshHistory, loadHistory]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const handleEdit = useCallback((entry: WorkoutHistoryEntry) => {
    if (!exerciseId) return;
    router.push({
      pathname: "/edit-workout",
      params: {
        exerciseId: String(exerciseId),
        workoutId: String(entry.workout.id),
        exerciseName,
      },
    });
  }, [exerciseId, exerciseName]);

  const handleDelete = useCallback((entry: WorkoutHistoryEntry) => {
    if (!exerciseId) return;
    
    const setCount = entry.sets.length;
    Alert.alert(
      "Delete Session",
      `Are you sure you want to delete this ${exerciseName} session? This will remove ${setCount} set${setCount !== 1 ? "s" : ""} and cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteExerciseSession(entry.workout.id, exerciseId);
              await loadHistory();
            } catch (error) {
              if (__DEV__) console.error("[HistoryTab] Error deleting session:", error);
              Alert.alert("Error", "Failed to delete session. Please try again.");
            }
          },
        },
      ]
    );
  }, [exerciseId, exerciseName, loadHistory]);

  if (!exerciseId) {
    return (
      <View style={[styles.tabContainer, { backgroundColor: themeColors.surface }]}>
        <Text style={[styles.errorText, { color: themeColors.error }]}>Invalid exercise ID</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.tabContainer, { backgroundColor: themeColors.surface }]}>
        <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Loading history...</Text>
      </View>
    );
  }

  if (history.length === 0) {
    return (
      <View style={[styles.tabContainer, { backgroundColor: themeColors.surface }]}>
        <Text style={[styles.emptyText, { color: themeColors.text }]}>No workout history found</Text>
        <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>Start recording sets to see your history here</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.surface }]}>
      <FlatList
        data={history}
        keyExtractor={(item) => String(item.workout.id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          // Use workoutExercise dates for display, fall back to workout dates
          const workoutDate = item.workoutExercise?.performedAt ?? item.workoutExercise?.completedAt ?? item.workout.startedAt;
          const isCompleted = item.workoutExercise?.completedAt !== null;

          return (
            <View
              style={[styles.workoutCard, { backgroundColor: themeColors.surfaceSecondary, borderColor: themeColors.border }]}
            >
              <View style={[styles.workoutHeader, { borderBottomColor: themeColors.border }]}>
                <View style={styles.workoutDateContainer}>
                  <Text style={[styles.workoutDate, { color: themeColors.text }]}>{formatDate(workoutDate)}</Text>
                  <Text style={[styles.workoutTime, { color: themeColors.textSecondary }]}>{formatTime(workoutDate)}</Text>
                </View>
                <View style={styles.headerActions}>
                  {!isCompleted && (
                    <View style={[styles.inProgressBadge, { backgroundColor: themeColors.primary }]}>
                      <Text style={[styles.inProgressText, { color: themeColors.surface }]}>In Progress</Text>
                    </View>
                  )}
                  {isCompleted && (
                    <>
                      <Pressable
                        onPress={() => handleEdit(item)}
                        hitSlop={8}
                        style={[styles.actionIconButton, { backgroundColor: themeColors.background }]}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={16} color={themeColors.primary} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDelete(item)}
                        hitSlop={8}
                        style={[styles.actionIconButton, { backgroundColor: themeColors.background }]}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color={themeColors.error} />
                      </Pressable>
                    </>
                  )}
                </View>
              </View>

              <View style={styles.setsContainer}>
                {item.sets.map((set, index) => (
                  <SetItem
                    key={set.id}
                    index={index + 1}
                    weightKg={set.weightKg}
                    reps={set.reps}
                    note={set.note}
                    variant="compact"
                    prBadge={set.prBadge}
                  />
                ))}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  listContent: {
    padding: 16,
  },
  tabContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  errorText: {
    fontSize: 16,
    color: "#ff3b30",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  workoutCard: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e5ea",
  },
  workoutHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5ea",
  },
  workoutDateContainer: {
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  workoutDate: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 2,
  },
  workoutTime: {
    fontSize: 14,
    color: "#666",
  },
  inProgressBadge: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  inProgressText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  setsContainer: {
    gap: 4,
  },
});

