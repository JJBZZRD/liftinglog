import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useContext, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
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
  getSessionDetailsByWorkoutExerciseId,
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

type VisualisationTabProps = {
  refreshKey?: number;
};

export default function VisualisationTab({ refreshKey }: VisualisationTabProps) {
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
          date: new Date(p.date).toLocaleDateString("en-US", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          workoutExerciseId: p.workoutExerciseId,
          workoutId: p.workoutId,
        }))
      );
    }
  }, [allData, dateRange]);

  // Fetch data on mount and metric change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (refreshKey !== undefined) {
      fetchData();
    }
  }, [refreshKey, fetchData]);

  // Reload when tab comes into focus (e.g., after recording sets)
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

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
          workoutExerciseId: point.workoutExerciseId,
          workoutId: point.workoutId,
          pointDate: new Date(point.date).toLocaleDateString("en-US", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          pointValue: point.value,
        });
      }
      
      // Set selected point immediately for visual feedback (highlight ring)
      setSelectedPoint(point);
      
      try {
        const details =
          point.workoutExerciseId !== null
            ? await getSessionDetailsByWorkoutExerciseId(point.workoutExerciseId)
            : await getSessionDetails(exerciseId, point.workoutId);
        
        if (__DEV__) {
          console.log("[VisualisationTab] getSessionDetails result:", {
            exerciseId,
            workoutExerciseId: point.workoutExerciseId,
            workoutId: point.workoutId,
            hasDetails: !!details,
            setsCount: details?.sets?.length ?? 0,
            totalSets: details?.totalSets ?? 0,
            totalVolume: details?.totalVolume ?? 0,
            estimatedE1RM: details?.estimatedE1RM ?? null,
          });
        }
        
        if (!details) {
          if (__DEV__) {
            console.warn(
              "[VisualisationTab] getSessionDetails returned null - no sets found for session:",
              { exerciseId, workoutExerciseId: point.workoutExerciseId, workoutId: point.workoutId }
            );
          }
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
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Controls Card - Metric & Date Range */}
        <View
          className="rounded-2xl p-5 mb-4 bg-surface"
          style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
        >
          {/* Metric Selector */}
          <View className="mb-4">
            <Text className="text-sm font-medium mb-2 text-foreground-secondary">Metric</Text>
            <Pressable
              className="flex-row items-center justify-between border border-border rounded-xl px-4 py-3 bg-surface-secondary"
              onPress={() => setShowMetricPicker(true)}
            >
              <Text className="text-base font-medium text-foreground">{selectedMetricLabel}</Text>
              <MaterialCommunityIcons name="chevron-down" size={20} color={rawColors.foregroundSecondary} />
            </Pressable>
          </View>

          {/* Date Range Selector */}
          <View>
            <Text className="text-sm font-medium mb-2 text-foreground-secondary">Date Range</Text>
            <DateRangeSelector value={dateRange} onChange={setDateRange} />
          </View>
        </View>

        {/* Chart Card */}
        <View
          className="rounded-2xl mb-4 bg-surface overflow-hidden"
          style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
        >
          {loading ? (
            <View className="items-center justify-center py-16">
              <MaterialCommunityIcons name="loading" size={32} color={rawColors.foregroundMuted} />
              <Text className="text-base mt-3 text-foreground-secondary">Loading...</Text>
            </View>
          ) : !hasData ? (
            <View className="items-center justify-center py-12">
              <View className="w-20 h-20 rounded-full items-center justify-center mb-4 bg-surface-secondary">
                <MaterialCommunityIcons name="chart-line" size={40} color={rawColors.foregroundMuted} />
              </View>
              <Text className="text-lg font-semibold text-foreground">No data available</Text>
              <Text className="text-sm text-center mt-2 px-4 text-foreground-secondary">
                {allData.length > 0
                  ? "No data in selected date range. Try a different range."
                  : "Record some sets to see your progress"}
              </Text>
            </View>
          ) : (
            <>
              {/* Chart Header */}
              <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
                <Text className="text-lg font-semibold text-foreground">{selectedMetricLabel}</Text>
                <View className="flex-row items-center px-3 py-1.5 rounded-full bg-surface-secondary">
                  <MaterialCommunityIcons name="chart-timeline-variant" size={14} color={rawColors.foregroundSecondary} />
                  <Text className="text-sm font-medium ml-1.5 text-foreground-secondary">{filteredData.length} sessions</Text>
                </View>
              </View>

              {/* Interactive Chart - full width within card */}
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
            </>
          )}
        </View>

        {/* Stats Card */}
        {hasData && !loading && (
          <View
            className="rounded-2xl p-5 bg-surface"
            style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
          >
            <Text className="text-lg font-semibold mb-4 text-foreground">Summary</Text>
            <View className="flex-row gap-3">
              <View className="flex-1 items-center py-3 px-2 rounded-xl bg-surface-secondary">
                <Text className="text-xs font-medium mb-1 text-foreground-secondary">Latest</Text>
                <Text className="text-base font-bold text-foreground">
                  {filteredData[filteredData.length - 1]?.value.toFixed(1)}
                </Text>
                <Text className="text-xs text-foreground-muted">{unit}</Text>
              </View>
              <View 
                className="flex-1 items-center py-3 px-2 rounded-xl border-2 border-primary bg-primary-light"
              >
                <View className="flex-row items-center mb-1">
                  <MaterialCommunityIcons name="trophy" size={12} color={rawColors.primary} />
                  <Text className="text-xs font-medium ml-1 text-primary">Best</Text>
                </View>
                <Text className="text-base font-bold text-primary">
                  {maxValue.toFixed(1)}
                </Text>
                <Text className="text-xs text-primary">{unit}</Text>
              </View>
              <View className="flex-1 items-center py-3 px-2 rounded-xl bg-surface-secondary">
                <Text className="text-xs font-medium mb-1 text-foreground-secondary">Sessions</Text>
                <Text className="text-base font-bold text-foreground">
                  {filteredData.length}
                </Text>
                <Text className="text-xs text-foreground-muted">total</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Metric Picker Modal */}
      <Modal visible={showMetricPicker} transparent animationType="fade" onRequestClose={() => setShowMetricPicker(false)}>
        <Pressable 
          className="flex-1 justify-end"
          style={{ backgroundColor: rawColors.overlay }}
          onPress={() => setShowMetricPicker(false)}
        >
          <View 
            className="rounded-t-3xl pt-4 pb-8 bg-surface"
            style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 }}
          >
            <View className="w-10 h-1 rounded-full mx-auto mb-4 bg-border" />
            <Text className="text-lg font-semibold text-center mb-4 text-foreground">Select Metric</Text>
            {metricOptions.map((option, index) => (
              <Pressable
                key={option.value}
                className={`flex-row items-center justify-between py-4 px-5 ${
                  index < metricOptions.length - 1 ? "border-b border-border-light" : ""
                } ${selectedMetric === option.value ? "bg-primary-light" : ""}`}
                onPress={() => {
                  setSelectedMetric(option.value);
                  setShowMetricPicker(false);
                }}
              >
                <Text
                  className={`text-base ${
                    selectedMetric === option.value ? "font-semibold text-primary" : "text-foreground"
                  }`}
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
