import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { useTheme } from "../../lib/theme/ThemeContext";
import {
  buildSleepWindowForWakeDate,
  formatSleepClockTime,
  formatSleepDurationMinutes,
  getMinutesOfDay,
  getSleepDurationMinutes,
  normalizeClockMinutes,
} from "../../lib/userMetrics/sleep";

type SleepClockInputProps = {
  sleepStartAt: number;
  sleepEndAt: number;
  accentColor: string;
  accentBackground: string;
  onChange: (next: { sleepStartAt: number; sleepEndAt: number; sleepHours: number }) => void;
};

type HandleKey = "start" | "end";

const CLOCK_LABELS = [
  { label: "12a", minutes: 0 },
  { label: "6a", minutes: 6 * 60 },
  { label: "12p", minutes: 12 * 60 },
  { label: "6p", minutes: 18 * 60 },
];

function toClockAngle(minutes: number): number {
  return ((normalizeClockMinutes(minutes) / (24 * 60)) * 360) - 90;
}

function toClockMinutes(angle: number): number {
  const normalizedAngle = ((angle + 90) % 360 + 360) % 360;
  return normalizeClockMinutes((normalizedAngle / 360) * 24 * 60);
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDegrees: number) {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  return {
    x: cx + (radius * Math.cos(angleRadians)),
    y: cy + (radius * Math.sin(angleRadians)),
  };
}

function describeArc(cx: number, cy: number, radius: number, startMinutes: number, endMinutes: number) {
  const startAngle = toClockAngle(startMinutes);
  const durationMinutes = getSleepDurationMinutes(startMinutes, endMinutes);
  const endAngle = startAngle + ((durationMinutes / (24 * 60)) * 360);
  const startPoint = polarToCartesian(cx, cy, radius, startAngle);
  const endPoint = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = durationMinutes > 12 * 60 ? 1 : 0;

  return [
    "M", startPoint.x, startPoint.y,
    "A", radius, radius, 0, largeArcFlag, 1, endPoint.x, endPoint.y,
  ].join(" ");
}

