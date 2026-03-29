import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import {
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  BarChart,
  type barDataItem,
} from "react-native-gifted-charts";
import Svg, {
  Circle,
  Line as SvgLine,
  Path,
  Text as SvgText,
} from "react-native-svg";
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

const Y_AXIS_LABEL_WIDTH = 32;
const WRAPPER_H_PADDING = 12;
const MIN_CHART_WIDTH = 180;

function getBarChartLayout(pointCount: number, availableWidth: number) {
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
    const spacing = Math.max(8, Math.floor(totalGapSpace / (pointCount + 1)));
    const initialSpacing = spacing;
    const endSpacing = availableWidth - (initialSpacing + totalBarWidth + (pointCount - 1) * spacing);
    const labelWidth = Math.max(28, Math.min(52, Math.floor(availableWidth / pointCount)));

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
    initialSpacing: scrollable ? 10 : Math.max(8, Math.floor((availableWidth - contentWidth) / 2)),
    endSpacing: scrollable ? 24 : 0,
    labelWidth: barWidth + spacing,
  };
}

function getLineChartLayout(pointCount: number, availableWidth: number) {
  if (pointCount <= 1) {
    const centeredSpacing = Math.max(24, Math.floor(availableWidth / 2));
    return {
      adjustToWidth: false,
      disableScroll: true,
      initialSpacing: centeredSpacing,
      endSpacing: centeredSpacing,
      spacing: 42,
    };
  }

  if (pointCount <= 5) {
    const spacing = Math.min(88, Math.max(48, Math.floor(availableWidth / Math.max(1, pointCount - 1))));
    const contentWidth = (pointCount - 1) * spacing;
    const sidePadding = Math.max(14, Math.floor((availableWidth - contentWidth) / 2));

    return {
      adjustToWidth: false,
      disableScroll: true,
      initialSpacing: sidePadding,
      endSpacing: sidePadding,
      spacing,
    };
  }

  if (pointCount <= 7) {
    const spacing = Math.max(36, Math.floor((availableWidth - 20) / Math.max(1, pointCount - 1)));
    return {
      adjustToWidth: false,
      disableScroll: true,
      initialSpacing: 10,
      endSpacing: 10,
      spacing,
    };
  }

  return {
    adjustToWidth: false,
    disableScroll: false,
    initialSpacing: 8,
    endSpacing: 12,
    spacing: pointCount > 24 ? 34 : 42,
  };
}

