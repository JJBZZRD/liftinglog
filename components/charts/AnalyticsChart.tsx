/**
 * Analytics Chart Component
 *
 * Interactive chart with:
 * - Pinch to zoom (horizontal domain-based, not scale transform)
 * - Pan when zoomed (shifts visible date range)
 * - Fixed Y-axis during pan
 * - Data point tap interaction with gesture guards
 * - Optional trend line overlay
 * - Fullscreen button
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { useTheme } from "../../lib/theme/ThemeContext";
import type { SessionDataPoint } from "../../lib/utils/analytics";

interface AnalyticsChartProps {
  data: SessionDataPoint[];
  trendLineData?: SessionDataPoint[];
  width?: number;
  height?: number;
  unit: string;
  onDataPointPress?: (point: SessionDataPoint) => void;
  onFullscreenPress?: () => void;
  /** Called when a gesture (pinch/pan) starts - use to disable parent scrolling/swiping */
  onGestureStart?: () => void;
  /** Called when a gesture (pinch/pan) ends - use to re-enable parent scrolling/swiping */
  onGestureEnd?: () => void;
  /** Point to highlight (e.g., when tapped) */
  selectedPoint?: SessionDataPoint | null;
}

// Layout constants
const Y_AXIS_WIDTH = 50;
const X_AXIS_HEIGHT = 30;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 12; // Space for bottom Y-axis label
const PADDING_RIGHT = 16;
const PLOT_PADDING_X = 16; // Padding inside plot area for first/last points

// Zoom constraints
const MIN_VISIBLE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Interaction constants
const DATA_POINT_RADIUS = 6;
const DATA_POINT_HIT_RADIUS = 30; // Increased for better edge-point tapping
const GESTURE_COOLDOWN_MS = 200;

