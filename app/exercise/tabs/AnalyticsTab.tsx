import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useContext, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import AnalyticsChart from "../../../components/charts/AnalyticsChart";
import AnalyticsInsightsDeck from "../../../components/charts/AnalyticsInsightsDeck";
import DataPointModal from "../../../components/charts/DataPointModal";
import DateRangeSelector, {
  getDefaultDateRange,
  type DateRange,
} from "../../../components/charts/DateRangeSelector";
import FullscreenChart from "../../../components/charts/FullscreenChart";
import { TabSwipeContext } from "../../../lib/contexts/TabSwipeContext";
import { useUnitPreference } from "../../../lib/contexts/UnitPreferenceContext";
import { useTheme } from "../../../lib/theme/ThemeContext";
import {
  buildExerciseAnalyticsOverview,
  computeTrendLine,
  getCurrentPRSessionKeysFromDataset,
  getExerciseAnalyticsDataset,
  getMetricDataPoints,
  getSessionDetails,
  getSessionDetailsByWorkoutExerciseId,
  type ExerciseAnalyticsDataset,
  type ExerciseAnalyticsMetricType,
  type ExerciseAnalyticsOverview,
  type ExerciseAnalyticsSetScope,
  type SessionDataPoint,
  type SessionDetails,
} from "../../../lib/utils/analytics";
import { convertWeightFromKg } from "../../../lib/utils/units";

const metricOptions: { label: string; value: ExerciseAnalyticsMetricType }[] = [
  { label: "Max Weight Per Session", value: "maxWeight" },
  { label: "Estimated 1RM", value: "e1rm" },
  { label: "Total Volume", value: "totalVolume" },
  { label: "Max Reps", value: "maxReps" },
  { label: "Number of Sets", value: "numSets" },
];

const setScopeOptions: { label: string; value: ExerciseAnalyticsSetScope }[] = [
  { label: "All Sets", value: "all" },
  { label: "Work Sets", value: "work" },
];

function getMetricUnit(metric: ExerciseAnalyticsMetricType, weightUnit: "kg" | "lb"): string {
  switch (metric) {
    case "maxWeight":
    case "e1rm":
    case "totalVolume":
      return weightUnit;
    case "maxReps":
      return "reps";
    case "numSets":
      return "sets";
    default:
      return "";
  }
}

type AnalyticsTabProps = {
  refreshKey?: number;
};