function buildLinePath(points: { x: number; y: number }[]) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  return points.map((point, index) =>
    `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
  ).join(" ");
}

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

function formatBarXAxisLabel(timestamp: number, includeYear: boolean, pointCount: number) {
  if (pointCount <= 7) {
    return new Date(timestamp).toLocaleDateString("en-US", { weekday: "short" });
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

function formatYAxisText(value: number, formatter?: (value: number) => string) {
  if (formatter) {
    return formatter(value);
  }

  return `${Math.round(value)}`;
}

export default function UserMetricChart({
  data,
  variant,
  selectedPoint,
  onSelectPoint,
  height,
  width: propWidth,
  unitLabel,
  formatYAxisLabel,
  instructionsText,
  yDomain,
}: UserMetricChartProps) {
  const { rawColors } = useTheme();
  const [measuredWidth, setMeasuredWidth] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - measuredWidth) > 1) {
      setMeasuredWidth(w);
    }
  }, [measuredWidth]);

  const containerWidth = propWidth ?? measuredWidth;
  const resolvedHeight = height ?? (variant === "bar" ? 196 : 208);
  const chartAreaWidth = Math.max(
    MIN_CHART_WIDTH,
    containerWidth - Y_AXIS_LABEL_WIDTH - WRAPPER_H_PADDING * 2,
  );
  const chartHeight = Math.max(
    variant === "bar" ? 148 : 156,
    resolvedHeight - (variant === "bar" ? 56 : 60),
  );
  const xAxisLabelStep = getXAxisLabelStep(data.length);
  const barChartLayout = useMemo(() => getBarChartLayout(data.length, chartAreaWidth), [chartAreaWidth, data.length]);
  const lineChartLayout = useMemo(() => getLineChartLayout(data.length, chartAreaWidth), [chartAreaWidth, data.length]);
  const includeYearOnXAxis = useMemo(() => {
    if (data.length <= 1) {
      return false;
    }

    return new Date(data[0].date).getFullYear() !== new Date(data[data.length - 1].date).getFullYear();
  }, [data]);

  const selectedIndex = useMemo(() => {
    if (!selectedPoint) {
      return -1;
    }

    return data.findIndex(
      (point) => point.id === selectedPoint.id && point.date === selectedPoint.date
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

    if (variant === "line" && data.length > 0) {
      const values = data.map((point) => point.value);
      const minPointValue = Math.min(...values);
      const maxPointValue = Math.max(...values);
      const rawRange = maxPointValue - minPointValue;
      const paddedRange = Math.max(4, rawRange * 1.2 || 4);
      let yAxisOffset = Math.max(0, ((minPointValue + maxPointValue) / 2) - (paddedRange / 2));
      let maxChartValue = yAxisOffset + paddedRange;

      if (maxChartValue < maxPointValue) {
        maxChartValue = maxPointValue;
        yAxisOffset = Math.max(0, maxChartValue - paddedRange);
      }

      const noOfSections = 4;

      return {
        yAxisOffset,
        maxValue: paddedRange,
        noOfSections,
      };
    }

    return {
      yAxisOffset: 0,
      maxValue: undefined,
      noOfSections: 4,
    };
  }, [data, variant, yDomain]);
  const { yAxisOffset, maxValue, noOfSections } = computedYAxis;
  const axisTextColor = rawColors.foregroundSecondary;
  const rulesColor = `${rawColors.foregroundMuted}26`;
  const baseInstructions = variant === "bar"
    ? "Tap a bar to inspect | Scroll for older data"
    : "Tap a point to inspect | Scroll for older data";

  const handleSelectIndex = useCallback((index: number) => {
    if (index < 0 || index >= data.length) {
      return;
    }

    onSelectPoint?.(data[index]);
  }, [data, onSelectPoint]);

  const giftedBarData = useMemo<barDataItem[]>(() => {
    const labeledWidth = Math.max(
      barChartLayout.labelWidth,
      Math.min(52, barChartLayout.spacing * xAxisLabelStep),
    );

    return data.map((point, index) => {
      const shouldShowLabel = index % xAxisLabelStep === 0 || index === data.length - 1;

      return {
        value: point.value - yAxisOffset,
        label: shouldShowLabel ? formatBarXAxisLabel(point.date, includeYearOnXAxis, data.length) : "",
        onPress: point.isPlaceholder ? undefined : () => handleSelectIndex(index),
        disablePress: point.isPlaceholder,
        frontColor: point.isPlaceholder ? "transparent" : `${rawColors.primary}D8`,
        labelWidth: shouldShowLabel ? labeledWidth : barChartLayout.labelWidth,
        labelTextStyle: {
          color: axisTextColor,
          fontSize: 9,
          fontWeight: "600",
        },
      };
    });
  }, [
    axisTextColor,
    barChartLayout.labelWidth,
    barChartLayout.spacing,
    data,
    handleSelectIndex,
    includeYearOnXAxis,
    rawColors.primary,
    xAxisLabelStep,
    yAxisOffset,
  ]);

  const linePlotTop = 10;
  const lineLabelAreaHeight = 28;
  const linePlotHeight = Math.max(116, chartHeight - lineLabelAreaHeight);
  const lineDomainMax = yAxisOffset + (maxValue ?? Math.max(...data.map((point) => point.value), 0));
  const lineScrollableWidth = useMemo(() => {
    if (data.length <= 1) {
      return chartAreaWidth;
    }

    const lastX = lineChartLayout.initialSpacing + (lineChartLayout.spacing * (data.length - 1));
    return Math.max(chartAreaWidth, lastX + lineChartLayout.endSpacing);
  }, [chartAreaWidth, data.length, lineChartLayout.endSpacing, lineChartLayout.initialSpacing, lineChartLayout.spacing]);
  const linePoints = useMemo(() => {
    const range = Math.max(1, lineDomainMax - yAxisOffset);

    return data.map((point, index) => {
      const x = data.length <= 1
        ? Math.floor(lineScrollableWidth / 2)
        : lineChartLayout.initialSpacing + (index * lineChartLayout.spacing);
      const ratio = (point.value - yAxisOffset) / range;
      const y = linePlotTop + ((1 - ratio) * linePlotHeight);

      return {
        ...point,
        x,
        y,
      };
    });
  }, [
    data,
    lineChartLayout.initialSpacing,
    lineChartLayout.spacing,
    lineDomainMax,
    linePlotHeight,
    lineScrollableWidth,
    yAxisOffset,
  ]);
  const linePath = useMemo(
    () => buildLinePath(linePoints.map((point) => ({ x: point.x, y: point.y }))),
    [linePoints]
  );
  const lineSelectedPoint = selectedIndex >= 0 ? linePoints[selectedIndex] ?? null : null;
  const lineYLabels = useMemo(() => {
    return Array.from({ length: noOfSections + 1 }, (_, index) => {
      const ratio = index / noOfSections;
      return {
        value: yAxisOffset + (ratio * (lineDomainMax - yAxisOffset)),
        y: linePlotTop + linePlotHeight - (ratio * linePlotHeight),
      };
    });
  }, [lineDomainMax, linePlotHeight, linePlotTop, noOfSections, yAxisOffset]);

  if (data.length === 0) {
    return (
      <View
        style={[styles.emptyContainer, { height: resolvedHeight, backgroundColor: rawColors.surfaceSecondary }]}
        onLayout={handleLayout}
      >
        <MaterialCommunityIcons name="chart-line" size={42} color={rawColors.foregroundMuted} />
        <Text style={[styles.emptyText, { color: rawColors.foregroundSecondary }]}>
          No metric history yet
        </Text>
      </View>
    );
  }

  if (containerWidth === 0) {
    return <View style={styles.wrapper} onLayout={handleLayout} />;
  }

  return (
    <View
      style={[styles.wrapper, { backgroundColor: rawColors.surfaceSecondary }]}
      onLayout={handleLayout}
    >
      {variant === "line" ? (
        <View style={styles.lineChartRow}>
          <View style={[styles.lineYAxisColumn, { height: linePlotTop + linePlotHeight }]}>
            {lineYLabels.map((label, index) => (
              <Text
                key={`y-${index}`}
                style={[
                  styles.lineYAxisLabel,
                  {
                    color: axisTextColor,
                    top: label.y - 10,
                  },
                ]}
              >
                {formatYAxisText(label.value, formatYAxisLabel)}
              </Text>
            ))}
          </View>

          <View style={styles.lineChartArea}>
            <ScrollView
              horizontal
              scrollEnabled={!lineChartLayout.disableScroll}
              showsHorizontalScrollIndicator={false}
              bounces={false}
            >
              <Svg width={lineScrollableWidth} height={linePlotTop + linePlotHeight + lineLabelAreaHeight}>
                {lineYLabels.map((label, index) => (
                  <SvgLine
                    key={`rule-${index}`}
                    x1={0}
                    y1={label.y}
                    x2={lineScrollableWidth}
                    y2={label.y}
                    stroke={rulesColor}
                    strokeWidth={1}
                    strokeDasharray="4 8"
                  />
                ))}

                {lineSelectedPoint ? (
                  <SvgLine
                    x1={lineSelectedPoint.x}
                    y1={linePlotTop}
                    x2={lineSelectedPoint.x}
                    y2={linePlotTop + linePlotHeight}
                    stroke={`${rawColors.primary}4D`}
                    strokeWidth={1.5}
                  />
                ) : null}

                <SvgLine
                  x1={0}
                  y1={linePlotTop + linePlotHeight}
                  x2={lineScrollableWidth}
                  y2={linePlotTop + linePlotHeight}
                  stroke={rawColors.border}
                  strokeWidth={1}
                />

                {linePath ? (
                  <Path
                    d={linePath}
                    fill="none"
                    stroke={rawColors.primary}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}

                {linePoints.map((point, index) => {
                  const isSelected = selectedIndex === index;
                  return (
                    <Circle
                      key={`${point.id}-${point.date}`}
                      cx={point.x}
                      cy={point.y}
                      r={isSelected ? 6.5 : data.length <= 2 ? 5 : 4}
                      fill={rawColors.primary}
                      stroke={rawColors.surfaceSecondary}
                      strokeWidth={isSelected ? 3 : 2}
                      onPress={() => handleSelectIndex(index)}
                    />
                  );
                })}

                {linePoints.map((point, index) => {
                  const shouldShowLabel = index % xAxisLabelStep === 0 || index === data.length - 1;
                  if (!shouldShowLabel) {
                    return null;
                  }

                  return (
                    <SvgText
                      key={`x-${point.id}-${point.date}`}
                      x={point.x}
                      y={linePlotTop + linePlotHeight + 18}
                      fill={axisTextColor}
                      fontSize="9"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {formatXAxisLabel(point.date, includeYearOnXAxis)}
                    </SvgText>
                  );
                })}
              </Svg>
            </ScrollView>
          </View>
        </View>
      ) : (
        <View style={styles.barChartContainer}>
          <BarChart
            key={`bar-${data.length}-${chartAreaWidth}-${data[0]?.date ?? 0}-${data[data.length - 1]?.date ?? 0}`}
            data={giftedBarData}
            width={chartAreaWidth}
            height={chartHeight}
            parentWidth={chartAreaWidth + Y_AXIS_LABEL_WIDTH}
            disableScroll={data.length <= 7}
            scrollToEnd={data.length > 7}
            scrollAnimation={false}
            initialSpacing={barChartLayout.initialSpacing}
            endSpacing={barChartLayout.endSpacing}
            spacing={barChartLayout.spacing}
            barWidth={barChartLayout.barWidth}
            minHeight={6}
            roundedTop={false}
            roundedBottom={false}
            barBorderRadius={4}
            xAxisColor={rawColors.border}
            xAxisThickness={1}
            xAxisTextNumberOfLines={1}
            xAxisLabelsHeight={24}
            xAxisLabelTextStyle={[styles.axisText, { color: axisTextColor }]}
            labelsDistanceFromXaxis={6}
            yAxisColor="transparent"
            yAxisThickness={0}
            yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
            yAxisTextStyle={[styles.axisText, { color: axisTextColor }]}
            yAxisOffset={yAxisOffset}
            maxValue={maxValue}
            noOfSections={noOfSections}
            formatYLabel={(label) => {
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
            trimYAxisAtTop
            showVerticalLines={false}
            focusBarOnPress
            focusedBarIndex={selectedIndex >= 0 ? selectedIndex : undefined}
            focusedBarConfig={{
              color: rawColors.primary,
              opacity: 1,
              borderRadius: 4,
              width: barChartLayout.barWidth,
            }}
            showScrollIndicator={false}
            bounces={false}
          />
        </View>
      )}

      <View style={styles.footerRow}>
        <Text style={[styles.unitLabel, { color: rawColors.foregroundMuted }]}>
          {unitLabel ?? ""}
        </Text>
        <Text style={[styles.instructions, { color: rawColors.foregroundMuted }]}>
          {instructionsText ?? baseInstructions}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    paddingHorizontal: WRAPPER_H_PADDING,
    paddingTop: 12,
    paddingBottom: 10,
    overflow: "hidden",
  },
  axisText: {
    fontSize: 9,
    fontWeight: "600",
  },
  lineChartRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  lineChartArea: {
    flex: 1,
    overflow: "hidden",
  },
  lineYAxisColumn: {
    width: Y_AXIS_LABEL_WIDTH,
    position: "relative",
  },
  lineYAxisLabel: {
    position: "absolute",
    right: 2,
    fontSize: 9,
    fontWeight: "600",
  },
  barChartContainer: {
    overflow: "hidden",
    marginLeft: -4,
  },
  footerRow: {
    marginTop: 8,
    alignItems: "center",
  },
  unitLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  instructions: {
    marginTop: 3,
    fontSize: 10,
    textAlign: "center",
    opacity: 0.7,
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
