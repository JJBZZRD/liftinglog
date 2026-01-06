import { router, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { deleteWorkout, getExerciseHistory, type WorkoutHistoryEntry } from "../../../lib/db/workouts";
import { useTheme } from "../../../lib/theme/ThemeContext";

export default function HistoryTab() {
  const { themeColors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; name?: string; workoutId?: string; refreshHistory?: string }>();
  const exerciseId = typeof params.id === "string" ? parseInt(params.id, 10) : null;
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutHistoryEntry | null>(null);

  const loadHistory = useCallback(async () => {
    if (!exerciseId) {
      setLoading(false);
      return;
    }

    try {
      const exerciseHistory = await getExerciseHistory(exerciseId);
      setHistory(exerciseHistory);
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

  const handleLongPress = useCallback((entry: WorkoutHistoryEntry) => {
    // Only show edit/delete modal for completed workouts
    const isCompleted = entry.workout.completedAt !== null;
    if (!isCompleted) return;
    
    setSelectedWorkout(entry);
    setActionModalVisible(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedWorkout) return;
    
    try {
      await deleteWorkout(selectedWorkout.workout.id);
      setActionModalVisible(false);
      setSelectedWorkout(null);
      await loadHistory();
    } catch (error) {
      console.error("Error deleting workout:", error);
    }
  }, [selectedWorkout, loadHistory]);

  const handleEdit = useCallback(() => {
    if (!selectedWorkout || !exerciseId) return;
    setActionModalVisible(false);
    const workout = selectedWorkout.workout;
    setSelectedWorkout(null);
    // Navigate to edit-workout page
    router.push({
      pathname: "/edit-workout",
      params: {
        exerciseId: String(exerciseId),
        workoutId: String(workout.id),
        exerciseName: typeof params.name === "string" ? params.name : "Exercise",
      },
    });
  }, [selectedWorkout, exerciseId, params.name]);

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
          const workoutDate = item.workout.completedAt ?? item.workout.startedAt;
          const isCompleted = item.workout.completedAt !== null;

          return (
            <Pressable
              onLongPress={() => handleLongPress(item)}
              style={[styles.workoutCard, { backgroundColor: themeColors.surfaceSecondary, borderColor: themeColors.border }]}
            >
              <View style={[styles.workoutHeader, { borderBottomColor: themeColors.border }]}>
                <View style={styles.workoutDateContainer}>
                  <Text style={[styles.workoutDate, { color: themeColors.text }]}>{formatDate(workoutDate)}</Text>
                  <Text style={[styles.workoutTime, { color: themeColors.textSecondary }]}>{formatTime(workoutDate)}</Text>
                </View>
                {!isCompleted && (
                  <View style={[styles.inProgressBadge, { backgroundColor: themeColors.primary }]}>
                    <Text style={[styles.inProgressText, { color: themeColors.surface }]}>In Progress</Text>
                  </View>
                )}
              </View>

              <View style={styles.setsContainer}>
                {item.sets.map((set, index) => (
                  <View key={set.id} style={[styles.setRow, { backgroundColor: themeColors.surface }]}>
                    <View style={[styles.setNumber, { backgroundColor: themeColors.primary }]}>
                      <Text style={[styles.setNumberText, { color: themeColors.surface }]}>{index + 1}</Text>
                    </View>
                    <View style={styles.setInfo}>
                      {set.weightKg !== null && (
                        <Text style={[styles.setDetail, { color: themeColors.text }]}>{set.weightKg} kg</Text>
                      )}
                      {set.reps !== null && (
                        <Text style={[styles.setDetail, { color: themeColors.text }]}>{set.reps} reps</Text>
                      )}
                      {set.note && (
                        <Text style={[styles.setNote, { color: themeColors.textSecondary }]} numberOfLines={1}>
                          {set.note}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        }}
      />

      {/* Action Modal */}
      <Modal
        visible={actionModalVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => {
          setActionModalVisible(false);
          setSelectedWorkout(null);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setActionModalVisible(false);
            setSelectedWorkout(null);
          }}
        >
          <View style={[styles.actionModalContent, { backgroundColor: themeColors.surface }]}>
            <Pressable
              style={[styles.actionButton, { borderBottomColor: themeColors.border }]}
              onPress={(e) => {
                e.stopPropagation();
                handleEdit();
              }}
            >
              <Text style={[styles.actionButtonText, { color: themeColors.primary }]}>Edit</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.deleteActionButton]}
              onPress={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
            >
              <Text style={[styles.actionButtonText, { color: themeColors.error }]}>Delete</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.cancelActionButton, { backgroundColor: themeColors.surfaceSecondary }]}
              onPress={(e) => {
                e.stopPropagation();
                setActionModalVisible(false);
                setSelectedWorkout(null);
              }}
            >
              <Text style={[styles.cancelActionButtonText, { color: themeColors.textSecondary }]}>Cancel</Text>
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
    gap: 8,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    marginBottom: 4,
  },
  setNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  setNumberText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  setInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  setDetail: {
    fontSize: 15,
    fontWeight: "500",
    color: "#000",
  },
  setNote: {
    fontSize: 13,
    color: "#666",
    fontStyle: "italic",
    flex: 1,
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
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "100%",
    maxWidth: 300,
    padding: 0,
    overflow: "hidden",
  },
  actionButton: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5ea",
    alignItems: "center",
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  deleteActionButton: {
    borderBottomWidth: 0,
  },
  deleteActionButtonText: {
    color: "#ff3b30",
  },
  cancelActionButton: {
    borderBottomWidth: 0,
    backgroundColor: "#f9f9f9",
  },
  cancelActionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
});

