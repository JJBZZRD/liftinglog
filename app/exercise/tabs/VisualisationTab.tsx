import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useContext, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AnalyticsChart from "../../../components/charts/AnalyticsChart";
import DataPointModal from "../../../components/charts/DataPointModal";
import DateRangeSelector, {
  getDefaultDateRange,
  type DateRange,
} from "../../../components/charts/DateRangeSelector";
import FullscreenChart from "../../../components/charts/FullscreenChart";
import { TabSwipeContext } from "../../../lib/contexts/TabSwipeContext";
import { useTheme } from "../../../lib/theme/ThemeContext";
import {
  computeTrendLine,
  filterByDateRange,
  getEstimated1RMPerSession,
  getMaxRepsPerSession,
  getMaxWeightPerSession,
  getNumberOfSetsPerSession,
  getSessionDetails,
  getTotalVolumePerSession,
  type SessionDataPoint,
  type SessionDetails,
} from "../../../lib/utils/analytics";

type MetricType = "maxWeight" | "e1rm" | "totalVolume" | "maxReps" | "numSets";

const metricOptions: { label: string; value: MetricType }[] = [
  { label: "Max Weight Per Session", value: "maxWeight" },
  { label: "Estimated 1RM", value: "e1rm" },
  { label: "Total Volume", value: "totalVolume" },
  { label: "Max Reps", value: "maxReps" },
  { label: "Number of Sets", value: "numSets" },
];

const getMetricUnit = (metric: MetricType): string => {
  switch (metric) {
    case "maxWeight":
    case "e1rm":
      return "kg";
    case "totalVolume":
      return "kg";
    case "maxReps":
      return "reps";
    case "numSets":
      return "sets";
    default:
      return "";
  }
};

