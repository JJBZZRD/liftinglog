/**
 * Data Point Modal Component
 * 
 * Displays detailed session information when a data point is pressed on the chart.
 * Layout: Header → Date/Time → Summary (fixed) → Sets (scrollable)
 * Styled to match the History/Record UI patterns.
 * 
 * Layout strategy (measurement-based):
 * - Container: maxHeight cap with base minHeight: 200
 * - fixedSection: flexShrink: 0, overflow: hidden (NEVER shrinks, children clipped)
 * - Measure fixedSection height via onLayout
 * - Compute remaining height for sets: cardMaxHeight - fixedHeight
 * - Apply explicit height to setsContainer to guarantee visible sets area
 * 
 * Gesture handling:
 * - Overlay is a View (not Pressable) containing a sibling backdrop Pressable
 * - Card is a View (not Pressable) so ScrollView receives pan gestures
 * - Backdrop Pressable (StyleSheet.absoluteFill) catches taps outside card to close
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { deleteExerciseSession } from "../../lib/db/workouts";
import { useTheme } from "../../lib/theme/ThemeContext";
import type { SessionDetails } from "../../lib/utils/analytics";
import SetItem from "../lists/SetItem";

// Minimum height for the sets region (ensures 2-3 rows visible)
const MIN_SETS_HEIGHT = 160;

interface DataPointModalProps {
  visible: boolean;
  onClose: () => void;
  sessionDetails: SessionDetails | null;
  exerciseName?: string;
  exerciseId?: number | null;
  loading?: boolean;
  /** Called after a successful deletion to refresh data */
  onDeleted?: () => void;
}