export default function AnalyticsChart({
  data,
  trendLineData,
  width: propWidth,
  height = 250,
  unit,
  onDataPointPress,
  onFullscreenPress,
  onGestureStart,
  onGestureEnd,
  selectedPoint,
}: AnalyticsChartProps) {
  const { themeColors } = useTheme();
  const screenWidth = Dimensions.get("window").width;
  const containerWidth = propWidth ?? screenWidth - 32;
  const chartWidth = containerWidth - Y_AXIS_WIDTH - PADDING_RIGHT;
  const plotWidth = chartWidth - PLOT_PADDING_X * 2; // Usable area for data points
  const chartHeight = height - X_AXIS_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  // Data is expected to arrive already sorted from VisualisationTab
  // But ensure it's sorted just in case
  const sortedData = useMemo(
    () => [...data].sort((a, b) => a.date - b.date),
    [data]
  );

  // Calculate full date range from data
  const { minDate, maxDate, fullRangeMs } = useMemo(() => {
    if (sortedData.length === 0) {
      const now = Date.now();
      return { minDate: now, maxDate: now, fullRangeMs: MS_PER_DAY };
    }
    const min = sortedData[0].date;
    const max = sortedData[sortedData.length - 1].date;
    // Ensure minimum range of 1 day
    const range = Math.max(max - min, MS_PER_DAY);
    return { minDate: min, maxDate: max, fullRangeMs: range };
  }, [sortedData]);

  // Domain state - visible date range
  const [visibleStart, setVisibleStart] = useState(minDate);
  const [visibleEnd, setVisibleEnd] = useState(maxDate);

  // Reset visible range when data changes
  useEffect(() => {
    setVisibleStart(minDate);
    setVisibleEnd(maxDate);
  }, [minDate, maxDate]);

  // Gesture state for guards
  const isPinching = useSharedValue(false);
  const isPanning = useSharedValue(false);
  const lastGestureEndTime = useSharedValue(0);

  // Pinch state
  const initialRangeMs = useSharedValue(fullRangeMs);
  const anchorDateMs = useSharedValue((minDate + maxDate) / 2);
  const pinchStartStart = useSharedValue(minDate);
  const pinchStartEnd = useSharedValue(maxDate);

  // Pan state
  const panStartStart = useSharedValue(minDate);
  const panStartEnd = useSharedValue(maxDate);

  // Derived zoom state
  const visibleRangeMs = visibleEnd - visibleStart;
  const isZoomed = visibleRangeMs < fullRangeMs * 0.99; // Small tolerance for floating point

  // Calculate Y-axis values
  const { paddedMin, paddedMax, yAxisLabels } = useMemo(() => {
    if (sortedData.length === 0) {
      return { paddedMin: 0, paddedMax: 100, yAxisLabels: [] };
    }

    const values = sortedData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || max * 0.2 || 10;
    const pMin = Math.max(0, min - range * 0.1);
    const pMax = max + range * 0.15;

    // Generate Y-axis labels
    const numLabels = 5;
    const labelStep = (pMax - pMin) / (numLabels - 1);
    const labels = Array.from({ length: numLabels }, (_, i) => {
      const value = pMin + labelStep * i;
      return {
        value,
        y: chartHeight - ((value - pMin) / (pMax - pMin)) * chartHeight,
      };
    });

    return { paddedMin: pMin, paddedMax: pMax, yAxisLabels: labels };
  }, [sortedData, chartHeight]);

  // Map date to X coordinate within plot area
  const dateToX = useCallback(
    (date: number): number => {
      if (visibleEnd === visibleStart) return PLOT_PADDING_X + plotWidth / 2;
      const ratio = (date - visibleStart) / (visibleEnd - visibleStart);
      return PLOT_PADDING_X + ratio * plotWidth;
    },
    [visibleStart, visibleEnd, plotWidth]
  );

  // Map value to Y coordinate
  const valueToY = useCallback(
    (value: number): number => {
      return chartHeight - ((value - paddedMin) / (paddedMax - paddedMin)) * chartHeight;
    },
    [chartHeight, paddedMin, paddedMax]
  );

  // Points for rendering AND hit testing - single source of truth
  // Each point stores its computed x,y for both rendering and tap detection
  const renderDataPoints = useMemo(() => {
    const buffer = (visibleEnd - visibleStart) * 0.1;
    return sortedData
      .filter((p) => p.date >= visibleStart - buffer && p.date <= visibleEnd + buffer)
      .map((point, index) => ({
        ...point,
        x: dateToX(point.date),
        y: valueToY(point.value),
        index,
        // Track if point is within visible range (for hit testing)
        isInVisibleRange: point.date >= visibleStart && point.date <= visibleEnd,
      }));
  }, [sortedData, visibleStart, visibleEnd, dateToX, valueToY]);

  // Calculate trend line points
  const visibleTrendPoints = useMemo(() => {
    if (!trendLineData || trendLineData.length === 0) return [];
    const buffer = (visibleEnd - visibleStart) * 0.1;
    return trendLineData
      .filter((p) => p.date >= visibleStart - buffer && p.date <= visibleEnd + buffer)
      .map((point) => ({
        ...point,
        x: dateToX(point.date),
        y: valueToY(point.value),
      }));
  }, [trendLineData, visibleStart, visibleEnd, dateToX, valueToY]);

  // Create SVG path for data line
  const createLinePath = useCallback((points: Array<{ x: number; y: number }>) => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    return path;
  }, []);

  const linePath = useMemo(
    () => createLinePath(renderDataPoints),
    [createLinePath, renderDataPoints]
  );

  const trendLinePath = useMemo(
    () => createLinePath(visibleTrendPoints),
    [createLinePath, visibleTrendPoints]
  );

  // Area path (for fill under line)
  const areaPath = useMemo(() => {
    if (renderDataPoints.length === 0) return "";
    const firstX = renderDataPoints[0].x;
    const lastX = renderDataPoints[renderDataPoints.length - 1].x;
    return `${linePath} L ${lastX} ${chartHeight} L ${firstX} ${chartHeight} Z`;
  }, [linePath, renderDataPoints, chartHeight]);

  // X-axis labels - use visible points only (no buffer zone points)
  const xAxisLabels = useMemo(() => {
    const visiblePoints = renderDataPoints.filter((p) => p.isInVisibleRange);
    if (visiblePoints.length === 0) return [];
    if (visiblePoints.length <= 5) return visiblePoints;

    const step = Math.ceil(visiblePoints.length / 5);
    return visiblePoints.filter(
      (_, i) => i % step === 0 || i === visiblePoints.length - 1
    );
  }, [renderDataPoints]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Handle data point tap - uses the SAME renderDataPoints array used for rendering
  // Only considers points within visible range (isInVisibleRange === true)
  const handleTap = useCallback(
    (tapX: number, tapY: number, tapTime: number) => {
      if (!onDataPointPress || renderDataPoints.length === 0) return;

      // Check gesture guards
      if (isPinching.value || isPanning.value) return;
      if (tapTime - lastGestureEndTime.value < GESTURE_COOLDOWN_MS) return;

      // Find closest data point using 2D Euclidean distance
      // Only consider points within visible range (not buffer zone points)
      let closestPoint: typeof renderDataPoints[0] | null = null;
      let closestDistance = Infinity;

      for (const point of renderDataPoints) {
        // Skip buffer zone points - only tappable points are those in visible range
        if (!point.isInVisibleRange) continue;

        // Calculate 2D Euclidean distance using the SAME x,y used for rendering
        // Point is rendered at (point.x, point.y + PADDING_TOP) in SVG coordinates
        // Tap coordinates are in chartArea-local space (same as SVG space)
        const pointScreenX = point.x;
        const pointScreenY = point.y + PADDING_TOP;
        
        const distX = pointScreenX - tapX;
        const distY = pointScreenY - tapY;
        const distance = Math.sqrt(distX * distX + distY * distY);
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPoint = point;
        }
      }

      // Only trigger if we found a point within hit radius
      if (closestPoint && closestDistance <= DATA_POINT_HIT_RADIUS) {
        if (__DEV__) {
          console.log('[Chart] Tap detected:', {
            tapX: tapX.toFixed(1),
            tapY: tapY.toFixed(1),
            selectedPointX: closestPoint.x.toFixed(1),
            selectedPointY: (closestPoint.y + PADDING_TOP).toFixed(1),
            selectedDate: new Date(closestPoint.date).toLocaleDateString(),
            workoutId: closestPoint.workoutId,
            distance: closestDistance.toFixed(1),
          });
        }
        onDataPointPress(closestPoint);
      } else if (__DEV__) {
        console.log('[Chart] Tap missed - no point within hit radius:', {
          tapX: tapX.toFixed(1),
          tapY: tapY.toFixed(1),
          closestDistance: closestDistance === Infinity ? 'none' : closestDistance.toFixed(1),
        });
      }
    },
    [renderDataPoints, onDataPointPress, isPinching, isPanning, lastGestureEndTime]
  );

  // Update visible range (called from gesture handlers via runOnJS)
  const updateVisibleRange = useCallback((start: number, end: number) => {
    setVisibleStart(start);
    setVisibleEnd(end);
  }, []);

  // Reset zoom
  const resetZoom = useCallback(() => {
    setVisibleStart(minDate);
    setVisibleEnd(maxDate);
  }, [minDate, maxDate]);

  // Pinch gesture - modifies visible date range
  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      // Immediately notify parent to disable tab swiping BEFORE gesture activates
      if (onGestureStart) runOnJS(onGestureStart)();
    })
    .onStart((event) => {
      isPinching.value = true;
      initialRangeMs.value = visibleEnd - visibleStart;
      pinchStartStart.value = visibleStart;
      pinchStartEnd.value = visibleEnd;

      // Calculate anchor date from focal point
      // event.focalX is relative to chartArea (same as tap events)
      const focalX = event.focalX;
      const focalRatio = Math.max(0, Math.min(1, (focalX - PLOT_PADDING_X) / plotWidth));
      anchorDateMs.value = visibleStart + focalRatio * (visibleEnd - visibleStart);
    })
    .onUpdate((event) => {
      // Calculate new range based on pinch scale
      const newRangeMs = initialRangeMs.value / event.scale;

      // Clamp to constraints
      const minRangeMs = MIN_VISIBLE_DAYS * MS_PER_DAY;
      const clampedRange = Math.max(minRangeMs, Math.min(fullRangeMs, newRangeMs));

      // Calculate anchor position ratio in the original range
      const anchorRatioInOriginal =
        (anchorDateMs.value - pinchStartStart.value) /
        (pinchStartEnd.value - pinchStartStart.value);

      // Calculate new start/end centered on anchor
      let newStart = anchorDateMs.value - anchorRatioInOriginal * clampedRange;
      let newEnd = newStart + clampedRange;

      // Clamp to data bounds
      if (newStart < minDate) {
        newStart = minDate;
        newEnd = minDate + clampedRange;
      }
      if (newEnd > maxDate) {
        newEnd = maxDate;
        newStart = maxDate - clampedRange;
      }

      runOnJS(updateVisibleRange)(newStart, newEnd);
    })
    .onFinalize(() => {
      isPinching.value = false;
      lastGestureEndTime.value = Date.now();
      // Notify parent to re-enable tab swiping
      if (onGestureEnd) runOnJS(onGestureEnd)();
    });

  // Pan gesture - shifts visible date range when zoomed
  // Uses activeOffsetX to require significant horizontal movement before activating
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10]) // Must move 10px horizontally to activate
    .minPointers(1)
    .maxPointers(1)
    .onBegin(() => {
      // Immediately notify parent to disable tab swiping BEFORE gesture activates
      if (onGestureStart) runOnJS(onGestureStart)();
    })
    .onStart(() => {
      // Only allow panning when zoomed
      if (visibleEnd - visibleStart >= fullRangeMs * 0.99) return;
      isPanning.value = true;
      panStartStart.value = visibleStart;
      panStartEnd.value = visibleEnd;
    })
    .onUpdate((event) => {
      if (!isPanning.value) return;

      // Convert pixel delta to time delta
      const currentRange = panStartEnd.value - panStartStart.value;
      const pixelsPerMs = plotWidth / currentRange;
      const deltaMs = -event.translationX / pixelsPerMs;

      let newStart = panStartStart.value + deltaMs;
      let newEnd = panStartEnd.value + deltaMs;

      // Clamp to data bounds
      if (newStart < minDate) {
        newStart = minDate;
        newEnd = minDate + currentRange;
      }
      if (newEnd > maxDate) {
        newEnd = maxDate;
        newStart = maxDate - currentRange;
      }

      runOnJS(updateVisibleRange)(newStart, newEnd);
    })
    .onFinalize(() => {
      isPanning.value = false;
      lastGestureEndTime.value = Date.now();
      // Notify parent to re-enable tab swiping
      if (onGestureEnd) runOnJS(onGestureEnd)();
    });

  // Tap gesture - triggers data point selection
  // NOTE: event.x/y are relative to the GestureDetector's view (chartArea),
  // NOT the container. No offset adjustment needed.
  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .numberOfTaps(1)
    .onEnd((event) => {
      // event.x is already in chartArea-local coordinates (same as SVG coordinates)
      const tapX = event.x;
      const tapY = event.y;
      
      // Only process taps within the chart drawing area
      if (tapX >= 0 && tapX <= chartWidth && tapY >= 0 && tapY <= chartHeight + PADDING_TOP + PADDING_BOTTOM) {
        runOnJS(handleTap)(tapX, tapY, Date.now());
      }
    });

  // Double tap gesture - resets zoom
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(resetZoom)();
    });

  // Horizontal capture gesture - captures horizontal movement to prevent tab pager from swiping
  // This gesture activates quickly (5px) and is simultaneous with the main gestures
  const horizontalCapture = Gesture.Pan()
    .activeOffsetX([-5, 5]) // Activate quickly on horizontal movement
    .onBegin(() => {
      // Immediately disable tab swiping when horizontal gesture begins
      if (onGestureStart) runOnJS(onGestureStart)();
    })
    .onFinalize(() => {
      // Re-enable tab swiping when gesture ends
      if (onGestureEnd) runOnJS(onGestureEnd)();
    });

  // Compose gestures: horizontal capture runs simultaneously to prevent tab navigation
  // Double tap has priority, then pinch/pan, then single tap
  const mainGestures = Gesture.Exclusive(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture),
    tapGesture
  );

  // Combine horizontal capture with main gestures
  const composedGesture = Gesture.Simultaneous(
    horizontalCapture,
    mainGestures
  );

  // Calculate zoom percentage for display
  const zoomPercentage = Math.round((fullRangeMs / visibleRangeMs) * 100);

  if (sortedData.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <MaterialCommunityIcons name="chart-line" size={48} color={themeColors.textLight} />
        <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
          No data available
        </Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.wrapper}>
      <View style={[styles.container, { backgroundColor: themeColors.surfaceSecondary }]}>
        {/* Fullscreen Button */}
        {onFullscreenPress && (
          <Pressable
            style={[styles.fullscreenButton, { backgroundColor: themeColors.surface }]}
            onPress={onFullscreenPress}
            hitSlop={10}
          >
            <MaterialCommunityIcons name="fullscreen" size={20} color={themeColors.textSecondary} />
          </Pressable>
        )}

        {/* Zoom indicator */}
        {isZoomed && (
          <View style={[styles.zoomIndicator, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.zoomText, { color: themeColors.textSecondary }]}>
              {zoomPercentage}%
            </Text>
          </View>
        )}

        <View style={styles.chartRow}>
          {/* Fixed Y-Axis */}
          <View style={[styles.yAxis, { width: Y_AXIS_WIDTH }]}>
            <Svg width={Y_AXIS_WIDTH} height={chartHeight + PADDING_TOP + PADDING_BOTTOM}>
              {yAxisLabels.map((label, i) => (
                <SvgText
                  key={i}
                  x={Y_AXIS_WIDTH - 8}
                  y={label.y + PADDING_TOP + 4}
                  fontSize={10}
                  fill={themeColors.textSecondary}
                  textAnchor="end"
                >
                  {label.value.toFixed(0)}
                </SvgText>
              ))}
            </Svg>
          </View>

          {/* Chart Area with Gestures */}
          <GestureDetector gesture={composedGesture}>
            <View style={[styles.chartArea, { width: chartWidth + PADDING_RIGHT }]}>
              <View style={styles.chartClip}>
                <Svg width={chartWidth} height={chartHeight + PADDING_TOP + PADDING_BOTTOM}>
                  {/* Grid lines */}
                  {yAxisLabels.map((label, i) => (
                    <Line
                      key={`grid-${i}`}
                      x1={0}
                      y1={label.y + PADDING_TOP}
                      x2={chartWidth}
                      y2={label.y + PADDING_TOP}
                      stroke={themeColors.border}
                      strokeWidth={1}
                      strokeDasharray="4,4"
                    />
                  ))}

                  {/* Area fill */}
                  {areaPath && (
                    <Path
                      d={areaPath}
                      fill={themeColors.primaryLight}
                      opacity={0.4}
                      transform={`translate(0, ${PADDING_TOP})`}
                    />
                  )}

                  {/* Trend line (if provided) */}
                  {trendLinePath && (
                    <Path
                      d={trendLinePath}
                      fill="none"
                      stroke={themeColors.textSecondary}
                      strokeWidth={2}
                      strokeDasharray="6,4"
                      strokeLinecap="round"
                      opacity={0.7}
                      transform={`translate(0, ${PADDING_TOP})`}
                    />
                  )}

                  {/* Data line */}
                  {linePath && (
                    <Path
                      d={linePath}
                      fill="none"
                      stroke={themeColors.primary}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      transform={`translate(0, ${PADDING_TOP})`}
                    />
                  )}

                  {/* Data points */}
                  {renderDataPoints.map((point, i) => (
                    <Circle
                      key={`point-${i}`}
                      cx={point.x}
                      cy={point.y + PADDING_TOP}
                      r={DATA_POINT_RADIUS}
                      fill={themeColors.primary}
                      stroke={themeColors.surface}
                      strokeWidth={2}
                    />
                  ))}

                  {/* Highlight ring for selected point */}
                  {selectedPoint && (
                    <Circle
                      cx={dateToX(selectedPoint.date)}
                      cy={valueToY(selectedPoint.value) + PADDING_TOP}
                      r={DATA_POINT_RADIUS + 6}
                      fill="none"
                      stroke={themeColors.primary}
                      strokeWidth={3}
                      opacity={0.5}
                    />
                  )}
                </Svg>
              </View>

              {/* X-Axis Labels */}
              <View style={styles.xAxisContainer}>
                <Svg width={chartWidth} height={X_AXIS_HEIGHT}>
                  {xAxisLabels.map((point, i) => (
                    <SvgText
                      key={`x-label-${i}`}
                      x={point.x}
                      y={18}
                      fontSize={9}
                      fill={themeColors.textSecondary}
                      textAnchor="middle"
                    >
                      {formatDate(point.date)}
                    </SvgText>
                  ))}
                </Svg>
              </View>
            </View>
          </GestureDetector>
        </View>

        {/* Unit label */}
        <Text style={[styles.unitLabel, { color: themeColors.textTertiary }]}>
          {unit}
        </Text>

        {/* Instructions */}
        <Text style={[styles.instructions, { color: themeColors.textTertiary }]}>
          Pinch to zoom • Double-tap to reset • Tap point for details
        </Text>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    borderRadius: 16,
    padding: 12,
    paddingTop: 16,
  },
  fullscreenButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  zoomIndicator: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 10,
  },
  zoomText: {
    fontSize: 11,
    fontWeight: "600",
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
  xAxisContainer: {
    // Static positioning
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    padding: 20,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
  },
  unitLabel: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 8,
  },
  instructions: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 4,
  },
});
