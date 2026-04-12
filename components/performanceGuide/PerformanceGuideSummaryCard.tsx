import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View, ActivityIndicator } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";
import type { PerformanceGuideResult } from "../../lib/userMetrics/performanceGuide";
import {
  getPerformanceGuideConfidenceLabel,
  getPerformanceGuideConfidenceTone,
  getPerformanceGuideTopSummaryLines,
  getPerformanceGuideZoneLabel,
  getPerformanceGuideZoneTone,
} from "../../lib/userMetrics/performanceGuide/display";
import GuideBadge from "./GuideBadge";

type PerformanceGuideSummaryCardProps = {
  result: PerformanceGuideResult | null;
  loading: boolean;
  errorMessage?: string | null;
  onPress?: () => void;
};

export default function PerformanceGuideSummaryCard({
  result,
  loading,
  errorMessage,
  onPress,
}: PerformanceGuideSummaryCardProps) {
  const { rawColors } = useTheme();
  const isDisabled = loading || !!errorMessage || !result;
  const summaryLines = result ? getPerformanceGuideTopSummaryLines(result) : [];

  return (
    <Pressable
      testID="performance-guide-summary-card"
      className="rounded-2xl bg-surface"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed && !isDisabled ? 0.88 : 1,
      })}
    >
      <View className="px-5 pt-4 pb-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: rawColors.primaryLight }}
            >
              <MaterialCommunityIcons
                name="account-heart-outline"
                size={20}
                color={rawColors.primary}
              />
            </View>
            <View>
              <Text className="text-base font-semibold text-foreground">
                Performance Guide
              </Text>
              <Text className="text-xs text-foreground-muted">
                Daily recovery summary
              </Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={rawColors.primary} />
          ) : (
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={rawColors.foregroundMuted}
            />
          )}
        </View>

        {loading ? (
          <View className="mt-4 rounded-xl bg-surface-secondary px-4 py-4">
            <Text className="text-sm text-foreground-muted">
              Building your current performance picture...
            </Text>
          </View>
        ) : errorMessage ? (
          <View className="mt-4 rounded-xl bg-surface-secondary px-4 py-4">
            <Text className="text-sm text-foreground-muted">
              {errorMessage}
            </Text>
          </View>
        ) : result ? (
          <>
            <View className="mt-4 flex-row flex-wrap gap-2">
              <GuideBadge
                testID="performance-guide-summary-zone-badge"
                label={getPerformanceGuideZoneLabel(result.zone)}
                tone={getPerformanceGuideZoneTone(result.zone)}
              />
              <GuideBadge
                testID="performance-guide-summary-confidence-badge"
                label={`${getPerformanceGuideConfidenceLabel(result.confidenceLabel)} confidence`}
                tone={getPerformanceGuideConfidenceTone(result.confidenceLabel)}
              />
            </View>

            <Text
              testID="performance-guide-summary-text"
              className="mt-3 text-lg font-semibold text-foreground"
              selectable
            >
              {result.summary}
            </Text>

            {summaryLines.length > 0 ? (
              <View
                testID={
                  result.zone === null || result.confidenceLabel === "low" || result.confidenceLabel === "insufficient"
                    ? "performance-guide-summary-note"
                    : "performance-guide-summary-reasons"
                }
                className="mt-3 gap-2"
              >
                {summaryLines.map((line, index) => (
                  <View
                    key={`${line}-${index}`}
                    className="rounded-xl bg-surface-secondary px-3 py-2.5"
                  >
                    <Text className="text-sm text-foreground-secondary" selectable>
                      {line}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View className="mt-4 flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                {result.contributingMetrics.length} {result.contributingMetrics.length === 1 ? "metric" : "metrics"} contributing
              </Text>
              <View
                testID="performance-guide-summary-cta"
                className="rounded-full bg-primary-light px-3 py-1.5"
              >
                <Text className="text-xs font-semibold text-primary">
                  View details
                </Text>
              </View>
            </View>
          </>
        ) : null}
      </View>
    </Pressable>
  );
}
