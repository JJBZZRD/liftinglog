import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Stack, router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import PerformanceGuideSummaryCard from "../components/performanceGuide/PerformanceGuideSummaryCard";
import { useUnitPreference } from "../lib/contexts/UnitPreferenceContext";
import { listAllUserCheckins, type UserCheckin } from "../lib/db/userCheckins";
import { useTheme, type RawThemeColors } from "../lib/theme/ThemeContext";
import { buildPerformanceGuideFromCheckins } from "../lib/userMetrics/performanceGuide";
import {
  USER_METRIC_DEFINITIONS,
  formatUserMetricValue,
  getUserMetricEntries,
  type UserMetricAccent,
  type UserMetricEntry,
  type UserMetricKey,
} from "../lib/userMetrics/definitions";

function getAccentColors(accent: UserMetricAccent, rawColors: RawThemeColors) {
  switch (accent) {
    case "success":
      return {
        iconColor: rawColors.success,
        iconBackground: `${rawColors.success}18`,
      };
    case "warning":
      return {
        iconColor: rawColors.warning,
        iconBackground: `${rawColors.warning}18`,
      };
    case "destructive":
      return {
        iconColor: rawColors.destructive,
        iconBackground: `${rawColors.destructive}15`,
      };
    case "primary":
    default:
      return {
        iconColor: rawColors.primary,
        iconBackground: rawColors.primaryLight,
      };
  }
}

function formatMetricDate(entry: UserMetricEntry | null) {
  if (!entry) return null;
  const date = new Date(entry.recordedAt);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
}

export default function UserMetricsScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
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
      console.error("Error loading user check-ins:", error);
      setLoadError("Performance guide is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCheckins();
    }, [loadCheckins])
  );

  const performanceGuideState = useMemo(() => {
    try {
      return {
        result: buildPerformanceGuideFromCheckins(checkins),
        error: null as string | null,
      };
    } catch (error) {
      console.error("Error building performance guide summary:", error);
      return {
        result: null,
        error: "Performance guide is unavailable right now.",
      };
    }
  }, [checkins]);

  const handleMetricPress = useCallback((metric: UserMetricKey) => {
    router.push({
      pathname: "/user-metric/[metric]",
      params: { metric },
    });
  }, []);

  const handlePerformanceGuidePress = useCallback(() => {
    router.push("/performance-guide");
  }, []);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "User Metrics",
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ paddingRight: 8 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120, gap: 10 }}
      >
        {/* Header summary */}
        <View className="flex-row items-center justify-between px-1 pb-2">
          <View className="flex-row items-center gap-2">
            <Text className="text-xs font-semibold uppercase tracking-widest text-foreground-muted">
              {USER_METRIC_DEFINITIONS.length} metrics
            </Text>
            <Text className="text-foreground-muted">·</Text>
            <Text className="text-xs font-semibold uppercase tracking-widest text-foreground-muted">
              {checkins.length} check-ins
            </Text>
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={rawColors.primary} />
          ) : null}
        </View>

        <PerformanceGuideSummaryCard
          result={performanceGuideState.result}
          loading={loading}
          errorMessage={loadError ?? performanceGuideState.error}
          onPress={handlePerformanceGuidePress}
        />

        {USER_METRIC_DEFINITIONS.map((metric) => {
          const accent = getAccentColors(metric.accent, rawColors);
          const entries = getUserMetricEntries(checkins, metric.key);
          const latestEntry = entries[0] ?? null;
          const latestValue = formatUserMetricValue(metric.key, latestEntry?.value, unitPreference);
          const latestDate = formatMetricDate(latestEntry);

          return (
            <Pressable
              key={metric.key}
              className="rounded-2xl bg-surface"
              onPress={() => handleMetricPress(metric.key)}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <View className="flex-row items-center px-5 pt-4 pb-3">
                <View
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: accent.iconBackground }}
                >
                  <MaterialCommunityIcons name={metric.icon as never} size={20} color={accent.iconColor} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-base font-semibold text-foreground">
                    {metric.label}
                  </Text>
                  <Text className="text-xs text-foreground-muted" numberOfLines={1}>
                    {metric.subtitle}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={rawColors.foregroundMuted}
                />
              </View>

              <View className="mx-4 mb-4 flex-row items-end rounded-xl bg-surface-secondary px-4 py-3">
                <Text
                  className="text-[28px] font-bold text-foreground"
                  style={{ fontVariant: ["tabular-nums"], lineHeight: 34 }}
                >
                  {latestValue}
                </Text>
                <View className="ml-3 mb-1 flex-1">
                  <Text className="text-[11px] text-foreground-muted">
                    {loading
                      ? "Loading..."
                      : latestEntry
                        ? `${latestDate}`
                        : metric.emptyStateLabel}
                  </Text>
                </View>
                <View className="mb-0.5 rounded-full bg-primary-light px-2 py-0.5">
                  <Text className="text-[10px] font-semibold text-primary">
                    {entries.length} {entries.length === 1 ? "entry" : "entries"}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
