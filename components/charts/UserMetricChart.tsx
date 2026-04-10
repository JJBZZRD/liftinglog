import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import {
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  BarChart,
  type barDataItem,
  LineChart,
  type lineDataItem,
} from "react-native-gifted-charts";
import { useTheme } from "../../lib/theme/ThemeContext";

export type UserMetricChartPoint = {
  id: number;
  date: number;
  value: number;
  isPlaceholder?: boolean;
};

type UserMetricChartProps = {
  data: UserMetricChartPoint[];
  variant: "line" | "bar";
  selectedPoint?: UserMetricChartPoint | null;
  onSelectPoint?: (point: UserMetricChartPoint) => void;
  height?: number;
  width?: number;
  unitLabel?: string;
  formatYAxisLabel?: (value: number) => string;
  instructionsText?: string;
  yDomain?: { min: number; max: number };
};

const Y_AXIS_LABEL_WIDTH = 40;
const WRAPPER_PADDING_H = 10;
const MIN_CHART_WIDTH = 180;

function formatXAxisLabel(timestamp: number, includeYear: boolean) {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  if (includeYear) {
    options.year = "2-digit";
  }
  return new Date(timestamp).toLocaleDateString("en-US", options);
}

function formatBarXAxisLabel(
  timestamp: number,
  includeYear: boolean,
  pointCount: number,
) {
  if (pointCount <= 7) {
    return new Date(timestamp).toLocaleDateString("en-US", {
      weekday: "short",
    });
  }
  return formatXAxisLabel(timestamp, includeYear);
}

function getXAxisLabelStep(pointCount: number) {
  if (pointCount <= 7) return 1;
  if (pointCount <= 14) return 2;
  if (pointCount <= 24) return 3;
  if (pointCount <= 45) return 5;
  return 7;
}

function formatYAxisText(
  value: number,
  formatter?: (value: number) => string,
) {
  if (formatter) return formatter(value);
  return `${Math.round(value)}`;
}

function getBarLayout(pointCount: number, availableWidth: number) {
  const barWidth = pointCount > 20 ? 6 : pointCount > 12 ? 7 : 8;

  if (pointCount <= 1) {
    return {
      barWidth: 12,
      spacing: 0,
      initialSpacing: Math.floor(availableWidth / 2) - 6,
      endSpacing: Math.floor(availableWidth / 2) - 6,
      labelWidth: 60,
    };
  }

  if (pointCount <= 7) {
    const totalBarWidth = pointCount * barWidth;
    const totalGapSpace = availableWidth - totalBarWidth;
    const spacing = Math.max(
      8,
      Math.floor(totalGapSpace / (pointCount + 1)),
    );
    const initialSpacing = spacing;
    const endSpacing =
      availableWidth -
      (initialSpacing + totalBarWidth + (pointCount - 1) * spacing);
    const labelWidth = Math.max(
      28,
      Math.min(52, Math.floor(availableWidth / pointCount)),
    );
    return {
      barWidth,
      spacing,
      initialSpacing: Math.max(8, initialSpacing),
      endSpacing: Math.max(0, endSpacing),
      labelWidth,
    };
  }

  const spacing = pointCount > 20 ? 8 : 10;
  const contentWidth = pointCount * barWidth + (pointCount - 1) * spacing;
  const scrollable = contentWidth > availableWidth;
  return {
    barWidth,
    spacing,
    initialSpacing: scrollable
      ? 10
      : Math.max(8, Math.floor((availableWidth - contentWidth) / 2)),
    endSpacing: scrollable ? 24 : 0,
    labelWidth: barWidth + spacing,
  };
}

