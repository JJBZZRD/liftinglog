/**
 * Fullscreen Chart Component
 * 
 * Displays the analytics chart in fullscreen landscape mode.
 * Shows only the chart with close button - no stat boxes.
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useState } from "react";
import { Dimensions, Modal, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../lib/theme/ThemeContext";
import type { SessionDataPoint } from "../../lib/utils/analytics";
import AnalyticsChart from "./AnalyticsChart";

interface FullscreenChartProps {
  visible: boolean;
  onClose: () => void;
  data: SessionDataPoint[];
  trendLineData?: SessionDataPoint[];
  title: string;
  unit: string;
  onDataPointPress?: (point: SessionDataPoint) => void;
}

export default function FullscreenChart({
  visible,
  onClose,
  data,
  trendLineData,
  title,
  unit,
  onDataPointPress,
}: FullscreenChartProps) {
  const { themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));

  // Lock to landscape when modal opens, portrait when it closes
  useEffect(() => {
    if (visible) {
      lockToLandscape();
    } else {
      lockToPortrait();
    }

    return () => {
      lockToPortrait();
    };
  }, [visible]);

  // Listen for dimension changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });

    return () => subscription.remove();
  }, []);

  const lockToLandscape = async () => {
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } catch (error) {
      console.warn("Failed to lock orientation:", error);
    }
  };

  const lockToPortrait = async () => {
    try {
      // Lock back to portrait instead of unlocking (keeps app portrait-locked globally)
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch (error) {
      console.warn("Failed to lock portrait orientation:", error);
    }
  };

  const handleClose = async () => {
    await lockToPortrait();
    onClose();
  };

  // Calculate chart dimensions with safe area margins
  // In landscape, width is the longer dimension
  const screenWidth = Math.max(dimensions.width, dimensions.height);
  const screenHeight = Math.min(dimensions.width, dimensions.height);
  
  // Account for safe areas (notch, home indicator, etc.)
  const horizontalPadding = 24 + Math.max(insets.left, insets.right);
  const verticalPadding = 16 + Math.max(insets.top, insets.bottom);
  const headerHeight = 52;
  
  const chartWidth = screenWidth - horizontalPadding * 2;
  const chartHeight = screenHeight - verticalPadding * 2 - headerHeight;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      supportedOrientations={["landscape-left", "landscape-right"]}
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar hidden />
      <View
        style={[
          styles.container,
          {
            backgroundColor: themeColors.background,
            paddingTop: Math.max(insets.top, 8),
            paddingBottom: Math.max(insets.bottom, 8),
            paddingLeft: Math.max(insets.left, 16),
            paddingRight: Math.max(insets.right, 16),
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Pressable
            style={[styles.closeButton, { backgroundColor: themeColors.surfaceSecondary }]}
            onPress={handleClose}
            hitSlop={12}
          >
            <MaterialCommunityIcons name="close" size={24} color={themeColors.text} />
          </Pressable>
        </View>

        {/* Chart - takes up all remaining space */}
        <View style={styles.chartWrapper}>
          <AnalyticsChart
            data={data}
            trendLineData={trendLineData}
            width={chartWidth}
            height={chartHeight}
            unit={unit}
            onDataPointPress={onDataPointPress}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 52,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    marginRight: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  chartWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
