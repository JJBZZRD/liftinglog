import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, type ViewStyle } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
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
  buildExerciseAnalyticsChartOverlays,
  getExerciseAnalyticsDataset,
  getAvailableExerciseAnalyticsOverlays,
  getMetricDataPoints,
  getSessionDetails,
  getSessionDetailsByWorkoutExerciseId,
  type ExerciseAnalyticsChartOverlay,
  type ExerciseAnalyticsDataset,
  type ExerciseAnalyticsMetricType,
  type ExerciseAnalyticsOverview,
  type ExerciseAnalyticsOverlayAvailability,
  type ExerciseAnalyticsOverlayType,
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

const overlayOptions: { label: string; value: ExerciseAnalyticsOverlayType }[] = [
  { label: "Trend", value: "trendLine" },
  { label: "EWMA", value: "ewma" },
  { label: "Robust Trend", value: "robustTrend" },
  { label: "PB Markers", value: "pbMarkers" },
  { label: "Plateau Zones", value: "plateauZones" },
  { label: "Weekly Band", value: "weeklyBand" },
  { label: "Outliers", value: "outliers" },
  { label: "Rep Buckets", value: "repBuckets" },
];

const defaultOverlaySelection: ExerciseAnalyticsOverlayType[] = ["trendLine", "pbMarkers"];

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

function shouldConvertWeightMetric(metric: ExerciseAnalyticsMetricType): boolean {
  return metric === "maxWeight" || metric === "e1rm" || metric === "totalVolume";
}

function convertOverlayForDisplay(
  overlay: ExerciseAnalyticsChartOverlay,
  convertWeightValues: boolean,
  unitPreference: "kg" | "lb"
): ExerciseAnalyticsChartOverlay {
  if (!convertWeightValues) {
    return overlay;
  }

  switch (overlay.kind) {
    case "line":
      return {
        ...overlay,
        points: overlay.points.map((point) => ({
          ...point,
          value: convertWeightFromKg(point.value, unitPreference),
        })),
      };
    case "band":
      return {
        ...overlay,
        points: overlay.points.map((point) => ({
          ...point,
          center: convertWeightFromKg(point.center, unitPreference),
          lower: convertWeightFromKg(point.lower, unitPreference),
          upper: convertWeightFromKg(point.upper, unitPreference),
        })),
      };
    case "marker":
      return {
        ...overlay,
        points: overlay.points.map((point) => ({
          ...point,
          value: convertWeightFromKg(point.value, unitPreference),
        })),
      };
    case "zone":
    default:
      return overlay;
  }
}

