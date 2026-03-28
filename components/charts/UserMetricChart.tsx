import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "../../lib/theme/ThemeContext";

export type UserMetricChartPoint = {
  id: number;
  date: number;
  value: number;
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

type RenderChartPoint = UserMetricChartPoint & {
  x: number;
  y: number;
  index: number;
  isInVisibleRange: boolean;
};

const Y_AXIS_WIDTH = 28;
const X_AXIS_HEIGHT = 32;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 12;
const PADDING_RIGHT = 16;
const PLOT_PADDING_X = 18;
const X_AXIS_MIN_TICKS = 3;
const X_AXIS_MAX_TICKS = 8;
const X_AXIS_MIN_LABEL_SPACING_PX = 72;
const MIN_VISIBLE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATA_POINT_RADIUS = 4;

function buildLinePath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    path += ` L ${points[index].x} ${points[index].y}`;
  }
  return path;
}

export default function UserMetricChart({
  data,
  variant,
  selectedPoint,
  onSelectPoint,
  height = 248,
  width: propWidth,
  unitLabel,
  formatYAxisLabel,
  instructionsText = "Pinch to zoom | Drag to scrub | Two fingers to pan",
  yDomain,
}: UserMetricChartProps) {
  const { rawColors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const containerWidth = propWidth ?? windowWidth - 32;
  const chartWidth = containerWidth - Y_AXIS_WIDTH - PADDING_RIGHT;
  const plotWidth = chartWidth - PLOT_PADDING_X * 2;
  const chartHeight = height - X_AXIS_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const sortedData = useMemo(
    () => [...data].sort((left, right) => left.date - right.date),
    [data]
  );

  const { minDate, maxDate, fullRangeMs } = useMemo(() => {
    if (sortedData.length === 0) {
      const now = Date.now();
      return { minDate: now, maxDate: now, fullRangeMs: MS_PER_DAY };
    }

    const firstDate = sortedData[0].date;
    const lastDate = sortedData[sortedData.length - 1].date;
    return {
      minDate: firstDate,
      maxDate: lastDate,
      fullRangeMs: Math.max(lastDate - firstDate, MS_PER_DAY),
    };
  }, [sortedData]);

  const [visibleStart, setVisibleStart] = useState(minDate);
  const [visibleEnd, setVisibleEnd] = useState(maxDate);
  const [scrubbedPoint, setScrubbedPoint] = useState<RenderChartPoint | null>(null);

  useEffect(() => {
    setVisibleStart(minDate);
    setVisibleEnd(maxDate);
  }, [maxDate, minDate]);

  const visibleRangeMs = visibleEnd - visibleStart;
  const isZoomed = visibleRangeMs < fullRangeMs * 0.99;

  const { paddedMin, paddedMax, yAxisLabels } = useMemo(() => {
    if (sortedData.length === 0) {
      return { paddedMin: 0, paddedMax: 5, yAxisLabels: [] as { value: number; y: number }[] };
    }

    if (yDomain) {
      const labelCount = 5;
      const labelStep = (yDomain.max - yDomain.min) / (labelCount - 1 || 1);

      return {
        paddedMin: yDomain.min,
        paddedMax: yDomain.max,
        yAxisLabels: Array.from({ length: labelCount }, (_, index) => {
          const value = yDomain.min + (labelStep * index);
          return {
            value,
            y: chartHeight - ((value - yDomain.min) / (yDomain.max - yDomain.min || 1)) * chartHeight,
          };
        }),
      };
    }

    const values = sortedData.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || Math.max(1, maxValue * 0.2 || 1);
    const lowerPadding = variant === "bar" ? 0 : range * 0.15;
    const paddedLow = Math.max(0, minValue - lowerPadding);
    const paddedHigh = maxValue + (range * 0.18);
    const labelCount = 5;
    const labelStep = (paddedHigh - paddedLow) / (labelCount - 1);

    return {
      paddedMin: paddedLow,
      paddedMax: paddedHigh,
      yAxisLabels: Array.from({ length: labelCount }, (_, index) => {
        const value = paddedLow + (labelStep * index);
        return {
          value,
          y: chartHeight - ((value - paddedLow) / (paddedHigh - paddedLow || 1)) * chartHeight,
        };
      }),
    };
  }, [chartHeight, sortedData, variant, yDomain]);

  const dateToX = useCallback((date: number) => {
    if (visibleEnd === visibleStart) {
      return PLOT_PADDING_X + (plotWidth / 2);
    }
    const ratio = (date - visibleStart) / (visibleEnd - visibleStart);
    return PLOT_PADDING_X + (ratio * plotWidth);
  }, [plotWidth, visibleEnd, visibleStart]);

  const valueToY = useCallback((value: number) => {
    return chartHeight - (((value - paddedMin) / (paddedMax - paddedMin || 1)) * chartHeight);
  }, [chartHeight, paddedMax, paddedMin]);

  const renderPoints = useMemo<RenderChartPoint[]>(() => {
    const buffer = (visibleEnd - visibleStart) * 0.1;
    return sortedData
      .filter((point) => point.date >= visibleStart - buffer && point.date <= visibleEnd + buffer)
      .map((point, index) => ({
        ...point,
        x: dateToX(point.date),
        y: valueToY(point.value),
        index,
        isInVisibleRange: point.date >= visibleStart && point.date <= visibleEnd,
      }));
  }, [dateToX, sortedData, valueToY, visibleEnd, visibleStart]);

  const visibleRenderPoints = useMemo(
    () => renderPoints.filter((point) => point.isInVisibleRange),
    [renderPoints]
  );

  const linePath = useMemo(
    () => buildLinePath(renderPoints),
    [renderPoints]
  );

  const barWidth = useMemo(() => {
    if (visibleRenderPoints.length <= 1) {
      return Math.max(16, Math.min(26, plotWidth * 0.18));
    }

    let minGap = Number.POSITIVE_INFINITY;
    for (let index = 1; index < visibleRenderPoints.length; index += 1) {
      minGap = Math.min(minGap, visibleRenderPoints[index].x - visibleRenderPoints[index - 1].x);
    }

    if (!Number.isFinite(minGap)) {
      return 20;
    }

    return Math.max(12, Math.min(24, minGap * 0.6));
  }, [plotWidth, visibleRenderPoints]);

  const selectedRenderPoint = useMemo(() => {
    const activePoint = scrubbedPoint ?? selectedPoint ?? null;
    if (!activePoint) {
      return null;
    }

    return renderPoints.find(
      (point) => point.id === activePoint.id && point.date === activePoint.date
    ) ?? null;
  }, [renderPoints, scrubbedPoint, selectedPoint]);

  const baseXAxisTickCount = useMemo(() => {
    const ticks = Math.floor(plotWidth / X_AXIS_MIN_LABEL_SPACING_PX) + 1;
    return Math.max(X_AXIS_MIN_TICKS, Math.min(ticks, X_AXIS_MAX_TICKS));
  }, [plotWidth]);

  const xAxisLabels = useMemo(() => {
    if (sortedData.length === 0) return [];

    if (visibleEnd <= visibleStart) {
      return [{ date: visibleStart, x: dateToX(visibleStart) }];
    }

    const rangeMs = visibleEnd - visibleStart;
    const maxDayTicks = Math.floor(rangeMs / MS_PER_DAY) + 1;
    const tickCount = Math.max(2, Math.min(baseXAxisTickCount, maxDayTicks));

    if (tickCount === 2) {
      return [
        { date: visibleStart, x: dateToX(visibleStart) },
        { date: visibleEnd, x: dateToX(visibleEnd) },
      ];
    }

    const stepMs = rangeMs / (tickCount - 1);
    return Array.from({ length: tickCount }, (_, index) => {
      const date = index === tickCount - 1 ? visibleEnd : visibleStart + (stepMs * index);
      return { date, x: dateToX(date) };
    });
  }, [baseXAxisTickCount, dateToX, sortedData.length, visibleEnd, visibleStart]);

  const showYearOnXAxis = useMemo(
    () => new Date(visibleStart).getFullYear() !== new Date(visibleEnd).getFullYear(),
    [visibleEnd, visibleStart]
  );

  const formatDate = useCallback((timestamp: number) => {
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
    };
    if (showYearOnXAxis) {
      options.year = "2-digit";
    }
    return new Date(timestamp).toLocaleDateString("en-US", options);
  }, [showYearOnXAxis]);

  const getClosestVisiblePointByX = useCallback((tapX: number) => {
    if (visibleRenderPoints.length === 0) {
      return null;
    }

    let closestPoint = visibleRenderPoints[0];
    let closestDistance = Math.abs(closestPoint.x - tapX);

    for (const point of visibleRenderPoints) {
      const distance = Math.abs(point.x - tapX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPoint = point;
      }
    }

    return closestPoint;
  }, [visibleRenderPoints]);

  const selectPoint = useCallback((point: RenderChartPoint | null) => {
    if (!point) {
      return;
    }
    onSelectPoint?.(point);
  }, [onSelectPoint]);

  const beginScrub = useCallback((x: number) => {
    const closestPoint = getClosestVisiblePointByX(x);
    setScrubbedPoint(closestPoint);
    selectPoint(closestPoint);
  }, [getClosestVisiblePointByX, selectPoint]);

  const updateScrubbedPoint = useCallback((x: number) => {
    const closestPoint = getClosestVisiblePointByX(x);
    setScrubbedPoint(closestPoint);
    selectPoint(closestPoint);
  }, [getClosestVisiblePointByX, selectPoint]);

  const endScrub = useCallback(() => {
    setScrubbedPoint(null);
  }, []);

  const updateVisibleRange = useCallback((start: number, end: number) => {
    setVisibleStart(start);
    setVisibleEnd(end);
  }, []);

  const scrubBlocked = useSharedValue(false);
  const initialRangeMs = useSharedValue(fullRangeMs);
  const anchorDateMs = useSharedValue((minDate + maxDate) / 2);
  const pinchStartStart = useSharedValue(minDate);
  const pinchStartEnd = useSharedValue(maxDate);
  const panStartStart = useSharedValue(minDate);
  const panStartEnd = useSharedValue(maxDate);
  const touch1PrevX = useSharedValue(0);
  const touch2PrevX = useSharedValue(0);
  const initialDistance = useSharedValue(0);
  const initialFocalX = useSharedValue(0);
  const gestureMode = useSharedValue<"undecided" | "zoom" | "pan">("undecided");

  const twoFingerGesture = Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .minDistance(0)
    .onBegin(() => {
      scrubBlocked.value = true;
      gestureMode.value = "undecided";
      runOnJS(endScrub)();
    })
    .onTouchesDown((event: any) => {
      if (!event.allTouches || event.allTouches.length < 2) {
        return;
      }

      const firstTouch = event.allTouches[0];
      const secondTouch = event.allTouches[1];

      touch1PrevX.value = firstTouch.x;
      touch2PrevX.value = secondTouch.x;
      initialDistance.value = Math.abs(firstTouch.x - secondTouch.x);
      initialFocalX.value = (firstTouch.x + secondTouch.x) / 2;
      initialRangeMs.value = visibleEnd - visibleStart;
      pinchStartStart.value = visibleStart;
      pinchStartEnd.value = visibleEnd;
      panStartStart.value = visibleStart;
      panStartEnd.value = visibleEnd;

      const focalX = (firstTouch.x + secondTouch.x) / 2;
      const focalRatio = Math.max(0, Math.min(1, (focalX - PLOT_PADDING_X) / plotWidth));
      anchorDateMs.value = visibleStart + (focalRatio * (visibleEnd - visibleStart));
    })
    .onTouchesMove((event: any) => {
      if (!event.allTouches || event.allTouches.length < 2) {
        return;
      }

      const firstTouch = event.allTouches[0];
      const secondTouch = event.allTouches[1];
      const delta1 = firstTouch.x - touch1PrevX.value;
      const delta2 = secondTouch.x - touch2PrevX.value;

      touch1PrevX.value = firstTouch.x;
      touch2PrevX.value = secondTouch.x;

      if (gestureMode.value === "undecided") {
        const minMovement = 3;
        const hasMovement1 = Math.abs(delta1) > minMovement;
        const hasMovement2 = Math.abs(delta2) > minMovement;

        if (hasMovement1 && hasMovement2) {
          const sameDirection = (delta1 > 0 && delta2 > 0) || (delta1 < 0 && delta2 < 0);
          gestureMode.value = sameDirection ? "pan" : "zoom";
        } else if (hasMovement1 || hasMovement2) {
          const currentDistance = Math.abs(firstTouch.x - secondTouch.x);
          const distanceChange = Math.abs(currentDistance - initialDistance.value);
          gestureMode.value = distanceChange > 8 ? "zoom" : "pan";
        }
      }

      if (gestureMode.value === "pan") {
        const currentRange = panStartEnd.value - panStartStart.value;
        if (currentRange >= fullRangeMs * 0.99) {
          return;
        }

        const currentFocalX = (firstTouch.x + secondTouch.x) / 2;
        const totalTranslation = currentFocalX - initialFocalX.value;
        const pixelsPerMs = plotWidth / currentRange;
        const panOffsetMs = -totalTranslation / pixelsPerMs;

        let nextStart = panStartStart.value + panOffsetMs;
        let nextEnd = panStartEnd.value + panOffsetMs;

        if (nextStart < minDate) {
          nextStart = minDate;
          nextEnd = minDate + currentRange;
        }
        if (nextEnd > maxDate) {
          nextEnd = maxDate;
          nextStart = maxDate - currentRange;
        }

        runOnJS(updateVisibleRange)(nextStart, nextEnd);
      } else if (gestureMode.value === "zoom") {
        const currentDistance = Math.abs(firstTouch.x - secondTouch.x);
        const scale = currentDistance / Math.max(initialDistance.value, 1);
        const minRangeMs = MIN_VISIBLE_DAYS * MS_PER_DAY;
        const nextRangeMs = Math.max(minRangeMs, Math.min(fullRangeMs, initialRangeMs.value / scale));
        const anchorRatio = (anchorDateMs.value - pinchStartStart.value) / (pinchStartEnd.value - pinchStartStart.value || 1);

        let nextStart = anchorDateMs.value - (anchorRatio * nextRangeMs);
        let nextEnd = nextStart + nextRangeMs;

        if (nextStart < minDate) {
          nextStart = minDate;
          nextEnd = minDate + nextRangeMs;
        }
        if (nextEnd > maxDate) {
          nextEnd = maxDate;
          nextStart = maxDate - nextRangeMs;
        }

        runOnJS(updateVisibleRange)(nextStart, nextEnd);
      }
    })
    .onFinalize(() => {
      gestureMode.value = "undecided";
    });

  const scrubGesture = Gesture.Pan()
    .minPointers(1)
    .minDistance(0)
    .onBegin((event: any) => {
      scrubBlocked.value = false;
      runOnJS(beginScrub)(event.x);
    })
    .onTouchesDown((event: any) => {
      if (event.allTouches && event.allTouches.length > 1) {
        scrubBlocked.value = true;
        runOnJS(endScrub)();
      }
    })
    .onUpdate((event: any) => {
      if (!scrubBlocked.value && event.numberOfPointers === 1) {
        runOnJS(updateScrubbedPoint)(event.x);
      } else if (event.numberOfPointers > 1) {
        scrubBlocked.value = true;
      }
    })
    .onFinalize(() => {
      runOnJS(endScrub)();
    });

  const composedGesture = Gesture.Simultaneous(twoFingerGesture, scrubGesture);

  if (sortedData.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height, backgroundColor: rawColors.surfaceSecondary }]}>
        <MaterialCommunityIcons name="chart-line" size={42} color={rawColors.foregroundMuted} />
        <Text style={[styles.emptyText, { color: rawColors.foregroundSecondary }]}>
          No metric history yet
        </Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.wrapper}>
      <View style={[styles.container, { backgroundColor: rawColors.surfaceSecondary }]}>
        {isZoomed ? (
          <View style={[styles.zoomIndicator, { backgroundColor: rawColors.surface }]}>
            <Text style={[styles.zoomText, { color: rawColors.foregroundSecondary }]}>
              {Math.round((fullRangeMs / visibleRangeMs) * 100)}%
            </Text>
          </View>
        ) : null}

        <View style={styles.chartRow}>
          <View style={[styles.yAxis, { width: Y_AXIS_WIDTH }]}>
            <Svg width={Y_AXIS_WIDTH} height={chartHeight + PADDING_TOP + PADDING_BOTTOM}>
              {yAxisLabels.map((label, index) => (
                <SvgText
                  key={index}
                  x={Y_AXIS_WIDTH - 4}
                  y={label.y + PADDING_TOP + 4}
                  fontSize={10}
                  fill={rawColors.foregroundSecondary}
                  textAnchor="end"
                >
                  {formatYAxisLabel ? formatYAxisLabel(label.value) : label.value.toFixed(0)}
                </SvgText>
              ))}
            </Svg>
          </View>

          <GestureDetector gesture={composedGesture}>
            <View style={[styles.chartArea, { width: chartWidth + PADDING_RIGHT }]}>
              <View style={styles.chartClip}>
                <Svg width={chartWidth} height={chartHeight + PADDING_TOP + PADDING_BOTTOM}>
                  {yAxisLabels.map((label, index) => (
                    <Line
                      key={`grid-${index}`}
                      x1={0}
                      y1={label.y + PADDING_TOP}
                      x2={chartWidth}
                      y2={label.y + PADDING_TOP}
                      stroke={rawColors.foregroundMuted}
                      strokeWidth={1}
                      strokeDasharray="4,4"
                      opacity={0.24}
                    />
                  ))}

                  {selectedRenderPoint ? (
                    <Line
                      x1={selectedRenderPoint.x}
                      y1={PADDING_TOP}
                      x2={selectedRenderPoint.x}
                      y2={chartHeight + PADDING_TOP}
                      stroke={rawColors.primary}
                      strokeWidth={1.5}
                      strokeDasharray="5,5"
                      opacity={0.28}
                    />
                  ) : null}

                  {variant === "line" ? (
                    <>
                      {linePath ? (
                        <Path
                          d={linePath}
                          fill="none"
                          stroke={rawColors.primary}
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          transform={`translate(0, ${PADDING_TOP})`}
                        />
                      ) : null}

                      {renderPoints.map((point) => (
                        <Circle
                          key={`${point.id}-${point.date}`}
                          cx={point.x}
                          cy={point.y + PADDING_TOP}
                          r={DATA_POINT_RADIUS}
                          fill={rawColors.primary}
                          stroke={rawColors.surface}
                          strokeWidth={2}
                        />
                      ))}
                    </>
                  ) : (
                    <>
                      {renderPoints.map((point) => (
                        <Rect
                          key={`${point.id}-${point.date}`}
                          x={point.x - (barWidth / 2)}
                          y={point.y + PADDING_TOP}
                          width={barWidth}
                          height={Math.max(4, chartHeight - point.y)}
                          rx={Math.min(8, barWidth / 3)}
                          fill={`${rawColors.primary}D6`}
                        />
                      ))}
                    </>
                  )}

                  {selectedRenderPoint ? (
                    variant === "line" ? (
                      <Circle
                        cx={selectedRenderPoint.x}
                        cy={selectedRenderPoint.y + PADDING_TOP}
                        r={DATA_POINT_RADIUS + 5}
                        fill="none"
                        stroke={rawColors.primary}
                        strokeWidth={2.5}
                        opacity={0.55}
                      />
                    ) : (
                      <Rect
                        x={selectedRenderPoint.x - (barWidth / 2) - 2}
                        y={selectedRenderPoint.y + PADDING_TOP - 2}
                        width={barWidth + 4}
                        height={Math.max(8, chartHeight - selectedRenderPoint.y + 2)}
                        rx={Math.min(10, barWidth / 3 + 2)}
                        fill="none"
                        stroke={rawColors.primary}
                        strokeWidth={2.5}
                        opacity={0.82}
                      />
                    )
                  ) : null}
                </Svg>
              </View>

              <View style={styles.xAxisContainer}>
                <Svg width={chartWidth} height={X_AXIS_HEIGHT}>
                  {xAxisLabels.map((point, index) => (
                    <SvgText
                      key={`x-axis-${index}`}
                      x={point.x}
                      y={18}
                      fontSize={9}
                      fill={rawColors.foregroundSecondary}
                      textAnchor={
                        index === 0
                          ? "start"
                          : index === xAxisLabels.length - 1
                            ? "end"
                            : "middle"
                      }
                    >
                      {formatDate(point.date)}
                    </SvgText>
                  ))}
                </Svg>
              </View>
            </View>
          </GestureDetector>
        </View>

        <View style={styles.footerRow}>
          <Text style={[styles.unitLabel, { color: rawColors.foregroundMuted }]}>
            {unitLabel ?? ""}
          </Text>
          <Text style={[styles.instructions, { color: rawColors.foregroundMuted }]}>
            {instructionsText}
          </Text>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    borderRadius: 18,
    paddingTop: 14,
    paddingRight: 12,
    paddingBottom: 10,
  },
  chartRow: {
    flexDirection: "row",
  },
  yAxis: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  chartArea: {
    overflow: "hidden",
  },
  chartClip: {
    overflow: "hidden",
  },
  xAxisContainer: {},
  zoomIndicator: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 10,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  zoomText: {
    fontSize: 11,
    fontWeight: "700",
  },
  footerRow: {
    marginTop: 6,
    alignItems: "center",
  },
  unitLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  instructions: {
    marginTop: 4,
    fontSize: 11,
    textAlign: "center",
  },
  emptyContainer: {
    borderRadius: 18,
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
