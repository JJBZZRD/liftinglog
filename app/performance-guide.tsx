import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import GuideBadge from "../components/performanceGuide/GuideBadge";
import MetricCoverageRow from "../components/performanceGuide/MetricCoverageRow";
import {
  CORE_METRICS,
  METRIC_TYPES,
  buildPerformanceGuideFromCheckins,
  type PatternSignal,
  type ReadinessSignal,
} from "../lib/userMetrics/performanceGuide";
import {
  buildPerformanceGuideMetricPriority,
  formatPerformanceGuideConfidence,
  formatPerformanceGuideMetricList,
  formatPerformanceGuideScore,
  getPerformanceGuideConfidenceLabel,
  getPerformanceGuideConfidenceTone,
  getPerformanceGuideInterpretation,
  getPerformanceGuideMetricLabel,
  getPerformanceGuideZoneLabel,
  getPerformanceGuideZoneTone,
} from "../lib/userMetrics/performanceGuide/display";
import { listAllUserCheckins, type UserCheckin } from "../lib/db/userCheckins";
import { useTheme } from "../lib/theme/ThemeContext";
import type { UserMetricKey } from "../lib/userMetrics/definitions";

type DetailItem = {
  id: string;
  title: string;
  subtitle: string;
  tone: "primary" | "success" | "warning" | "destructive" | "neutral" | "muted";
  kindLabel: string;
};

function getDetailTone(
  polarity: "positive" | "negative" | "neutral"
): DetailItem["tone"] {
  switch (polarity) {
    case "positive":
      return "success";
    case "negative":
      return "warning";
    case "neutral":
    default:
      return "neutral";
  }
}

function buildPatternDetail(signal: PatternSignal): DetailItem {
  return {
    id: signal.id,
    title: signal.reason,
    subtitle: formatPerformanceGuideMetricList(signal.metrics),
    tone: getDetailTone(signal.polarity),
    kindLabel: "Pattern",
  };
}

function buildSignalDetail(signal: ReadinessSignal): DetailItem {
  return {
    id: signal.id,
    title: signal.reason,
    subtitle: getPerformanceGuideMetricLabel(signal.metric),
    tone: getDetailTone(signal.polarity),
    kindLabel: signal.kind === "acute" ? "Acute" : "Trend",
  };
}