function getLineLayout(pointCount: number, availableWidth: number) {
  if (pointCount <= 1) {
    return { disableScroll: true, initialSpacing: Math.max(24, Math.floor(availableWidth / 2)), endSpacing: Math.max(24, Math.floor(availableWidth / 2)), spacing: 42 };
  }
  if (pointCount <= 5) {
    const spacing = Math.min(88, Math.max(48, Math.floor(availableWidth / Math.max(1, pointCount - 1))));
    const contentWidth = (pointCount - 1) * spacing;
    const side = Math.max(14, Math.floor((availableWidth - contentWidth) / 2));
    return { disableScroll: true, initialSpacing: side, endSpacing: side, spacing };
  }
  if (pointCount <= 7) {
    const spacing = Math.max(36, Math.floor((availableWidth - 20) / Math.max(1, pointCount - 1)));
    return { disableScroll: true, initialSpacing: 10, endSpacing: 10, spacing };
  }
  return { disableScroll: false, initialSpacing: 8, endSpacing: 12, spacing: pointCount > 24 ? 34 : 42 };
}

export default function UserMetricChart({
  data,
  variant,
  selectedPoint,
  onSelectPoint,
  height,
  width: propWidth,
  formatYAxisLabel,
  yDomain,
}: UserMetricChartProps) {
  const { rawColors } = useTheme();
  const [measuredWidth, setMeasuredWidth] = useState(0);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const w = event.nativeEvent.layout.width;
      if (w > 0 && Math.abs(w - measuredWidth) > 1) setMeasuredWidth(w);
    },
    [measuredWidth],
  );

  const containerWidth = propWidth ?? measuredWidth;
  const innerWidth = containerWidth - WRAPPER_PADDING_H * 2;
  const chartAreaWidth = Math.max(MIN_CHART_WIDTH, innerWidth - Y_AXIS_LABEL_WIDTH);
  const LINE_CHART_HEIGHT = height ?? 200;
  const BAR_CHART_HEIGHT = height ?? 200;
  const lineChartTotalHeight = LINE_CHART_HEIGHT + 36;

  const xAxisLabelStep = getXAxisLabelStep(data.length);

  const barLayout = useMemo(
    () => getBarLayout(data.length, chartAreaWidth),
    [chartAreaWidth, data.length],
  );
  const lineLayout = useMemo(
    () => getLineLayout(data.length, chartAreaWidth),
    [chartAreaWidth, data.length],
  );

  const includeYearOnXAxis = useMemo(() => {
    if (data.length <= 1) return false;
    return (
      new Date(data[0].date).getFullYear() !==
      new Date(data[data.length - 1].date).getFullYear()
    );
  }, [data]);

  const selectedIndex = useMemo(() => {
    if (!selectedPoint) return -1;
    return data.findIndex(
      (p) => p.id === selectedPoint.id && p.date === selectedPoint.date,
    );
  }, [data, selectedPoint]);

  const computedYAxis = useMemo(() => {
    if (yDomain) {
      const range = yDomain.max - yDomain.min;
      return {
        yAxisOffset: yDomain.min,
        maxValue: range,
        noOfSections: Math.min(range, 4),
      };
    }
    if (data.length > 0) {
      const values = data
        .filter((p) => !p.isPlaceholder)
        .map((p) => p.value);
      if (values.length === 0) return { yAxisOffset: 0, maxValue: undefined, noOfSections: 4 };
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      const rawRange = maxVal - minVal;
      const paddedRange = Math.max(4, rawRange * 1.2 || 4);
      let yOff = Math.max(0, (minVal + maxVal) / 2 - paddedRange / 2);
      let maxChart = yOff + paddedRange;
      if (maxChart < maxVal) {
        maxChart = maxVal;
        yOff = Math.max(0, maxChart - paddedRange);
      }
      return { yAxisOffset: yOff, maxValue: paddedRange, noOfSections: 4 };
    }
    return { yAxisOffset: 0, maxValue: undefined, noOfSections: 4 };
  }, [data, yDomain]);

  const { yAxisOffset, maxValue, noOfSections } = computedYAxis;
  const axisTextColor = rawColors.foregroundSecondary;
  const rulesColor = `${rawColors.foregroundMuted}26`;

  const handleSelectIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= data.length) return;
      onSelectPoint?.(data[index]);
    },
    [data, onSelectPoint],
  );

  // ── LINE CHART DATA ──
  const lineData = useMemo<lineDataItem[]>(() => {
    return data.map((point, index) => {
      const shouldShowLabel =
        index % xAxisLabelStep === 0 || index === data.length - 1;
      return {
        value: point.value,
        label: shouldShowLabel
          ? formatXAxisLabel(point.date, includeYearOnXAxis)
          : "",
        labelTextStyle: {
          color: axisTextColor,
          fontSize: 9,
          fontWeight: "600" as const,
        },
      };
    });
  }, [axisTextColor, data, includeYearOnXAxis, xAxisLabelStep]);

  // ── BAR CHART DATA ──
  // Pass raw values — BarChart internally subtracts yAxisOffset for bar heights.
  // Use a uniform labelWidth for all bars so label containers don't shift bar positions.
  const barLabelWidth = useMemo(() => {
    if (data.length <= 7) return barLayout.labelWidth;
    const slot = barLayout.barWidth + barLayout.spacing;
    return Math.max(slot, slot * xAxisLabelStep);
  }, [barLayout.barWidth, barLayout.labelWidth, barLayout.spacing, data.length, xAxisLabelStep]);

  const barData = useMemo<barDataItem[]>(() => {
    return data.map((point, index) => {
      const shouldShowLabel =
        index % xAxisLabelStep === 0 || index === data.length - 1;
      return {
        value: point.value,
        label: shouldShowLabel
          ? formatBarXAxisLabel(point.date, includeYearOnXAxis, data.length)
          : "",
        labelWidth: barLabelWidth,
        onPress: point.isPlaceholder
          ? undefined
          : () => handleSelectIndex(index),
        disablePress: point.isPlaceholder,
        frontColor: point.isPlaceholder
          ? "transparent"
          : `${rawColors.primary}D8`,
        showGradient: !point.isPlaceholder,
        gradientColor: point.isPlaceholder
          ? "transparent"
          : `${rawColors.primary}40`,
        barBorderTopLeftRadius: 6,
        barBorderTopRightRadius: 6,
        labelTextStyle: {
          color: axisTextColor,
          fontSize: 9,
          fontWeight: "600" as const,
        },
      };
    });
  }, [
    axisTextColor,
    barLabelWidth,
    data,
    handleSelectIndex,
    includeYearOnXAxis,
    rawColors.primary,
    xAxisLabelStep,
  ]);

  const yAxisTextStyle = useMemo(
    () => ({
      fontSize: 11,
      fontWeight: "600" as const,
      color: axisTextColor,
      ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
    }),
    [axisTextColor],
  );

  const xAxisLabelTextStyle = useMemo(
    () => ({
      fontSize: 9,
      fontWeight: "600" as const,
      color: axisTextColor,
    }),
    [axisTextColor],
  );

  // ── EMPTY STATE ──
  if (data.length === 0) {
    return (
      <View
        style={[
          styles.emptyContainer,
          {
            height: LINE_CHART_HEIGHT + 36,
            backgroundColor: rawColors.surfaceSecondary,
          },
        ]}
        onLayout={handleLayout}
      >
        <MaterialCommunityIcons
          name="chart-line"
          size={42}
          color={rawColors.foregroundMuted}
        />
        <Text
          style={[styles.emptyText, { color: rawColors.foregroundSecondary }]}
        >
          No metric history yet
        </Text>
      </View>
    );
  }

  // ── MEASURING ──
  if (containerWidth === 0) {
    return <View style={styles.wrapper} onLayout={handleLayout} />;
  }

  return (
    <View style={styles.wrapper} onLayout={handleLayout}>
      {variant === "line" ? (
        <View style={{ height: lineChartTotalHeight, overflow: "hidden" }}>
          <LineChart
            key={`line-${data.length}-${chartAreaWidth}-${data[0]?.date ?? 0}-${data[data.length - 1]?.date ?? 0}`}
            data={lineData}
            width={chartAreaWidth}
            height={LINE_CHART_HEIGHT}
            overflowTop={0}
            overflowBottom={0}
            curved
            curvature={0.15}
            areaChart
            startFillColor={rawColors.primary}
            endFillColor={rawColors.primary}
            startOpacity={0.35}
            endOpacity={0.05}
            color={rawColors.primary}
            thickness={3}
            dataPointsColor={rawColors.primary}
            dataPointsRadius={data.length <= 14 ? 5 : 0}
            hideDataPoints={data.length > 30}
            focusEnabled
            onFocus={(_item: lineDataItem, index: number) => {
              handleSelectIndex(index);
            }}
            focusedDataPointColor={rawColors.primary}
            focusedDataPointRadius={7}
            showStripOnFocus
            stripColor={`${rawColors.primary}30`}
            stripWidth={1.5}
            stripHeight={LINE_CHART_HEIGHT}
            unFocusOnPressOut={false}
            focusedDataPointIndex={selectedIndex >= 0 ? selectedIndex : undefined}
            disableScroll={lineLayout.disableScroll}
            scrollToEnd={!lineLayout.disableScroll}
            scrollAnimation={false}
            initialSpacing={lineLayout.initialSpacing}
            endSpacing={lineLayout.endSpacing}
            spacing={lineLayout.spacing}
            yAxisOffset={yAxisOffset}
            maxValue={maxValue}
            noOfSections={noOfSections}
            yAxisColor="transparent"
            yAxisThickness={0}
            yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
            yAxisTextStyle={yAxisTextStyle}
            formatYLabel={(label: string) => {
              const n = Number(label);
              if (yAxisOffset > 0 && n < yAxisOffset) return "";
              return formatYAxisText(n, formatYAxisLabel);
            }}
            xAxisColor={rawColors.border}
            xAxisThickness={1}
            xAxisLabelTextStyle={xAxisLabelTextStyle}
            xAxisLabelsHeight={22}
            rulesType="dashed"
            rulesColor={rulesColor}
            rulesThickness={1}
            dashWidth={4}
            dashGap={8}
            trimYAxisAtTop
            showScrollIndicator={false}
            bounces={false}
          />
        </View>
      ) : (
        <BarChart
          key={`bar-${data.length}-${chartAreaWidth}-${data[0]?.date ?? 0}-${data[data.length - 1]?.date ?? 0}`}
          data={barData}
          width={chartAreaWidth}
          height={BAR_CHART_HEIGHT}
          parentWidth={chartAreaWidth + Y_AXIS_LABEL_WIDTH}
          disableScroll={data.length <= 7}
          scrollToEnd={data.length > 7}
          scrollAnimation={false}
          initialSpacing={barLayout.initialSpacing}
          endSpacing={barLayout.endSpacing}
          spacing={barLayout.spacing}
          barWidth={barLayout.barWidth}
          minHeight={2}
          roundedTop
          barBorderTopLeftRadius={6}
          barBorderTopRightRadius={6}
          xAxisColor={rawColors.border}
          xAxisThickness={1}
          xAxisTextNumberOfLines={1}
          xAxisLabelsHeight={22}
          xAxisLabelTextStyle={xAxisLabelTextStyle}
          yAxisColor="transparent"
          yAxisThickness={0}
          yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
          yAxisTextStyle={yAxisTextStyle}
          yAxisOffset={yAxisOffset}
          maxValue={maxValue}
          noOfSections={noOfSections}
          formatYLabel={(label: string) => {
            const n = Number(label);
            if (yAxisOffset > 0 && n < yAxisOffset) return "";
            return formatYAxisText(n, formatYAxisLabel);
          }}
          hideRules={false}
          rulesColor={rulesColor}
          rulesThickness={1}
          dashGap={8}
          dashWidth={4}
          rulesType="dashed"
          showVerticalLines={false}
          focusBarOnPress
          focusedBarIndex={selectedIndex >= 0 ? selectedIndex : undefined}
          focusedBarConfig={{
            color: rawColors.primary,
            opacity: 1,
            borderRadius: 6,
            width: barLayout.barWidth,
          }}
          showScrollIndicator={false}
          bounces={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: WRAPPER_PADDING_H,
    paddingTop: 8,
    paddingBottom: 4,
  },
  emptyContainer: {
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "600",
  },
});