export default function DataPointModal({
  visible,
  onClose,
  sessionDetails,
  exerciseName,
  exerciseId,
  loading = false,
  onDeleted,
}: DataPointModalProps) {
  const { rawColors } = useTheme();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  // Track measured height of the fixed section
  const [fixedHeight, setFixedHeight] = useState(0);

  // Responsive card dimensions (pixel-based)
  const cardMaxHeight = Math.min(windowHeight * 0.8, 600);
  const cardMaxWidth = Math.min(windowWidth - 40, 380);

  // Compute available height for sets region
  // Ensure at least MIN_SETS_HEIGHT even if fixedSection is tall
  const availableForSets = fixedHeight > 0 
    ? Math.max(MIN_SETS_HEIGHT, cardMaxHeight - fixedHeight)
    : MIN_SETS_HEIGHT;

  // Determine which branch will be rendered
  const hasDetailsWithSets = !!(sessionDetails && sessionDetails.sets && sessionDetails.sets.length > 0);

  // onLayout handlers
  const handleCardLayout = (event: LayoutChangeEvent) => {
    if (__DEV__) {
      const { width, height } = event.nativeEvent.layout;
      console.log("[DataPointModal] Card layout:", { width, height });
    }
  };

  const handleFixedSectionLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setFixedHeight(height);
    if (__DEV__) {
      console.log("[DataPointModal] FixedSection layout:", { height, availableForSets: Math.max(MIN_SETS_HEIGHT, cardMaxHeight - height) });
    }
  };

  const handleSetsContainerLayout = (event: LayoutChangeEvent) => {
    if (__DEV__) {
      const { width, height } = event.nativeEvent.layout;
      console.log("[DataPointModal] SetsContainer layout:", { width, height });
    }
  };

  const handleScrollViewLayout = (event: LayoutChangeEvent) => {
    if (__DEV__) {
      const { width, height } = event.nativeEvent.layout;
      console.log("[DataPointModal] ScrollView layout:", { width, height });
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const handleDelete = () => {
    if (!sessionDetails || !exerciseId) return;
    
    Alert.alert(
      "Delete Session",
      `Are you sure you want to delete this ${exerciseName || "exercise"} session? This will remove all ${sessionDetails.totalSets} sets and cannot be undone.`,
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
              await deleteExerciseSession(sessionDetails.workoutId, exerciseId);
              onClose();
              onDeleted?.();
            } catch (error) {
              if (__DEV__) console.error("[DataPointModal] Error deleting session:", error);
              Alert.alert("Error", "Failed to delete session. Please try again.");
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* View-based overlay with sibling backdrop Pressable */}
      {/* This structure allows ScrollView to receive pan gestures */}
      <View style={styles.overlay}>
        {/* Backdrop - catches taps outside the card to close modal */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        
        {/* Card container - View (not Pressable) so gestures pass through to ScrollView */}
        <View
          onLayout={handleCardLayout}
          style={[
            styles.container,
            {
              backgroundColor: rawColors.surface,
              maxHeight: cardMaxHeight,
              maxWidth: cardMaxWidth,
            }
          ]}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={[styles.loadingText, { color: rawColors.foregroundSecondary }]}>
                Loading...
              </Text>
            </View>
          ) : hasDetailsWithSets ? (
            <>
              {/* ===== FIXED SECTION (Header + Date + Summary) ===== */}
              {/* flexShrink: 0, overflow: hidden - maintains natural height, clips children */}
              <View 
                style={styles.fixedSection}
                onLayout={handleFixedSectionLayout}
              >
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: rawColors.border }]}>
                  <View style={styles.headerLeft}>
                    <Text style={[styles.title, { color: rawColors.foreground }]}>
                      Session
                    </Text>
                    {exerciseName && (
                      <Text style={[styles.subtitle, { color: rawColors.foregroundSecondary }]}>
                        {exerciseName}
                      </Text>
                    )}
                  </View>
                  <Pressable 
                    onPress={onClose} 
                    hitSlop={12}
                    style={[styles.closeButton, { backgroundColor: rawColors.surfaceSecondary }]}
                  >
                    <MaterialCommunityIcons name="close" size={20} color={rawColors.foregroundSecondary} />
                  </Pressable>
                </View>

                {/* Date/Time Meta Row */}
                <View style={styles.metaRow}>
                  <View style={styles.metaLeft}>
                    <MaterialCommunityIcons name="calendar-outline" size={16} color={rawColors.foregroundSecondary} />
                    <Text style={[styles.metaDate, { color: rawColors.foreground }]}>
                      {formatDate(sessionDetails.date)}
                    </Text>
                    <Text style={[styles.metaTime, { color: rawColors.foregroundSecondary }]}>
                      {formatTime(sessionDetails.date)}
                    </Text>
                  </View>
                  {exerciseId && (
                    <View style={styles.metaActions}>
                      <Pressable
                        onPress={() => {
                          onClose();
                          router.push({
                            pathname: "/edit-workout",
                            params: {
                              exerciseId: String(exerciseId),
                              workoutId: String(sessionDetails.workoutId),
                              exerciseName: exerciseName || "Exercise",
                            },
                          });
                        }}
                        hitSlop={8}
                        style={[styles.actionButton, { backgroundColor: rawColors.surfaceSecondary }]}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={16} color={rawColors.primary} />
                      </Pressable>
                      <Pressable
                        onPress={handleDelete}
                        hitSlop={8}
                        style={[styles.actionButton, { backgroundColor: rawColors.surfaceSecondary }]}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color={rawColors.destructive} />
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* Summary Section */}
                <View style={styles.summarySection}>
                  <Text style={[styles.sectionTitle, { color: rawColors.foreground }]}>
                    Summary
                  </Text>
                  
                  {/* Stat Tiles Row */}
                  <View style={styles.statRow}>
                    <View style={[styles.statTile, { backgroundColor: rawColors.surfaceSecondary }]}>
                      <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>
                        Volume
                      </Text>
                      <Text style={[styles.statValue, { color: rawColors.foreground }]}>
                        {sessionDetails.totalVolume.toFixed(0)}
                      </Text>
                      <Text style={[styles.statUnit, { color: rawColors.foregroundSecondary }]}>kg</Text>
                    </View>
                    <View style={[styles.statTile, { backgroundColor: rawColors.surfaceSecondary }]}>
                      <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>
                        Reps
                      </Text>
                      <Text style={[styles.statValue, { color: rawColors.foreground }]}>
                        {sessionDetails.totalReps}
                      </Text>
                      <Text style={[styles.statUnit, { color: rawColors.foregroundSecondary }]}>total</Text>
                    </View>
                    {sessionDetails.estimatedE1RM && (
                      <View style={[styles.statTile, { backgroundColor: rawColors.surfaceSecondary }]}>
                        <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>
                          Est. 1RM
                        </Text>
                        <Text style={[styles.statValue, { color: rawColors.primary }]}>
                          {sessionDetails.estimatedE1RM.toFixed(0)}
                        </Text>
                        <Text style={[styles.statUnit, { color: rawColors.foregroundSecondary }]}>kg</Text>
                      </View>
                    )}
                  </View>

                  {/* Best Set Row */}
                  {sessionDetails.bestSet && (
                    <View style={[styles.bestSetRow, { borderColor: rawColors.border }]}>
                      <Text style={[styles.bestSetLabel, { color: rawColors.foregroundSecondary }]}>
                        Best Set
                      </Text>
                      <Text style={[styles.bestSetValue, { color: rawColors.foreground }]}>
                        {sessionDetails.bestSet.weight} kg × {sessionDetails.bestSet.reps} reps
                      </Text>
                    </View>
                  )}
                </View>

                {/* Divider */}
                <View style={[styles.divider, { backgroundColor: rawColors.border }]} />
              </View>

              {/* ===== SETS SECTION (Title + Scrollable List) ===== */}
              {/* Explicit height computed from cardMaxHeight - fixedHeight */}
              <View 
                style={[
                  styles.setsContainer,
                  { height: availableForSets, minHeight: MIN_SETS_HEIGHT }
                ]}
                onLayout={handleSetsContainerLayout}
              >
                {/* Sets Title */}
                <Text style={[styles.sectionTitle, styles.setsSectionTitle, { color: rawColors.foreground }]}>
                  Sets ({sessionDetails.totalSets})
                </Text>
                
                {/* ScrollView - flex: 1 fills remaining space in setsContainer */}
                <ScrollView 
                  onLayout={handleScrollViewLayout}
                  style={styles.setsScrollView}
                  contentContainerStyle={styles.setsScrollContent}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                  bounces={false}
                >
                  {sessionDetails.sets.map((set, index) => (
                    <SetItem
                      key={index}
                      index={index + 1}
                      weightKg={set.weightKg}
                      reps={set.reps}
                      note={set.note}
                      variant="compact"
                    />
                  ))}
                </ScrollView>
              </View>
            </>
          ) : (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons 
                name="dumbbell" 
                size={40} 
                color={rawColors.foregroundMuted} 
              />
              <Text style={[styles.emptyText, { color: rawColors.foreground }]}>
                No sets found
              </Text>
              <Text style={[styles.emptySubtext, { color: rawColors.foregroundSecondary }]}>
                No data available for this session
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Overlay - centered flex container
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  
  // Container - content-sized card with maxHeight cap
  container: {
    borderRadius: 16,
    width: "100%",
    minHeight: 200,
    overflow: "hidden",
    // Subtle shadow for elevation
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  
  // Fixed section - header, date, summary
  // flexShrink: 0 - maintains natural height, never shrinks
  // overflow: hidden - prevents children from painting outside bounds (no visual overlap)
  fixedSection: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 0,
    flexShrink: 0,
    overflow: "hidden",
  },
  
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  
  // Meta Row
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  metaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaDate: {
    fontSize: 15,
    fontWeight: "600",
  },
  metaTime: {
    fontSize: 14,
  },
  metaActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  
  // Summary Section
  summarySection: {
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  setsSectionTitle: {
    marginBottom: 8,
  },
  statRow: {
    flexDirection: "row",
    gap: 6,
  },
  statTile: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "500",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  statUnit: {
    fontSize: 10,
    fontWeight: "500",
  },
  bestSetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  bestSetLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  bestSetValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  
  // Divider
  divider: {
    height: 1,
    marginTop: 8,
  },
  
  // Sets Container - explicit height computed from measurement
  // Height is set dynamically: cardMaxHeight - fixedHeight
  setsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  
  // ScrollView - fills setsContainer
  setsScrollView: {
    flex: 1,
  },
  setsScrollContent: {
    paddingBottom: 24,
    gap: 4,
  },
  
  // Loading State
  loadingContainer: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 15,
  },
  
  // Empty State
  emptyContainer: {
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
  },
});
