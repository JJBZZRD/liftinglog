/**
 * Data Point Modal Component
 * 
 * Displays detailed session information when a data point is pressed on the chart.
 * Styled to match the History/Record UI patterns.
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";
import type { SessionDetails } from "../../lib/utils/analytics";
import SetItem from "../lists/SetItem";

interface DataPointModalProps {
  visible: boolean;
  onClose: () => void;
  sessionDetails: SessionDetails | null;
  exerciseName?: string;
  loading?: boolean;
}

export default function DataPointModal({
  visible,
  onClose,
  sessionDetails,
  exerciseName,
  loading = false,
}: DataPointModalProps) {
  const { themeColors } = useTheme();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  // Responsive card dimensions (matches History modal pattern)
  const cardMaxHeight = Math.min(windowHeight * 0.8, 600);
  const cardMaxWidth = Math.min(windowWidth - 40, 380);

  // Determine which branch will be rendered
  const hasDetailsWithSets = !!(sessionDetails && sessionDetails.sets && sessionDetails.sets.length > 0);

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Inner Pressable consumes touches to prevent closing when tapping inside card */}
        <Pressable
          style={[
            styles.container,
            {
              backgroundColor: themeColors.surface,
              maxHeight: cardMaxHeight,
              maxWidth: cardMaxWidth,
            }
          ]}
          onPress={() => {/* Consume touch - do not close */}}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
                Loading...
              </Text>
            </View>
          ) : hasDetailsWithSets ? (
            <ScrollView 
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Header - matches History workoutHeader pattern */}
              <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
                <View style={styles.headerLeft}>
                  <Text style={[styles.title, { color: themeColors.text }]}>
                    Session
                  </Text>
                  {exerciseName && (
                    <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                      {exerciseName}
                    </Text>
                  )}
                </View>
                <Pressable 
                  onPress={onClose} 
                  hitSlop={12}
                  style={[styles.closeButton, { backgroundColor: themeColors.surfaceSecondary }]}
                >
                  <MaterialCommunityIcons name="close" size={20} color={themeColors.textSecondary} />
                </Pressable>
              </View>

              {/* Date/Time Meta Row - matches History workoutDateContainer pattern */}
              <View style={styles.metaRow}>
                <MaterialCommunityIcons name="calendar-outline" size={16} color={themeColors.textSecondary} />
                <Text style={[styles.metaDate, { color: themeColors.text }]}>
                  {formatDate(sessionDetails.date)}
                </Text>
                <Text style={[styles.metaTime, { color: themeColors.textSecondary }]}>
                  {formatTime(sessionDetails.date)}
                </Text>
              </View>

              {/* Sets Section - matches History setsContainer pattern */}
              <View style={styles.setsSection}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  Sets ({sessionDetails.totalSets})
                </Text>
                <View style={styles.setsList}>
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
                </View>
              </View>

              {/* Summary Section - compact stat tiles */}
              <View style={styles.summarySection}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
                  Summary
                </Text>
                
                {/* Stat Tiles Row */}
                <View style={styles.statRow}>
                  <View style={[styles.statTile, { backgroundColor: themeColors.surfaceSecondary }]}>
                    <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>
                      Volume
                    </Text>
                    <Text style={[styles.statValue, { color: themeColors.text }]}>
                      {sessionDetails.totalVolume.toFixed(0)}
                    </Text>
                    <Text style={[styles.statUnit, { color: themeColors.textSecondary }]}>kg</Text>
                  </View>
                  <View style={[styles.statTile, { backgroundColor: themeColors.surfaceSecondary }]}>
                    <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>
                      Reps
                    </Text>
                    <Text style={[styles.statValue, { color: themeColors.text }]}>
                      {sessionDetails.totalReps}
                    </Text>
                    <Text style={[styles.statUnit, { color: themeColors.textSecondary }]}>total</Text>
                  </View>
                  {sessionDetails.estimatedE1RM && (
                    <View style={[styles.statTile, { backgroundColor: themeColors.surfaceSecondary }]}>
                      <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>
                        Est. 1RM
                      </Text>
                      <Text style={[styles.statValue, { color: themeColors.primary }]}>
                        {sessionDetails.estimatedE1RM.toFixed(0)}
                      </Text>
                      <Text style={[styles.statUnit, { color: themeColors.textSecondary }]}>kg</Text>
                    </View>
                  )}
                </View>

                {/* Best Set Row */}
                {sessionDetails.bestSet && (
                  <View style={[styles.bestSetRow, { borderColor: themeColors.border }]}>
                    <Text style={[styles.bestSetLabel, { color: themeColors.textSecondary }]}>
                      Best Set
                    </Text>
                    <Text style={[styles.bestSetValue, { color: themeColors.text }]}>
                      {sessionDetails.bestSet.weight} kg × {sessionDetails.bestSet.reps} reps
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons 
                name="dumbbell" 
                size={40} 
                color={themeColors.textTertiary} 
              />
              <Text style={[styles.emptyText, { color: themeColors.text }]}>
                No sets found
              </Text>
              <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>
                No data available for this session
              </Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Overlay - matches History modalOverlay
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  
  // Container - matches History card style (borderRadius: 12)
  container: {
    borderRadius: 16,
    width: "100%",
    minHeight: 150,
    flexShrink: 1,
    overflow: "hidden",
    // Subtle shadow for elevation
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  
  // ScrollView
  scrollView: {
    flexGrow: 1,
    flexShrink: 1,
  },
  scrollContent: {
    padding: 16,
  },
  
  // Header - matches History workoutHeader pattern
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 12,
    marginBottom: 12,
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
  
  // Meta Row - matches History workoutDateContainer
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  metaDate: {
    fontSize: 15,
    fontWeight: "600",
  },
  metaTime: {
    fontSize: 14,
  },
  
  // Sets Section - matches History setsContainer
  setsSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  setsList: {
    gap: 4,
  },
  
  // Summary Section
  summarySection: {
    gap: 10,
  },
  statRow: {
    flexDirection: "row",
    gap: 8,
  },
  statTile: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  statUnit: {
    fontSize: 11,
    fontWeight: "500",
  },
  bestSetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  bestSetLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  bestSetValue: {
    fontSize: 14,
    fontWeight: "600",
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
  
  // Empty State - matches History empty pattern
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
