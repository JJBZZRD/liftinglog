/**
 * Analytics Chart Component
 *
 * Interactive chart with:
 * - Pinch to zoom (horizontal domain-based, not scale transform)
 * - Pan when zoomed (shifts visible date range)
 * - Fixed Y-axis during pan
 * - Touch-and-drag scrubbing to open details
 * - Optional trend line overlay
 * - Fullscreen button
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
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

type RenderDataPoint = SessionDataPoint & {
  x: number;
  y: number;
  index: number;
  isInVisibleRange: boolean;
};

// Layout constants
const Y_AXIS_WIDTH = 25;
const X_AXIS_HEIGHT = 30;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 12; // Space for bottom Y-axis label
const PADDING_RIGHT = 16;
const PLOT_PADDING_X = 16; // Padding inside plot area for first/last points

// Zoom constraints
const MIN_VISIBLE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Interaction constants
const DATA_POINT_RADIUS = 4;

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
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubbedPoint, setScrubbedPoint] = useState<RenderDataPoint | null>(null);
  // Use shared value for blocking - set synchronously on UI thread before runOnJS
  const scrubBlocked = useSharedValue(false);

  // Reset visible range when data changes
  useEffect(() => {
    setVisibleStart(minDate);
    setVisibleEnd(maxDate);
  }, [minDate, maxDate]);

  // Gesture state for guards
  const isPanning = useSharedValue(false);

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
  const renderDataPoints = useMemo<RenderDataPoint[]>(() => {
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
      year: "numeric",
    });
  };

  const getClosestVisiblePointByX = useCallback(
    (tapX: number) => {
      const visiblePoints = renderDataPoints.filter((p) => p.isInVisibleRange);
      if (visiblePoints.length === 0) return null;

      let closestPoint: typeof visiblePoints[0] = visiblePoints[0];
      let closestDistance = Math.abs(closestPoint.x - tapX);

      for (const point of visiblePoints) {
        const distance = Math.abs(point.x - tapX);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPoint = point;
        }
      }

      return closestPoint;
    },
    [renderDataPoints]
  );

  const beginScrub = useCallback(
    (x: number) => {
      setIsScrubbing(true);
      const closestPoint = getClosestVisiblePointByX(x);
      setScrubbedPoint(closestPoint);
    },
    [getClosestVisiblePointByX]
  );

  const updateScrubbedPoint = useCallback(
    (x: number) => {
      const closestPoint = getClosestVisiblePointByX(x);
      setScrubbedPoint(closestPoint);
    },
    [getClosestVisiblePointByX]
  );

  const endScrubCancelled = useCallback(() => {
    setIsScrubbing(false);
    setScrubbedPoint(null);
  }, []);

  const endScrubWithModal = useCallback(
    (endX: number) => {
      const closestPoint = getClosestVisiblePointByX(endX);
      if (closestPoint && onDataPointPress) {
        onDataPointPress(closestPoint);
      }
      setIsScrubbing(false);
      setScrubbedPoint(null);
    },
    [getClosestVisiblePointByX, onDataPointPress]
  );

  // Update visible range (called from gesture handlers via runOnJS)
  const updateVisibleRange = useCallback((start: number, end: number) => {
    setVisibleStart(start);
    setVisibleEnd(end);
  }, []);

  // Track if pinching is active (to disable pan during pinch)
  const isPinching = useSharedValue(false);
  const lastFocalX = useSharedValue(0);

  // Pinch gesture - modifies visible date range
  // Also handles focal point movement for pan-like behavior during pinch
  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      // Block scrub SYNCHRONOUSLY on UI thread before any runOnJS calls
      scrubBlocked.value = true;
      isPinching.value = true;
      // Immediately notify parent to disable tab swiping BEFORE gesture activates
      if (onGestureStart) runOnJS(onGestureStart)();
      runOnJS(endScrubCancelled)();
    })
    .onStart((event) => {
      initialRangeMs.value = visibleEnd - visibleStart;
      pinchStartStart.value = visibleStart;
      pinchStartEnd.value = visibleEnd;
      lastFocalX.value = event.focalX;

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

      // Also handle focal point movement (pan during pinch)
      const focalDeltaX = event.focalX - lastFocalX.value;
      if (Math.abs(focalDeltaX) > 0) {
        const pixelsPerMs = plotWidth / clampedRange;
        const panDeltaMs = -focalDeltaX / pixelsPerMs;
        newStart += panDeltaMs;
        newEnd += panDeltaMs;
        lastFocalX.value = event.focalX;
      }

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
      // Notify parent to re-enable tab swiping
      if (onGestureEnd) runOnJS(onGestureEnd)();
    });

  // Two-finger pan gesture - shifts visible date range when zoomed
  // Uses activeOffsetX to require significant horizontal movement before activating
  // Disabled during pinching to prevent conflicts
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10]) // Must move 10px horizontally to activate
    .minPointers(2)
    .maxPointers(2)
    .onBegin(() => {
      // Block scrub SYNCHRONOUSLY on UI thread before any runOnJS calls
      scrubBlocked.value = true;
      // Immediately notify parent to disable tab swiping BEFORE gesture activates
      if (onGestureStart) runOnJS(onGestureStart)();
      runOnJS(endScrubCancelled)();
    })
    .onStart(() => {
      // Don't activate pan if pinching - pinch handles its own panning
      if (isPinching.value) return;
      // Only allow panning when zoomed
      if (visibleEnd - visibleStart >= fullRangeMs * 0.99) return;
      isPanning.value = true;
      panStartStart.value = visibleStart;
      panStartEnd.value = visibleEnd;
    })
    .onUpdate((event) => {
      // Skip pan updates if pinching or not in pan mode
      if (isPinching.value || !isPanning.value) return;

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
      // Notify parent to re-enable tab swiping
      if (onGestureEnd) runOnJS(onGestureEnd)();
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

  // Scrub gesture - touch and slide across points
  // Handles its own multi-touch detection to avoid race conditions
  const scrubGesture = Gesture.Pan()
    .minPointers(1)
    .minDistance(0)
    .onBegin((event: any) => {
      // Unblock scrub SYNCHRONOUSLY on UI thread
      scrubBlocked.value = false;
      if (onGestureStart) runOnJS(onGestureStart)();
      runOnJS(beginScrub)(event.x);
    })
    .onTouchesDown((event: any, _state: any) => {
      // Called when touches are added - check if this is a SECOND finger
      // allTouches contains all active touches including the new one
      if (event.allTouches && event.allTouches.length > 1) {
        // Block scrub immediately when second finger touches
        scrubBlocked.value = true;
        runOnJS(endScrubCancelled)();
      }
    })
    .onUpdate((event: any) => {
      // Only update if not blocked and single pointer
      if (!scrubBlocked.value && event.numberOfPointers === 1) {
        runOnJS(updateScrubbedPoint)(event.x);
      } else if (event.numberOfPointers > 1) {
        // Block if we somehow get here with multiple pointers
        scrubBlocked.value = true;
      }
    })
    .onFinalize((event: any) => {
      if (onGestureEnd) runOnJS(onGestureEnd)();
      // Check blocked state SYNCHRONOUSLY before deciding which JS function to call
      if (scrubBlocked.value) {
        runOnJS(endScrubCancelled)();
      } else {
        runOnJS(endScrubWithModal)(event.x);
      }
    });

  // Combine horizontal capture with main gestures
  const composedGesture = Gesture.Simultaneous(
    horizontalCapture,
    pinchGesture,
    panGesture,
    scrubGesture
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

        {isScrubbing && scrubbedPoint && (
          <View style={[styles.scrubDatePill, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Text style={[styles.scrubDateText, { color: themeColors.text }]}>
              {formatDate(scrubbedPoint.date)}
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
                  x={Y_AXIS_WIDTH - 4}
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

                  {/* Highlight ring for selected/scrubbed point */}
                  {(isScrubbing ? scrubbedPoint : selectedPoint) && (
                    <Circle
                      cx={dateToX((isScrubbing ? scrubbedPoint : selectedPoint)!.date)}
                      cy={valueToY((isScrubbing ? scrubbedPoint : selectedPoint)!.value) + PADDING_TOP}
                      r={DATA_POINT_RADIUS + 4}
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
          Pinch to zoom • Touch & drag to scrub • Release for details
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
    paddingLeft: 0,
    paddingRight: 12,
    paddingTop: 16,
    paddingBottom: 12,
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
  scrubDatePill: {
    position: "absolute",
    top: 8,
    left: "50%",
    transform: [{ translateX: -60 }],
    minWidth: 120,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    zIndex: 10,
  },
  scrubDateText: {
    fontSize: 12,
    fontWeight: "600",
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