export default function AnalyticsTab({ refreshKey }: AnalyticsTabProps) {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const exerciseId = typeof params.id === "string" ? parseInt(params.id, 10) : null;
  const exerciseName = typeof params.name === "string" ? params.name : "Exercise";
  const { setSwipeEnabled } = useContext(TabSwipeContext);

  const [selectedMetric, setSelectedMetric] = useState<ExerciseAnalyticsMetricType>("maxWeight");
  const [setScope, setSetScope] = useState<ExerciseAnalyticsSetScope>("all");
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [dataset, setDataset] = useState<ExerciseAnalyticsDataset | null>(null);
  const [overview, setOverview] = useState<ExerciseAnalyticsOverview | null>(null);
  const [allData, setAllData] = useState<SessionDataPoint[]>([]);
  const [filteredData, setFilteredData] = useState<SessionDataPoint[]>([]);
  const [trendLineData, setTrendLineData] = useState<SessionDataPoint[]>([]);
  const [prSessionKeys, setPrSessionKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showMetricPicker, setShowMetricPicker] = useState(false);
  const [showDataPointModal, setShowDataPointModal] = useState(false);
  const [selectedSessionDetails, setSelectedSessionDetails] = useState<SessionDetails | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<SessionDataPoint | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);

  const handleGestureStart = useCallback(() => {
    setSwipeEnabled(false);
  }, [setSwipeEnabled]);

  const handleGestureEnd = useCallback(() => {
    setSwipeEnabled(true);
  }, [setSwipeEnabled]);

  const fetchDataset = useCallback(async () => {
    if (!exerciseId) {
      setDataset(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const nextDataset = await getExerciseAnalyticsDataset(exerciseId);
      setDataset(nextDataset);
    } catch (error) {
      console.error("Error fetching analytics data:", error);
      setDataset(null);
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  useEffect(() => {
    fetchDataset();
  }, [fetchDataset]);

  useEffect(() => {
    if (refreshKey !== undefined) {
      fetchDataset();
    }
  }, [refreshKey, fetchDataset]);

  useFocusEffect(
    useCallback(() => {
      fetchDataset();
    }, [fetchDataset])
  );

  useEffect(() => {
    setSelectedPoint(null);
  }, [selectedMetric, setScope, dateRange]);

  useEffect(() => {
    if (!dataset) {
      setAllData([]);
      setFilteredData([]);
      setTrendLineData([]);
      setPrSessionKeys(new Set());
      setOverview(null);
      return;
    }

    const metricPoints = getMetricDataPoints(dataset, selectedMetric, { setScope });
    const visibleMetricPoints = getMetricDataPoints(dataset, selectedMetric, {
      dateRange,
      setScope,
    });
    const shouldConvertWeightMetric =
      selectedMetric === "maxWeight" || selectedMetric === "e1rm" || selectedMetric === "totalVolume";
    const sortedVisiblePoints = [...visibleMetricPoints].sort((a, b) => a.date - b.date);
    const displayData = shouldConvertWeightMetric
      ? sortedVisiblePoints.map((point) => ({
          ...point,
          value: convertWeightFromKg(point.value, unitPreference),
        }))
      : sortedVisiblePoints;

    setAllData(metricPoints);
    setFilteredData(displayData);
    setTrendLineData(computeTrendLine(displayData, 5));
    setPrSessionKeys(getCurrentPRSessionKeysFromDataset(dataset, setScope));
    setOverview(
      buildExerciseAnalyticsOverview(dataset, selectedMetric, {
        dateRange,
        setScope,
      })
    );

    if (__DEV__ && displayData.length > 0) {
      console.log(
        "[AnalyticsTab] First 5 visible points:",
        displayData.slice(0, 5).map((point, index) => ({
          index,
          date: new Date(point.date).toLocaleDateString("en-US", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
          workoutExerciseId: point.workoutExerciseId,
          workoutId: point.workoutId,
        }))
      );
    }
  }, [dataset, selectedMetric, setScope, dateRange, unitPreference]);

  const handleDataPointPress = useCallback(
    async (point: SessionDataPoint) => {
      if (!exerciseId) {
        if (__DEV__) console.warn("[AnalyticsTab] handleDataPointPress: no exerciseId from params");
        return;
      }

      setSelectedPoint(point);

      try {
        const details =
          point.workoutExerciseId !== null
            ? await getSessionDetailsByWorkoutExerciseId(point.workoutExerciseId)
            : await getSessionDetails(exerciseId, point.workoutId);

        if (!details || !details.sets || details.sets.length === 0) {
          setSelectedPoint(null);
          return;
        }

        setSelectedSessionDetails(details);
        setShowDataPointModal(true);
      } catch (error) {
        if (__DEV__) console.error("[AnalyticsTab] Error fetching session details:", error);
        setSelectedPoint(null);
      }
    },
    [exerciseId]
  );

  const selectedMetricLabel =
    metricOptions.find((option) => option.value === selectedMetric)?.label ?? "Select Metric";
  const unit = getMetricUnit(selectedMetric, unitPreference);
  const hasVisibleData = filteredData.length > 0;
  const hasAnyData = allData.length > 0;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="rounded-2xl p-5 mb-4 bg-surface"
          style={{
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <View className="mb-4">
            <Text className="text-sm font-medium mb-2 text-foreground-secondary">Metric</Text>
            <Pressable
              className="flex-row items-center justify-between border border-border rounded-xl px-4 py-3 bg-surface-secondary"
              onPress={() => setShowMetricPicker(true)}
            >
              <Text className="text-base font-medium text-foreground">{selectedMetricLabel}</Text>
              <MaterialCommunityIcons
                name="chevron-down"
                size={20}
                color={rawColors.foregroundSecondary}
              />
            </Pressable>
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium mb-2 text-foreground-secondary">Set Scope</Text>
            <View className="flex-row gap-2">
              {setScopeOptions.map((option) => (
                <Pressable
                  key={option.value}
                  testID={`analytics-set-scope-${option.value}`}
                  className={`flex-1 items-center justify-center rounded-xl px-4 py-3 border ${
                    setScope === option.value ? "bg-primary-light border-primary" : "bg-surface-secondary border-border"
                  }`}
                  onPress={() => setSetScope(option.value)}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      setScope === option.value ? "text-primary" : "text-foreground-secondary"
                    }`}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View>
            <Text className="text-sm font-medium mb-2 text-foreground-secondary">Date Range</Text>
            <DateRangeSelector value={dateRange} onChange={setDateRange} />
          </View>
        </View>

        <View
          className="rounded-2xl mb-4 bg-surface overflow-hidden"
          style={{
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          {loading ? (
            <View className="items-center justify-center py-16">
              <MaterialCommunityIcons name="loading" size={32} color={rawColors.foregroundMuted} />
              <Text className="text-base mt-3 text-foreground-secondary">Loading...</Text>
            </View>
          ) : !hasVisibleData ? (
            <View className="items-center justify-center py-12">
              <View className="w-20 h-20 rounded-full items-center justify-center mb-4 bg-surface-secondary">
                <MaterialCommunityIcons name="chart-line" size={40} color={rawColors.foregroundMuted} />
              </View>
              <Text className="text-lg font-semibold text-foreground">No data available</Text>
              <Text className="text-sm text-center mt-2 px-4 text-foreground-secondary">
                {hasAnyData
                  ? "No data in selected date range. Try a different range."
                  : "Record some sets to see your progress"}
              </Text>
            </View>
          ) : (
            <>
              <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
                <Text className="text-lg font-semibold text-foreground">{selectedMetricLabel}</Text>
                <View className="flex-row items-center px-3 py-1.5 rounded-full bg-surface-secondary">
                  <MaterialCommunityIcons
                    name="chart-timeline-variant"
                    size={14}
                    color={rawColors.foregroundSecondary}
                  />
                  <Text className="text-sm font-medium ml-1.5 text-foreground-secondary">
                    {filteredData.length} sessions
                  </Text>
                </View>
              </View>

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
                prSessionKeys={prSessionKeys}
              />
            </>
          )}
        </View>

        {hasVisibleData && overview && !loading && (
          <AnalyticsInsightsDeck
            overview={overview}
            selectedMetric={selectedMetric}
            selectedMetricLabel={selectedMetricLabel}
            onGestureStart={handleGestureStart}
            onGestureEnd={handleGestureEnd}
          />
        )}
      </ScrollView>

      <Modal
        visible={showMetricPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMetricPicker(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: rawColors.overlay }}
          onPress={() => setShowMetricPicker(false)}
        >
          <View
            className="rounded-t-3xl pt-4 pb-8 bg-surface"
            style={{
              shadowColor: rawColors.shadow,
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <View className="w-10 h-1 rounded-full mx-auto mb-4 bg-border" />
            <Text className="text-lg font-semibold text-center mb-4 text-foreground">
              Select Metric
            </Text>
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

      <DataPointModal
        visible={showDataPointModal}
        onClose={() => {
          setShowDataPointModal(false);
          setSelectedSessionDetails(null);
          setSelectedPoint(null);
        }}
        sessionDetails={selectedSessionDetails}
        exerciseName={exerciseName}
        exerciseId={exerciseId}
        onDeleted={fetchDataset}
      />

      <FullscreenChart
        visible={showFullscreen}
        onClose={() => setShowFullscreen(false)}
        data={filteredData}
        trendLineData={trendLineData}
        title={`${exerciseName} - ${selectedMetricLabel}`}
        unit={unit}
        onDataPointPress={handleDataPointPress}
        prSessionKeys={prSessionKeys}
      />
    </View>
  );
}