function areOverlaySelectionsEqual(
  left: ExerciseAnalyticsOverlayType[],
  right: ExerciseAnalyticsOverlayType[]
): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function formatSelectedOverlaySummary(selectedOverlays: ExerciseAnalyticsOverlayType[]): string {
  if (selectedOverlays.length === 0) {
    return "No active overlays";
  }

  const labels = selectedOverlays
    .map(
      (overlayType) => overlayOptions.find((option) => option.value === overlayType)?.label ?? overlayType
    )
    .slice(0, 2);
  const suffix =
    selectedOverlays.length > 2 ? ` +${selectedOverlays.length - 2} more` : "";

  return `${selectedOverlays.length} active • ${labels.join(", ")}${suffix}`;
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
  const [selectedOverlays, setSelectedOverlays] =
    useState<ExerciseAnalyticsOverlayType[]>(defaultOverlaySelection);
  const [showOverlayControls, setShowOverlayControls] = useState(false);
  const [dataset, setDataset] = useState<ExerciseAnalyticsDataset | null>(null);
  const [overview, setOverview] = useState<ExerciseAnalyticsOverview | null>(null);
  const [allData, setAllData] = useState<SessionDataPoint[]>([]);
  const [filteredData, setFilteredData] = useState<SessionDataPoint[]>([]);
  const [chartOverlays, setChartOverlays] = useState<ExerciseAnalyticsChartOverlay[]>([]);
  const [overlayAvailability, setOverlayAvailability] = useState<ExerciseAnalyticsOverlayAvailability[]>(
    []
  );
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
  const overlayChevronRotation = useSharedValue(0);
  const overlayRevealProgress = useSharedValue(0);

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
    overlayChevronRotation.value = withTiming(showOverlayControls ? 180 : 0, {
      duration: 220,
    });
    overlayRevealProgress.value = withTiming(showOverlayControls ? 1 : 0, {
      duration: 220,
    });
  }, [overlayChevronRotation, overlayRevealProgress, showOverlayControls]);

  useEffect(() => {
    if (!dataset) {
      setAllData([]);
      setFilteredData([]);
      setChartOverlays([]);
      setOverlayAvailability([]);
      setOverview(null);
      return;
    }

    const metricPoints = getMetricDataPoints(dataset, selectedMetric, { setScope });
    const visibleMetricPoints = getMetricDataPoints(dataset, selectedMetric, {
      dateRange,
      setScope,
    });
    const shouldConvertMetric = shouldConvertWeightMetric(selectedMetric);
    const sortedVisiblePoints = [...visibleMetricPoints].sort((a, b) => a.date - b.date);
    const displayData = shouldConvertMetric
      ? sortedVisiblePoints.map((point) => ({
          ...point,
          value: convertWeightFromKg(point.value, unitPreference),
        }))
      : sortedVisiblePoints;
    const availableOverlays = getAvailableExerciseAnalyticsOverlays(dataset, selectedMetric, {
      dateRange,
      setScope,
    });
    const enabledOverlayTypes = new Set(
      availableOverlays.filter((overlay) => overlay.enabled).map((overlay) => overlay.type)
    );
    const nextSelectedOverlays = selectedOverlays.filter((overlayType) =>
      enabledOverlayTypes.has(overlayType)
    );
    const overlaySelectionToRender =
      nextSelectedOverlays.length > 0 ? nextSelectedOverlays : selectedOverlays;
    const nextChartOverlays = buildExerciseAnalyticsChartOverlays(dataset, selectedMetric, {
      dateRange,
      setScope,
      selectedOverlays: overlaySelectionToRender,
    }).map((overlay) => convertOverlayForDisplay(overlay, shouldConvertMetric, unitPreference));

    setAllData(metricPoints);
    setFilteredData(displayData);
    setOverlayAvailability(availableOverlays);
    setChartOverlays(nextChartOverlays);
    setOverview(
      buildExerciseAnalyticsOverview(dataset, selectedMetric, {
        dateRange,
        setScope,
      })
    );

    if (!areOverlaySelectionsEqual(selectedOverlays, nextSelectedOverlays)) {
      setSelectedOverlays(nextSelectedOverlays);
    }

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
  }, [dataset, selectedMetric, setScope, dateRange, selectedOverlays, unitPreference]);

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
  const overlayAvailabilityByType = useMemo(
    () => new Map(overlayAvailability.map((availability) => [availability.type, availability])),
    [overlayAvailability]
  );
  const overlaySummary = useMemo(
    () => formatSelectedOverlaySummary(selectedOverlays),
    [selectedOverlays]
  );
  const overlayChevronStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ rotate: `${overlayChevronRotation.value}deg` }],
  }));
  const overlayPanelStyle = useAnimatedStyle<ViewStyle>(() => ({
    opacity: overlayRevealProgress.value,
    transform: [
      { translateY: (1 - overlayRevealProgress.value) * -8 },
      { scale: 0.98 + overlayRevealProgress.value * 0.02 },
    ] as const,
  }));

  const handleOverlayToggle = useCallback(
    (overlayType: ExerciseAnalyticsOverlayType) => {
      const availability = overlayAvailabilityByType.get(overlayType);
      if (!availability?.enabled) return;

      setSelectedOverlays((current) => {
        if (current.includes(overlayType)) {
          return current.filter((type) => type !== overlayType);
        }

        const next = [...current, overlayType];
        if (next.length <= 3) {
          return next;
        }

        const removableOverlay = next.find(
          (type) =>
            !defaultOverlaySelection.includes(type) &&
            type !== overlayType
        );

        if (!removableOverlay) {
          return next.filter((type) => type !== overlayType);
        }

        return next.filter((type) => type !== removableOverlay);
      });
    },
    [overlayAvailabilityByType]
  );

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
              testID="analytics-metric-picker-trigger"
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

          <View className="mt-4">
            <Pressable
              testID="analytics-overlay-toggle"
              className="flex-row items-center justify-between border border-border rounded-xl px-4 py-3 bg-surface-secondary"
              onPress={() => setShowOverlayControls((current) => !current)}
            >
              <View className="flex-1 pr-3">
                <Text className="text-sm font-medium text-foreground-secondary">Overlays</Text>
                <Text className="text-xs mt-1 text-foreground-muted">{overlaySummary}</Text>
              </View>

              <View className="flex-row items-center">
                <View className="rounded-full px-2.5 py-1 bg-primary-light">
                  <Text className="text-xs font-semibold text-primary">
                    {selectedOverlays.length}
                  </Text>
                </View>
                <Animated.View style={overlayChevronStyle} className="ml-3">
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={20}
                    color={rawColors.foregroundSecondary}
                  />
                </Animated.View>
              </View>
            </Pressable>

            <Animated.View layout={LinearTransition.duration(220)}>
              {showOverlayControls ? (
                <Animated.View
                  testID="analytics-overlay-content"
                  className="mt-3"
                  style={overlayPanelStyle}
                  entering={FadeInDown.duration(220)}
                  exiting={FadeOutUp.duration(160)}
                >
                  <View className="flex-row flex-wrap gap-2">
                    {overlayOptions.map((option, index) => {
                      const availability = overlayAvailabilityByType.get(option.value);
                      const isEnabled = availability?.enabled ?? false;
                      const isSelected = isEnabled && selectedOverlays.includes(option.value);

                      return (
                        <Animated.View
                          key={option.value}
                          layout={LinearTransition.duration(180)}
                          entering={FadeInDown.duration(220).delay(40 + index * 35)}
                          exiting={FadeOutUp.duration(120)}
                        >
                          <Pressable
                            testID={`analytics-overlay-chip-${option.value}`}
                            className={`rounded-2xl border px-3 py-2 ${
                              isSelected
                                ? "bg-primary-light border-primary"
                                : "bg-surface-secondary border-border"
                            }`}
                            style={{ opacity: isEnabled ? 1 : 0.6 }}
                            onPress={() => handleOverlayToggle(option.value)}
                          >
                            <Text
                              className={`text-sm font-semibold ${
                                isSelected ? "text-primary" : "text-foreground-secondary"
                              }`}
                            >
                              {option.label}
                            </Text>
                            {!isEnabled && availability?.reason ? (
                              <Text className="text-[11px] mt-1 text-foreground-muted">
                                {availability.reason}
                              </Text>
                            ) : null}
                          </Pressable>
                        </Animated.View>
                      );
                    })}
                  </View>
                </Animated.View>
              ) : null}
            </Animated.View>
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
                overlays={chartOverlays}
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
                testID={`analytics-metric-option-${option.value}`}
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
        overlays={chartOverlays}
        title={`${exerciseName} - ${selectedMetricLabel}`}
        unit={unit}
        onDataPointPress={handleDataPointPress}
      />
    </View>
  );
}