export default function VisualisationTab() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const exerciseId = typeof params.id === "string" ? parseInt(params.id, 10) : null;
  const exerciseName = typeof params.name === "string" ? params.name : "Exercise";
  
  // Get tab swipe control from parent context
  const { setSwipeEnabled } = useContext(TabSwipeContext);
  
  // Handlers to disable/enable tab swiping during chart gestures
  const handleGestureStart = useCallback(() => {
    setSwipeEnabled(false);
  }, [setSwipeEnabled]);
  
  const handleGestureEnd = useCallback(() => {
    setSwipeEnabled(true);
  }, [setSwipeEnabled]);

  // State
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("maxWeight");
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [allData, setAllData] = useState<SessionDataPoint[]>([]);
  const [filteredData, setFilteredData] = useState<SessionDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMetricPicker, setShowMetricPicker] = useState(false);
  
  // Data point modal state
  const [showDataPointModal, setShowDataPointModal] = useState(false);
  const [selectedSessionDetails, setSelectedSessionDetails] = useState<SessionDetails | null>(null);
  
  // Selected point for visual highlight (set immediately on tap)
  const [selectedPoint, setSelectedPoint] = useState<SessionDataPoint | null>(null);

  // Fullscreen state
  const [showFullscreen, setShowFullscreen] = useState(false);

  // Fetch data for selected metric
  const fetchData = useCallback(async () => {
    if (!exerciseId) return;
    setLoading(true);
    let fetchedData: SessionDataPoint[] = [];
    try {
      switch (selectedMetric) {
        case "maxWeight":
          fetchedData = await getMaxWeightPerSession(exerciseId);
          break;
        case "e1rm":
          fetchedData = await getEstimated1RMPerSession(exerciseId);
          break;
        case "totalVolume":
          fetchedData = await getTotalVolumePerSession(exerciseId);
          break;
        case "maxReps":
          fetchedData = await getMaxRepsPerSession(exerciseId);
          break;
        case "numSets":
          fetchedData = await getNumberOfSetsPerSession(exerciseId);
          break;
      }
      setAllData(fetchedData);
    } catch (error) {
      console.error("Error fetching chart data:", error);
      setAllData([]);
    } finally {
      setLoading(false);
    }
  }, [exerciseId, selectedMetric]);

  // Trend line data
  const [trendLineData, setTrendLineData] = useState<SessionDataPoint[]>([]);

  // Filter data when date range changes
  useEffect(() => {
    const filtered = filterByDateRange(allData, dateRange);
    // Sort chronologically for chart (canonical ordering)
    const sorted = [...filtered].sort((a, b) => a.date - b.date);
    setFilteredData(sorted);
    // Compute trend line (5-session moving average)
    setTrendLineData(computeTrendLine(sorted, 5));
    
    // Dev-only logging for debugging point/date alignment
    if (__DEV__ && sorted.length > 0) {
      console.log('[VisualisationTab] First 5 visible points:',
        sorted.slice(0, 5).map((p, i) => ({
          index: i,
          date: new Date(p.date).toLocaleDateString(),
          workoutId: p.workoutId,
        }))
      );
    }
  }, [allData, dateRange]);

  // Fetch data on mount and metric change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle data point press - fetch details BEFORE opening modal
  const handleDataPointPress = useCallback(
    async (point: SessionDataPoint) => {
      if (!exerciseId) {
        if (__DEV__) console.warn("[VisualisationTab] handleDataPointPress: no exerciseId from params");
        return;
      }
      
      if (__DEV__) {
        console.log("[VisualisationTab] handleDataPointPress called:", {
          exerciseId,
          workoutId: point.workoutId,
          pointDate: new Date(point.date).toLocaleDateString(),
          pointValue: point.value,
        });
      }
      
      // Set selected point immediately for visual feedback (highlight ring)
      setSelectedPoint(point);
      
      try {
        const details = await getSessionDetails(exerciseId, point.workoutId);
        
        if (__DEV__) {
          console.log("[VisualisationTab] getSessionDetails result:", {
            exerciseId,
            workoutId: point.workoutId,
            hasDetails: !!details,
            setsCount: details?.sets?.length ?? 0,
            totalSets: details?.totalSets ?? 0,
            totalVolume: details?.totalVolume ?? 0,
            estimatedE1RM: details?.estimatedE1RM ?? null,
          });
        }
        
        if (!details) {
          if (__DEV__) console.warn("[VisualisationTab] getSessionDetails returned null - no sets found for exerciseId:", exerciseId, "workoutId:", point.workoutId);
          setSelectedPoint(null); // Clear highlight since we can't show modal
          return; // Do NOT open modal if no details
        }
        
        // Extra validation: ensure we have actual sets data
        if (!details.sets || details.sets.length === 0) {
          if (__DEV__) console.warn("[VisualisationTab] SessionDetails has empty sets array - not opening modal");
          setSelectedPoint(null);
          return;
        }
        
        // Only show modal when we have valid details with sets
        setSelectedSessionDetails(details);
        setShowDataPointModal(true);
      } catch (error) {
        if (__DEV__) console.error("[VisualisationTab] Error fetching session details:", error);
        setSelectedPoint(null); // Clear highlight on error
      }
    },
    [exerciseId]
  );

  const selectedMetricLabel = metricOptions.find((opt) => opt.value === selectedMetric)?.label || "Select Metric";
  const unit = getMetricUnit(selectedMetric);
  const hasData = filteredData.length > 0;

  // Calculate stats
  const maxValue = hasData ? Math.max(...filteredData.map((d) => d.value)) : 0;

  return (
    <View style={[styles.container, { backgroundColor: rawColors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Metric Selector */}
        <View style={styles.metricSelector}>
          <Text style={[styles.label, { color: rawColors.foregroundSecondary }]}>Metric</Text>
          <Pressable
            style={[
              styles.metricButton,
              { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.border },
            ]}
            onPress={() => setShowMetricPicker(true)}
          >
            <Text style={[styles.metricButtonText, { color: rawColors.foreground }]}>{selectedMetricLabel}</Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color={rawColors.foregroundSecondary} />
          </Pressable>
        </View>

        {/* Date Range Selector */}
        <View style={styles.dateRangeSection}>
          <Text style={[styles.label, { color: rawColors.foregroundSecondary }]}>Date Range</Text>
          <DateRangeSelector value={dateRange} onChange={setDateRange} />
        </View>

        {/* Chart Section */}
        {loading ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: rawColors.foregroundSecondary }]}>Loading...</Text>
          </View>
        ) : !hasData ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="chart-line" size={64} color={rawColors.foregroundMuted} />
            <Text style={[styles.emptyText, { color: rawColors.foreground }]}>No data available</Text>
            <Text style={[styles.emptySubtext, { color: rawColors.foregroundSecondary }]}>
              {allData.length > 0
                ? "No data in selected date range. Try a different range."
                : "Record some sets to see your progress"}
            </Text>
          </View>
        ) : (
          <>
            {/* Chart Title */}
            <Text style={[styles.chartTitle, { color: rawColors.foreground }]}>
              {selectedMetricLabel}
            </Text>

            {/* Interactive Chart */}
            <AnalyticsChart
              data={filteredData}
              trendLineData={trendLineData}
              height={280}
              unit={unit}
              onDataPointPress={handleDataPointPress}
              onFullscreenPress={() => setShowFullscreen(true)}
              onGestureStart={handleGestureStart}
              onGestureEnd={handleGestureEnd}
              selectedPoint={selectedPoint}
            />

            {/* Stats Summary */}
            <View style={styles.statsContainer}>
              <View style={[styles.statBox, { backgroundColor: rawColors.surfaceSecondary }]}>
                <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>Latest</Text>
                <Text style={[styles.statValue, { color: rawColors.foreground }]}>
                  {filteredData[filteredData.length - 1]?.value.toFixed(1)} {unit}
                </Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: rawColors.surfaceSecondary }]}>
                <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>Best</Text>
                <Text style={[styles.statValue, { color: rawColors.primary }]}>
                  {maxValue.toFixed(1)} {unit}
                </Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: rawColors.surfaceSecondary }]}>
                <Text style={[styles.statLabel, { color: rawColors.foregroundSecondary }]}>Sessions</Text>
                <Text style={[styles.statValue, { color: rawColors.foreground }]}>{filteredData.length}</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Metric Picker Modal */}
      <Modal visible={showMetricPicker} transparent animationType="fade" onRequestClose={() => setShowMetricPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowMetricPicker(false)}>
          <View style={[styles.pickerContainer, { backgroundColor: rawColors.surface }]}>
            <Text style={[styles.pickerTitle, { color: rawColors.foreground }]}>Select Metric</Text>
            {metricOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.pickerOption,
                  { borderBottomColor: rawColors.border },
                  selectedMetric === option.value && { backgroundColor: rawColors.primaryLight },
                ]}
                onPress={() => {
                  setSelectedMetric(option.value);
                  setShowMetricPicker(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    { color: rawColors.foreground },
                    selectedMetric === option.value && { color: rawColors.primary, fontWeight: "600" },
                  ]}
                >
                  {option.label}
                </Text>
                {selectedMetric === option.value && (
                  <MaterialCommunityIcons name="check" size={20} color={rawColors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Data Point Details Modal */}
      <DataPointModal
        visible={showDataPointModal}
        onClose={() => {
          setShowDataPointModal(false);
          setSelectedSessionDetails(null);
          setSelectedPoint(null); // Clear highlight when closing modal
        }}
        sessionDetails={selectedSessionDetails}
        exerciseName={exerciseName}
        exerciseId={exerciseId}
        onDeleted={fetchData}
      />

      {/* Fullscreen Chart Modal */}
      <FullscreenChart
        visible={showFullscreen}
        onClose={() => setShowFullscreen(false)}
        data={filteredData}
        trendLineData={trendLineData}
        title={`${exerciseName} - ${selectedMetricLabel}`}
        unit={unit}
        onDataPointPress={handleDataPointPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  metricSelector: {
    marginBottom: 16,
  },
  dateRangeSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  metricButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metricButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    minHeight: 300,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  statsContainer: {
    flexDirection: "row",
    marginTop: 16,
    gap: 10,
  },
  statBox: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  pickerContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    paddingBottom: 12,
    marginBottom: 8,
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  pickerOptionText: {
    fontSize: 16,
  },
});