export default function PerformanceGuideScreen() {
  const { rawColors } = useTheme();
  const [checkins, setCheckins] = useState<UserCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadCheckins = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await listAllUserCheckins();
      setCheckins(rows);
    } catch (error) {
      console.error("Error loading performance guide:", error);
      setLoadError("Performance guide is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCheckins();
    }, [loadCheckins])
  );

  const guideState = useMemo(() => {
    try {
      return {
        result: buildPerformanceGuideFromCheckins(checkins),
        error: null as string | null,
      };
    } catch (error) {
      console.error("Error building performance guide:", error);
      return {
        result: null,
        error: "Performance guide is unavailable right now.",
      };
    }
  }, [checkins]);

  const result = guideState.result;
  const routeError = loadError ?? guideState.error;
  const prioritizedMetrics = result
    ? buildPerformanceGuideMetricPriority(result, [...CORE_METRICS] as UserMetricKey[])
    : ([...CORE_METRICS] as UserMetricKey[]);
  const dominantMetricLabel =
    result?.dominantMetrics[0] ? getPerformanceGuideMetricLabel(result.dominantMetrics[0]) : null;
  const detailItems: DetailItem[] = result
    ? [
      ...result.patterns.map(buildPatternDetail),
      ...result.signals.slice(0, 5).map(buildSignalDetail),
    ]
    : [];

  return (
    <View testID="performance-guide-screen" className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Performance Guide",
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ paddingRight: 8 }}>
              <MaterialCommunityIcons
                name="arrow-left"
                size={24}
                color={rawColors.foreground}
              />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 120,
          gap: 12,
        }}
      >
        {loading ? (
          <View className="rounded-2xl bg-surface px-5 py-6">
            <View className="flex-row items-center gap-3">
              <ActivityIndicator size="small" color={rawColors.primary} />
              <Text className="text-sm text-foreground-muted">
                Building your current performance guide...
              </Text>
            </View>
          </View>
        ) : routeError || !result ? (
          <View className="rounded-2xl bg-surface px-5 py-6">
            <Text className="text-base font-semibold text-foreground">
              Performance Guide
            </Text>
            <Text className="mt-2 text-sm text-foreground-muted">
              {routeError ?? "Performance guide is unavailable right now."}
            </Text>
          </View>
        ) : (
          <>
            <View className="rounded-2xl bg-surface px-5 pt-5 pb-4">
              <View className="flex-row flex-wrap items-center gap-2">
                <GuideBadge
                  testID="performance-guide-detail-zone-badge"
                  label={getPerformanceGuideZoneLabel(result.zone)}
                  tone={getPerformanceGuideZoneTone(result.zone)}
                />
                <GuideBadge
                  testID="performance-guide-detail-confidence-badge"
                  label={`${getPerformanceGuideConfidenceLabel(result.confidenceLabel)} confidence`}
                  tone={getPerformanceGuideConfidenceTone(result.confidenceLabel)}
                />
              </View>

              <Text
                className="mt-3 text-[28px] font-bold text-foreground"
                selectable
                style={{ fontVariant: ["tabular-nums"], lineHeight: 34 }}
              >
                {result.summary}
              </Text>

              <Text className="mt-2 text-sm leading-5 text-foreground-secondary" selectable>
                {getPerformanceGuideInterpretation(result.zone)}
              </Text>

              <View className="mt-4 flex-row flex-wrap gap-2">
                <View className="rounded-full bg-surface-secondary px-3 py-1.5">
                  <Text className="text-xs font-semibold text-foreground-secondary">
                    {result.contributingMetrics.length} {result.contributingMetrics.length === 1 ? "metric" : "metrics"} contributing
                  </Text>
                </View>
                {result.basedMostlyOnSingleMetric && dominantMetricLabel ? (
                  <View className="rounded-full bg-surface-secondary px-3 py-1.5">
                    <Text className="text-xs font-semibold text-foreground-secondary">
                      Mostly driven by {dominantMetricLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View className="rounded-2xl bg-surface p-5">
              <Text className="text-base font-semibold text-foreground">
                Why this result
              </Text>

              {result.reasons.length > 0 ? (
                <View className="mt-4 gap-2">
                  {result.reasons.map((reason, index) => (
                    <View
                      key={`${reason}-${index}`}
                      className="rounded-xl bg-surface-secondary px-4 py-3"
                    >
                      <Text className="text-sm text-foreground" selectable>
                        {reason}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View className="mt-4 gap-2">
                {result.missingDataNotes.map((note, index) => (
                  <View
                    key={`${note.id}-${index}`}
                    className="rounded-xl bg-surface-secondary px-4 py-3"
                  >
                    <Text className="text-sm text-foreground-secondary" selectable>
                      {note.message}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="rounded-2xl bg-surface p-5">
              <Text className="text-base font-semibold text-foreground">
                Relevant metrics
              </Text>
              <Text className="mt-1 text-xs text-foreground-muted">
                Jump into the metrics shaping this guide.
              </Text>

              <View className="mt-4 flex-row flex-wrap gap-2">
                {prioritizedMetrics.map((metric) => (
                  <Pressable
                    key={metric}
                    testID={`performance-guide-metric-chip-${metric}`}
                    className="rounded-full px-4 py-2"
                    style={{
                      backgroundColor: rawColors.primaryLight,
                    }}
                    onPress={() => router.push({
                      pathname: "/user-metric/[metric]",
                      params: { metric },
                    })}
                  >
                    <Text className="text-sm font-semibold text-primary">
                      {getPerformanceGuideMetricLabel(metric)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="rounded-2xl bg-surface p-5">
              <Text className="text-base font-semibold text-foreground">
                Metric coverage
              </Text>
              <Text className="mt-1 text-xs text-foreground-muted">
                Which metrics are usable today and which still need coverage.
              </Text>

              <View className="mt-4 gap-2">
                {METRIC_TYPES.map((metric) => (
                  <MetricCoverageRow
                    key={metric}
                    testID={`performance-guide-coverage-${metric}`}
                    availability={result.availabilityByMetric[metric]}
                  />
                ))}
              </View>
            </View>

            <View className="rounded-2xl bg-surface p-5">
              <Text className="text-base font-semibold text-foreground">
                Engine details
              </Text>
              <Text className="mt-1 text-xs text-foreground-muted">
                Patterns first, then the highest-impact base signals.
              </Text>

              {detailItems.length === 0 ? (
                <View className="mt-4 rounded-xl bg-surface-secondary px-4 py-4">
                  <Text className="text-sm text-foreground-muted">
                    No contributing signals yet.
                  </Text>
                </View>
              ) : (
                <View className="mt-4 gap-2">
                  {detailItems.map((item, index) => (
                    <View
                      key={item.id}
                      testID={`performance-guide-engine-detail-${index}`}
                      className="rounded-xl bg-surface-secondary px-4 py-3"
                    >
                      <View className="flex-row flex-wrap items-center gap-2">
                        <GuideBadge label={item.kindLabel} tone={item.tone} />
                      </View>
                      <Text className="mt-2 text-sm font-semibold text-foreground" selectable>
                        {item.title}
                      </Text>
                      <Text className="mt-1 text-xs text-foreground-muted" selectable>
                        {item.subtitle}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <Text className="mt-4 text-xs text-foreground-muted" selectable>
                Score {formatPerformanceGuideScore(result.normalizedScore)} | Confidence {formatPerformanceGuideConfidence(result.confidence)}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