export default function SleepClockInput({
  sleepStartAt,
  sleepEndAt,
  accentColor,
  accentBackground,
  onChange,
}: SleepClockInputProps) {
  const { rawColors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const size = Math.max(220, Math.min(windowWidth - 72, 300));
  const center = size / 2;
  const radius = (size / 2) - 22;
  const handRadius = radius - 20;
  const [activeHandle, setActiveHandle] = useState<HandleKey | null>(null);
  const activeHandleRef = useRef<HandleKey | null>(null);

  const sleepStartMinutes = useMemo(
    () => getMinutesOfDay(sleepStartAt),
    [sleepStartAt]
  );
  const sleepEndMinutes = useMemo(
    () => getMinutesOfDay(sleepEndAt),
    [sleepEndAt]
  );
  const durationMinutes = useMemo(
    () => getSleepDurationMinutes(sleepStartMinutes, sleepEndMinutes),
    [sleepEndMinutes, sleepStartMinutes]
  );

  const startHandlePosition = useMemo(
    () => polarToCartesian(center, center, handRadius, toClockAngle(sleepStartMinutes)),
    [center, handRadius, sleepStartMinutes]
  );
  const endHandlePosition = useMemo(
    () => polarToCartesian(center, center, handRadius, toClockAngle(sleepEndMinutes)),
    [center, handRadius, sleepEndMinutes]
  );
  const arcPath = useMemo(
    () => describeArc(center, center, radius, sleepStartMinutes, sleepEndMinutes),
    [center, radius, sleepEndMinutes, sleepStartMinutes]
  );

  const updateFromTouch = useCallback((event: GestureResponderEvent, handle: HandleKey) => {
    const { locationX, locationY } = event.nativeEvent;
    const angle = (Math.atan2(locationY - center, locationX - center) * 180) / Math.PI;
    const nextMinutes = toClockMinutes(angle);
    const nextWindow = handle === "start"
      ? buildSleepWindowForWakeDate(sleepEndAt, nextMinutes, sleepEndMinutes)
      : buildSleepWindowForWakeDate(sleepEndAt, sleepStartMinutes, nextMinutes);

    onChange({
      sleepStartAt: nextWindow.sleepStartAt,
      sleepEndAt: nextWindow.sleepEndAt,
      sleepHours: nextWindow.sleepHours,
    });
  }, [center, onChange, sleepEndAt, sleepEndMinutes, sleepStartMinutes]);

  const getNearestHandle = useCallback((event: GestureResponderEvent): HandleKey => {
    const { locationX, locationY } = event.nativeEvent;
    const angle = (Math.atan2(locationY - center, locationX - center) * 180) / Math.PI;
    const touchMinutes = toClockMinutes(angle);
    const startRawDistance = Math.abs(normalizeClockMinutes(touchMinutes - sleepStartMinutes));
    const endRawDistance = Math.abs(normalizeClockMinutes(touchMinutes - sleepEndMinutes));
    const startDistance = Math.min(startRawDistance, (24 * 60) - startRawDistance);
    const endDistance = Math.min(endRawDistance, (24 * 60) - endRawDistance);
    return startDistance <= endDistance ? "start" : "end";
  }, [center, sleepEndMinutes, sleepStartMinutes]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const nearestHandle = getNearestHandle(event);
        setActiveHandle(nearestHandle);
        activeHandleRef.current = nearestHandle;
        updateFromTouch(event, nearestHandle);
      },
      onPanResponderMove: (event) => {
        if (!activeHandleRef.current) {
          return;
        }
        updateFromTouch(event, activeHandleRef.current);
      },
      onPanResponderRelease: () => {
        setActiveHandle(null);
        activeHandleRef.current = null;
      },
      onPanResponderTerminate: () => {
        setActiveHandle(null);
        activeHandleRef.current = null;
      },
    }),
    [getNearestHandle, updateFromTouch]
  );

  return (
    <View className="items-center">
      <View
        className="items-center justify-center"
        style={{ width: size, height: size }}
        {...panResponder.panHandlers}
      >
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={rawColors.border}
            strokeWidth={20}
            fill={rawColors.surface}
          />
          <Path
            d={arcPath}
            stroke={accentColor}
            strokeWidth={20}
            fill="none"
            strokeLinecap="round"
          />

          {CLOCK_LABELS.map((clockLabel) => {
            const labelPoint = polarToCartesian(center, center, radius - 34, toClockAngle(clockLabel.minutes));
            return (
              <SvgText
                key={clockLabel.label}
                x={labelPoint.x}
                y={labelPoint.y + 4}
                fontSize={12}
                fontWeight="700"
                fill={rawColors.foregroundSecondary}
                textAnchor="middle"
              >
                {clockLabel.label}
              </SvgText>
            );
          })}

          {Array.from({ length: 24 }, (_, index) => {
            const tickMinutes = index * 60;
            const outer = polarToCartesian(center, center, radius + 2, toClockAngle(tickMinutes));
            const inner = polarToCartesian(center, center, radius - (index % 6 === 0 ? 16 : 10), toClockAngle(tickMinutes));
            return (
              <Line
                key={tickMinutes}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={rawColors.foregroundMuted}
                strokeWidth={index % 6 === 0 ? 2 : 1.2}
                opacity={0.55}
              />
            );
          })}

          <Line
            x1={center}
            y1={center}
            x2={startHandlePosition.x}
            y2={startHandlePosition.y}
            stroke={rawColors.foregroundSecondary}
            strokeWidth={4}
            strokeLinecap="round"
          />
          <Line
            x1={center}
            y1={center}
            x2={endHandlePosition.x}
            y2={endHandlePosition.y}
            stroke={accentColor}
            strokeWidth={4}
            strokeLinecap="round"
          />

          <Circle
            cx={startHandlePosition.x}
            cy={startHandlePosition.y}
            r={activeHandle === "start" ? 13 : 11}
            fill={rawColors.surface}
            stroke={rawColors.foregroundSecondary}
            strokeWidth={4}
          />
          <Circle
            cx={endHandlePosition.x}
            cy={endHandlePosition.y}
            r={activeHandle === "end" ? 13 : 11}
            fill={rawColors.surface}
            stroke={accentColor}
            strokeWidth={4}
          />

          <Circle
            cx={center}
            cy={center}
            r={42}
            fill={accentBackground}
          />
        </Svg>

        <View className="absolute items-center">
          <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: accentBackground }}>
            <MaterialCommunityIcons name="sleep" size={22} color={accentColor} />
          </View>
          <Text className="mt-2 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
            Duration
          </Text>
          <Text className="mt-1 text-xl font-bold text-foreground">
            {formatSleepDurationMinutes(durationMinutes)}
          </Text>
        </View>
      </View>

      <View className="mt-5 w-full flex-row gap-3">
        <View className="flex-1 rounded-2xl border border-border-light bg-surface-secondary px-3 py-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
            Sleep Time
          </Text>
          <Text className="mt-2 text-base font-semibold text-foreground">
            {formatSleepClockTime(sleepStartAt)}
          </Text>
        </View>

        <View className="flex-1 rounded-2xl border border-border-light bg-surface-secondary px-3 py-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
            Wake Time
          </Text>
          <Text className="mt-2 text-base font-semibold text-foreground">
            {formatSleepClockTime(sleepEndAt)}
          </Text>
        </View>

        <View className="flex-1 rounded-2xl border border-border-light bg-surface-secondary px-3 py-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
            Sleep Duration
          </Text>
          <Text className="mt-2 text-base font-semibold text-foreground">
            {formatSleepDurationMinutes(durationMinutes)}
          </Text>
        </View>
      </View>

      <Text className="mt-3 text-xs text-center text-foreground-muted">
        Drag either hand around the dial to set bedtime and wake time.
      </Text>
    </View>
  );
}
