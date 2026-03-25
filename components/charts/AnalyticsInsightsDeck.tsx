import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState, type ComponentProps } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import { useTheme } from "../../lib/theme/ThemeContext";
import type {
  EstimatedRepMaxEntry,
  ExerciseAnalyticsMetricType,
  ExerciseAnalyticsOverview,
} from "../../lib/utils/analytics";
import {
  formatVolumeFromKg,
  formatWeightFromKg,
  getWeightUnitLabel,
} from "../../lib/utils/units";

const CARD_GAP = 12;
const CARD_PEEK = 16;

type AnalyticsInsightsDeckProps = {
  overview: ExerciseAnalyticsOverview;
  selectedMetric: ExerciseAnalyticsMetricType;
  selectedMetricLabel: string;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
};

type InsightCardId =
  | "snapshot"
  | "progress"
  | "prs"
  | "consistency"
  | "rep-profile"
  | "estimated-rep-maxes";

function formatShortDate(timestamp: number | null): string {
  if (timestamp === null) return "--";
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatMetricUnit(
  metric: ExerciseAnalyticsMetricType,
  weightUnit: "kg" | "lb"
): string {
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

function formatMetricValue(
  metric: ExerciseAnalyticsMetricType,
  value: number | null,
  unitPreference: "kg" | "lb",
  options: { withUnit?: boolean } = {}
): string {
  if (value === null) return "--";
  const { withUnit = false } = options;

  switch (metric) {
    case "maxWeight":
    case "e1rm":
      return formatWeightFromKg(value, unitPreference, {
        withUnit,
        maximumFractionDigits: 0,
      });
    case "totalVolume":
      return formatVolumeFromKg(value, unitPreference, {
        withUnit,
        abbreviate: true,
        maximumFractionDigits: 0,
      });
    case "maxReps":
    case "numSets":
      return withUnit ? `${Math.round(value)} ${formatMetricUnit(metric, unitPreference)}` : `${Math.round(value)}`;
    default:
      return "--";
  }
}

function formatSignedMetricValue(
  metric: ExerciseAnalyticsMetricType,
  value: number | null,
  unitPreference: "kg" | "lb",
  options: { withUnit?: boolean } = {}
): string {
  if (value === null) return "--";
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${formatMetricValue(metric, Math.abs(value), unitPreference, options)}`;
}

function formatMetricPerSession(
  metric: ExerciseAnalyticsMetricType,
  value: number | null,
  unitPreference: "kg" | "lb"
): string {
  if (value === null) return "--";
  return `${formatSignedMetricValue(metric, value, unitPreference, { withUnit: true })} / session`;
}

function formatScorePercent(score: number | null): string {
  if (score === null) return "--";
  return `${Math.round(score * 100)}%`;
}

function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getFormulaLabel(formulaId: ExerciseAnalyticsOverview["estimatedRepMaxes"]["formulaId"]): string {
  switch (formulaId) {
    case "epley":
      return "Epley";
    case "brzycki":
      return "Brzycki";
    case "oconner":
      return "O'Conner";
    case "lombardi":
      return "Lombardi";
    case "mayhew":
      return "Mayhew";
    case "wathan":
      return "Wathan";
    default:
      return formulaId;
  }
}

function getTrendTone(status: ExerciseAnalyticsOverview["progress"]["trendStatus"]) {
  type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

  switch (status) {
    case "improving":
      return {
        icon: "trending-up" as IconName,
        label: "Improving",
        colorClass: "text-primary" as const,
      };
    case "slipping":
      return {
        icon: "trending-down" as IconName,
        label: "Slipping",
        colorClass: "text-destructive" as const,
      };
    case "flat":
      return {
        icon: "minus" as IconName,
        label: "Flat",
        colorClass: "text-foreground-secondary" as const,
      };
    default:
      return {
        icon: "progress-question" as IconName,
        label: "Not enough data",
        colorClass: "text-foreground-secondary" as const,
      };
  }
}

function ProjectionTile({
  entry,
  sourceReps,
}: {
  entry: EstimatedRepMaxEntry;
  sourceReps: number | null;
}) {
  const { unitPreference } = useUnitPreference();
  const { rawColors } = useTheme();
  const isMuted = sourceReps === null ? false : entry.isMuted;

  return (
    <View
      className="flex-1 rounded-xl px-3 py-3 border"
      style={{
        backgroundColor: isMuted ? rawColors.surfaceSecondary : rawColors.primaryLight,
        borderColor: isMuted ? rawColors.border : rawColors.primary,
        opacity: isMuted ? 0.75 : 1,
      }}
    >
      <Text className="text-xs font-semibold text-foreground-secondary" selectable>
        {entry.targetReps}RM
      </Text>
      <Text
        className={`text-lg font-bold mt-1 ${isMuted ? "text-foreground" : "text-primary"}`}
        selectable
      >
        {entry.projectedWeightKg === null
          ? "--"
          : formatWeightFromKg(entry.projectedWeightKg, unitPreference, {
              withUnit: true,
              maximumFractionDigits: 0,
            })}
      </Text>
    </View>
  );
}

function ProgressSignalMeter({
  label,
  subtitle,
  value,
  score,
  fillColor,
}: {
  label: string;
  subtitle: string;
  value: string;
  score: number | null;
  fillColor: string;
}) {
  const { rawColors } = useTheme();

  return (
    <View>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-sm font-semibold text-foreground" selectable>
            {label}
          </Text>
          <Text className="text-xs mt-0.5 text-foreground-secondary" selectable>
            {subtitle}
          </Text>
        </View>
        <Text className="text-sm font-semibold text-foreground" selectable>
          {value}
        </Text>
      </View>
      <View
        className="h-2 rounded-full mt-2 overflow-hidden"
        style={{ backgroundColor: rawColors.border }}
      >
        <View
          className="h-full rounded-full"
          style={{
            width: `${Math.round((score ?? 0) * 100)}%`,
            backgroundColor: fillColor,
          }}
        />
      </View>
    </View>
  );
}

export default function AnalyticsInsightsDeck({
  overview,
  selectedMetric,
  selectedMetricLabel,
  onGestureStart,
  onGestureEnd,
}: AnalyticsInsightsDeckProps) {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const { width: windowWidth } = useWindowDimensions();
  const scrollX = useSharedValue(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerWidth = Math.max(280, windowWidth - 32);
  const cardWidth = Math.max(280, containerWidth - (CARD_GAP + CARD_PEEK));
  const snapInterval = cardWidth + CARD_GAP;
  const metricUnit = formatMetricUnit(selectedMetric, unitPreference);

  const cardIds = useMemo<InsightCardId[]>(
    () => ["estimated-rep-maxes", "snapshot", "progress", "prs", "consistency", "rep-profile"],
    []
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  useAnimatedReaction(
    () => Math.round(scrollX.value / snapInterval),
    (nextIndex, previousIndex) => {
      const clampedIndex = Math.max(0, Math.min(cardIds.length - 1, nextIndex));
      if (clampedIndex !== previousIndex) {
        runOnJS(setActiveIndex)(clampedIndex);
      }
    }
  );

  const trendTone = getTrendTone(overview.progress.trendStatus);
  const momentumFillColor =
    overview.progress.momentumStatus === "building"
      ? rawColors.primary
      : overview.progress.momentumStatus === "softening"
        ? rawColors.destructive
        : rawColors.foregroundSecondary;
  const confidenceFillColor =
    overview.progress.confidenceLabel === "high"
      ? rawColors.primary
      : overview.progress.confidenceLabel === "medium"
        ? rawColors.foregroundSecondary
        : rawColors.destructive;
  const plateauFillColor =
    overview.progress.plateauRiskLabel === "high"
      ? rawColors.destructive
      : overview.progress.plateauRiskLabel === "moderate"
        ? rawColors.foregroundSecondary
        : rawColors.primary;

  return (
    <View
      testID="analytics-insights-deck"
      onTouchStart={onGestureStart}
      onTouchEnd={onGestureEnd}
      onTouchCancel={onGestureEnd}
    >
      <View className="flex-row items-center justify-between mb-3">
        <View>
          <Text className="text-lg font-semibold text-foreground" selectable>
            Insights
          </Text>
        </View>
        <View className="flex-row items-center px-3 py-1.5 rounded-full bg-surface-secondary">
          <MaterialCommunityIcons
            name="view-carousel-outline"
            size={14}
            color={rawColors.foregroundSecondary}
          />
          <Text className="text-sm font-medium ml-1.5 text-foreground-secondary" selectable>
            {cardIds.length} cards
          </Text>
        </View>
      </View>

      <Animated.ScrollView
        testID="analytics-insights-scroll"
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={snapInterval}
        snapToAlignment="start"
        disableIntervalMomentum
        scrollEventThrottle={16}
        nestedScrollEnabled
        onScrollBeginDrag={onGestureStart}
        onScrollEndDrag={onGestureEnd}
        onMomentumScrollBegin={onGestureStart}
        onScroll={scrollHandler}
        onMomentumScrollEnd={(event) => {
          const nextIndex = Math.round(event.nativeEvent.contentOffset.x / snapInterval);
          setActiveIndex(Math.max(0, Math.min(cardIds.length - 1, nextIndex)));
          onGestureEnd?.();
        }}
        contentContainerStyle={{ paddingRight: CARD_PEEK }}
      >
        {cardIds.map((cardId, index) => {
          const isLastCard = index === cardIds.length - 1;

          return (
            <View
              key={cardId}
              testID={`analytics-card-${cardId}`}
              className="rounded-2xl p-5 bg-surface"
              style={{
                width: cardWidth,
                marginRight: isLastCard ? 0 : CARD_GAP,
                shadowColor: rawColors.shadow,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              {cardId === "snapshot" && (
                <>
                  <View className="flex-row items-center justify-between mb-4">
                    <View>
                      <Text className="text-lg font-semibold text-foreground" selectable>
                        Snapshot
                      </Text>
                      <Text className="text-sm mt-1 text-foreground-secondary" selectable>
                        {selectedMetricLabel}
                      </Text>
                    </View>
                    <View className="px-3 py-1.5 rounded-full bg-primary-light">
                      <Text className="text-sm font-medium text-primary" selectable>
                        {metricUnit}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row flex-wrap gap-3">
                    <View className="w-[48%] rounded-xl p-3 bg-surface-secondary">
                      <Text className="text-xs font-medium text-foreground-secondary" selectable>
                        Latest
                      </Text>
                      <Text className="text-xl font-bold mt-1 text-foreground" selectable>
                        {formatMetricValue(selectedMetric, overview.snapshot.latestValue, unitPreference, {
                          withUnit: true,
                        })}
                      </Text>
                    </View>
                    <View className="w-[48%] rounded-xl p-3 bg-primary-light border border-primary">
                      <Text className="text-xs font-medium text-primary" selectable>
                        Best in Range
                      </Text>
                      <Text className="text-xl font-bold mt-1 text-primary" selectable>
                        {formatMetricValue(selectedMetric, overview.snapshot.bestValue, unitPreference, {
                          withUnit: true,
                        })}
                      </Text>
                    </View>
                    <View className="w-[48%] rounded-xl p-3 bg-surface-secondary">
                      <Text className="text-xs font-medium text-foreground-secondary" selectable>
                        Sessions
                      </Text>
                      <Text className="text-xl font-bold mt-1 text-foreground" selectable>
                        {overview.snapshot.sessionCount}
                      </Text>
                    </View>
                    <View className="w-[48%] rounded-xl p-3 bg-surface-secondary">
                      <Text className="text-xs font-medium text-foreground-secondary" selectable>
                        Days Since Last
                      </Text>
                      <Text className="text-xl font-bold mt-1 text-foreground" selectable>
                        {overview.snapshot.daysSinceLastSession ?? "--"}
                      </Text>
                    </View>
                  </View>
                </>
              )}

              {cardId === "progress" && (
                <>
                  <View className="flex-row items-center justify-between mb-4">
                    <View>
                      <Text className="text-lg font-semibold text-foreground" selectable>
                        Progress
                      </Text>
                      <Text className="text-sm mt-1 text-foreground-secondary" selectable>
                        {`Tracking ${selectedMetricLabel} (${metricUnit})`}
                      </Text>
                    </View>
                    <View className="items-end gap-2">
                      <View className="px-3 py-1.5 rounded-full bg-primary-light">
                        <Text className="text-sm font-medium text-primary" selectable>
                          {metricUnit}
                        </Text>
                      </View>
                      <View className="flex-row items-center px-3 py-1.5 rounded-full bg-surface-secondary">
                        <MaterialCommunityIcons
                          name={trendTone.icon}
                          size={14}
                          color={
                            trendTone.label === "Improving"
                              ? rawColors.primary
                              : trendTone.label === "Slipping"
                                ? rawColors.destructive
                                : rawColors.foregroundSecondary
                          }
                        />
                        <Text className={`text-sm font-medium ml-1.5 ${trendTone.colorClass}`} selectable>
                          {trendTone.label}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {!overview.progress.hasEnoughData ? (
                    <View className="rounded-xl p-4 bg-surface-secondary">
                      <Text className="text-base font-medium text-foreground" selectable>
                        Not enough data
                      </Text>
                      <Text className="text-sm mt-1 text-foreground-secondary" selectable>
                        Record at least 4 visible sessions to unlock progress trend analysis for this metric.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View className="flex-row flex-wrap gap-3 mb-4">
                        <View className="w-[48%] rounded-xl p-3 bg-surface-secondary">
                          <Text className="text-xs font-medium text-foreground-secondary" selectable>
                            Range Change
                          </Text>
                          <Text className="text-xl font-bold mt-1 text-foreground" selectable>
                            {formatSignedMetricValue(
                              selectedMetric,
                              overview.progress.rangeChange,
                              unitPreference,
                              { withUnit: true }
                            )}
                          </Text>
                        </View>
                        <View className="w-[48%] rounded-xl p-3 bg-surface-secondary">
                          <Text className="text-xs font-medium text-foreground-secondary" selectable>
                            Last 3 Sessions vs Previous 3
                          </Text>
                          <Text className="text-xl font-bold mt-1 text-foreground" selectable>
                            {formatSignedMetricValue(
                              selectedMetric,
                              overview.progress.recentVsPreviousChange,
                              unitPreference,
                              { withUnit: true }
                            )}
                          </Text>
                        </View>
                        <View className="w-[48%] rounded-xl p-3 bg-surface-secondary">
                          <Text className="text-xs font-medium text-foreground-secondary" selectable>
                            Latest 3 Session Avg
                          </Text>
                          <Text className="text-xl font-bold mt-1 text-foreground" selectable>
                            {formatMetricValue(
                              selectedMetric,
                              overview.progress.recentAverage,
                              unitPreference,
                              { withUnit: true }
                            )}
                          </Text>
                        </View>
                        <View className="w-[48%] rounded-xl p-3 bg-surface-secondary">
                          <Text className="text-xs font-medium text-foreground-secondary" selectable>
                            Best vs Latest Gap
                          </Text>
                          <Text className="text-xl font-bold mt-1 text-foreground" selectable>
                            {formatSignedMetricValue(
                              selectedMetric,
                              overview.progress.bestVsLatestGap,
                              unitPreference,
                              { withUnit: true }
                            )}
                          </Text>
                        </View>
                      </View>

                      <Text className="text-xs mb-4 text-foreground-muted" selectable>
                        Short-term momentum compares the latest 3 visible sessions with the 3 before them.
                      </Text>

                      <View className="rounded-xl p-4 mb-4 bg-surface-secondary">
                        <Text className="text-xs font-medium mb-4 text-foreground-secondary" selectable>
                          Trend Signals
                        </Text>
                        <View className="gap-4">
                          <ProgressSignalMeter
                            label="Momentum (EWMA)"
                            subtitle={`Smoothed recent movement is ${overview.progress.momentumStatus}.`}
                            value={
                              overview.progress.momentumValue === null
                                ? "--"
                                : formatSignedMetricValue(
                                    selectedMetric,
                                    overview.progress.momentumValue,
                                    unitPreference,
                                    { withUnit: true }
                                  )
                            }
                            score={overview.progress.momentumScore}
                            fillColor={momentumFillColor}
                          />
                          <ProgressSignalMeter
                            label="Trend Confidence"
                            subtitle="How clearly the trend stands out from session noise."
                            value={`${toTitleCase(overview.progress.confidenceLabel)} / ${formatScorePercent(
                              overview.progress.confidenceScore
                            )}`}
                            score={overview.progress.confidenceScore}
                            fillColor={confidenceFillColor}
                          />
                          <ProgressSignalMeter
                            label="Plateau Risk"
                            subtitle="Higher when performance is stable but trend strength is weak."
                            value={`${toTitleCase(overview.progress.plateauRiskLabel)} / ${formatScorePercent(
                              overview.progress.plateauRiskScore
                            )}`}
                            score={overview.progress.plateauRiskScore}
                            fillColor={plateauFillColor}
                          />
                        </View>
                      </View>

                      <View className="flex-row gap-3">
                        <View className="flex-1 rounded-xl p-3 bg-surface-secondary">
                          <Text className="text-xs font-medium text-foreground-secondary" selectable>
                            Robust Slope
                          </Text>
                          <Text className="text-lg font-bold mt-1 text-foreground" selectable>
                            {formatMetricPerSession(
                              selectedMetric,
                              overview.progress.robustSlopePerSession,
                              unitPreference
                            )}
                          </Text>
                          <Text className="text-xs mt-1 text-foreground-muted" selectable>
                            Theil-Sen trend estimate
                          </Text>
                        </View>
                        <View className="flex-1 rounded-xl p-3 bg-surface-secondary">
                          <Text className="text-xs font-medium text-foreground-secondary" selectable>
                            Stability
                          </Text>
                          <Text className="text-lg font-bold mt-1 text-foreground" selectable>
                            {toTitleCase(overview.progress.stabilityLabel)}
                          </Text>
                          <Text className="text-xs mt-1 text-foreground-muted" selectable>
                            {`${formatScorePercent(overview.progress.stabilityScore)} signal stability`}
                          </Text>
                        </View>
                      </View>
                    </>
                  )}
                </>
              )}

              {cardId === "prs" && (
                <>
                  <View className="flex-row items-center justify-between mb-4">
                    <View>
                      <Text className="text-lg font-semibold text-foreground" selectable>
                        PRs
                      </Text>
                      <Text className="text-sm mt-1 text-foreground-secondary" selectable>
                        Current rep-max records and PR activity
                      </Text>
                    </View>
                    <View className="px-3 py-1.5 rounded-full bg-primary-light">
                      <Text className="text-sm font-medium text-primary" selectable>
                        {getWeightUnitLabel(unitPreference)}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {overview.prs.chips.map((chip) => (
                      <View
                        key={chip.targetReps}
                        className="px-3 py-2 rounded-full border"
                        style={{
                          backgroundColor:
                            chip.weightKg === null ? rawColors.surfaceSecondary : rawColors.primaryLight,
                          borderColor: chip.weightKg === null ? rawColors.border : rawColors.primary,
                        }}
                      >
                        <Text
                          className={`text-sm font-semibold ${
                            chip.weightKg === null ? "text-foreground-secondary" : "text-primary"
                          }`}
                          selectable
                        >
                          {chip.targetReps}RM{" "}
                          {chip.weightKg === null
                            ? "--"
                            : formatWeightFromKg(chip.weightKg, unitPreference, {
                                withUnit: true,
                                maximumFractionDigits: 0,
                              })}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View className="flex-row gap-3">
                    <View className="flex-1 rounded-xl p-3 bg-surface-secondary">
                      <Text className="text-xs font-medium text-foreground-secondary" selectable>
                        Last PR
                      </Text>
                      <Text className="text-base font-bold mt-1 text-foreground" selectable>
                        {formatShortDate(overview.prs.lastPrDate)}
                      </Text>
                    </View>
                    <View className="flex-1 rounded-xl p-3 bg-surface-secondary">
                      <Text className="text-xs font-medium text-foreground-secondary" selectable>
                        PR Sessions
                      </Text>
                      <Text className="text-base font-bold mt-1 text-foreground" selectable>
                        {overview.prs.prSessionsInRange}
                      </Text>
                    </View>
                    <View className="flex-1 rounded-xl p-3 bg-surface-secondary">
                      <Text className="text-xs font-medium text-foreground-secondary" selectable>
                        New PRs
                      </Text>
                      <Text className="text-base font-bold mt-1 text-foreground" selectable>
                        {overview.prs.newPrEventsInRange}
                      </Text>
                    </View>
                  </View>
                </>
              )}

              {cardId === "consistency" && (
                <>
                  <Text className="text-lg font-semibold text-foreground" selectable>
                    Consistency
                  </Text>
                  <Text className="text-sm mt-1 mb-4 text-foreground-secondary" selectable>
                    Frequency, spacing, and weekly rhythm
                  </Text>
                  {!overview.consistency.hasEnoughData ? (
                    <View className="rounded-xl p-4 bg-surface-secondary">
                      <Text className="text-base font-medium text-foreground" selectable>
                        Not enough data
                      </Text>
                      <Text className="text-sm mt-1 text-foreground-secondary" selectable>
                        Record at least 4 visible sessions to unlock cadence and streak analytics.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View className="flex-row flex-wrap gap-3 mb-4">
                        <View className="w-[48%] rounded-xl p-3 bg-surface-secondary">
                          <Text className="text-xs font-medium text-foreground-secondary" selectable>
                            Sessions / Week
                          </Text>
                          <Text className="text-xl font-bold mt-1 text-foreground" selectable>
                            {overview.consistency.sessionsPerWeek?.toFixed(1) ?? "--"}
                          </Text>
                        </View>
                        <View className="w-[48%] rounded-xl p-3 bg-surface-secondary">
                          <Text className="text-xs font-medium text-foreground-secondary" selectable>
                            Avg Gap
                          </Text>
                          <Text className="text-xl font-bold mt-1 text-foreground" selectable>
                            {overview.consistency.averageGapDays === null
                              ? "--"
                              : `${overview.consistency.averageGapDays.toFixed(1)}d`}
                          </Text>
                        </View>
                        <View className="w-[48%] rounded-xl p-3 bg-surface-secondary">
                          <Text className="text-xs font-medium text-foreground-secondary" selectable>
                            Current Streak
                          </Text>
                          <Text className="text-xl font-bold mt-1 text-foreground" selectable>
                            {overview.consistency.currentWeeklyStreak}
                          </Text>
                        </View>
                        <View className="w-[48%] rounded-xl p-3 bg-surface-secondary">
                          <Text className="text-xs font-medium text-foreground-secondary" selectable>
                            Longest Streak
                          </Text>
                          <Text className="text-xl font-bold mt-1 text-foreground" selectable>
                            {overview.consistency.longestWeeklyStreak}
                          </Text>
                        </View>
                      </View>
                      <View className="rounded-xl p-3 bg-surface-secondary">
                        <Text className="text-xs font-medium mb-3 text-foreground-secondary" selectable>
                          Weekly Heat
                        </Text>
                        <View className="flex-row justify-between gap-2">
                          {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => {
                            const count = overview.consistency.weekdayCounts[index];
                            const maxCount = Math.max(...overview.consistency.weekdayCounts, 1);
                            const opacity = count === 0 ? 0.35 : Math.min(1, 0.4 + count / maxCount);

                            return (
                              <View key={`${label}-${index}`} className="items-center flex-1">
                                <View
                                  className="w-8 h-8 rounded-full items-center justify-center mb-1"
                                  style={{ backgroundColor: rawColors.primary, opacity }}
                                >
                                  <Text className="text-xs font-bold text-primary-foreground" selectable>
                                    {count}
                                  </Text>
                                </View>
                                <Text className="text-[11px] text-foreground-secondary" selectable>
                                  {label}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    </>
                  )}
                </>
              )}

              {cardId === "rep-profile" && (
                <>
                  <Text className="text-lg font-semibold text-foreground" selectable>
                    Rep Profile
                  </Text>
                  <Text className="text-sm mt-1 mb-4 text-foreground-secondary" selectable>
                    Best achieved load across common rep buckets
                  </Text>
                  <View className="flex-row flex-wrap gap-3">
                    {overview.repProfile.buckets.map((bucket) => (
                      <View
                        key={bucket.id}
                        className="w-[48%] rounded-xl p-3 bg-surface-secondary"
                      >
                        <Text className="text-xs font-medium text-foreground-secondary" selectable>
                          {bucket.label}
                        </Text>
                        <Text className="text-lg font-bold mt-2 text-foreground" selectable>
                          {bucket.bestSet
                            ? `${formatWeightFromKg(bucket.bestSet.weightKg, unitPreference)} x ${
                                bucket.bestSet.reps
                              }`
                            : "--"}
                        </Text>
                        <Text className="text-xs mt-1 text-foreground-muted" selectable>
                          {bucket.bestSet ? formatShortDate(bucket.bestSet.date) : "No sets"}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {cardId === "estimated-rep-maxes" && (
                <>
                  <Text className="text-lg font-semibold text-foreground" selectable>
                    Estimated Rep Maxes
                  </Text>
                  <Text className="text-sm mt-1 mb-4 text-foreground-secondary" selectable>
                    Projected from the best filtered set in range
                  </Text>
                  <View className="rounded-xl p-4 mb-4 bg-surface-secondary">
                    <View className="flex-row items-center justify-between">
                      <View>
                        <Text className="text-xs font-medium text-foreground-secondary" selectable>
                          Source Set
                        </Text>
                        <Text className="text-lg font-bold mt-1 text-foreground" selectable>
                          {overview.estimatedRepMaxes.sourceSet
                            ? `${formatWeightFromKg(
                                overview.estimatedRepMaxes.sourceSet.weightKg,
                                unitPreference
                              )} x ${overview.estimatedRepMaxes.sourceSet.reps}`
                            : "--"}
                        </Text>
                        <Text className="text-xs mt-1 text-foreground-muted" selectable>
                          {overview.estimatedRepMaxes.sourceSet
                            ? `${formatShortDate(
                                overview.estimatedRepMaxes.sourceSet.date
                              )} / Est. 1RM ${formatWeightFromKg(
                                overview.estimatedRepMaxes.sourceSet.estimated1RMKg,
                                unitPreference
                              )}`
                            : "No qualifying set in the selected range"}
                        </Text>
                      </View>
                      <View className="px-3 py-1.5 rounded-full bg-primary-light">
                        <Text className="text-sm font-medium text-primary" selectable>
                          {getFormulaLabel(overview.estimatedRepMaxes.formulaId)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View className="flex-row flex-wrap gap-3">
                    {overview.estimatedRepMaxes.entries.map((entry) => (
                      <View key={entry.targetReps} className="w-[48%]">
                        <ProjectionTile
                          entry={entry}
                          sourceReps={overview.estimatedRepMaxes.sourceSet?.reps ?? null}
                        />
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          );
        })}
      </Animated.ScrollView>

      <View className="flex-row items-center justify-center gap-2 mt-4">
        {cardIds.map((cardId, index) => (
          <Pressable
            key={cardId}
            testID={`analytics-dot-${index}`}
            className="rounded-full"
            style={{
              width: activeIndex === index ? 18 : 8,
              height: 8,
              backgroundColor:
                activeIndex === index ? rawColors.primary : rawColors.border,
            }}
          />
        ))}
      </View>
    </View>
  );
}
