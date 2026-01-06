import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../../lib/theme/ThemeContext";

export default function VisualisationTab() {
  const { themeColors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  
  return (
    <View style={[styles.tabContainer, { backgroundColor: themeColors.surface }]}>
      <MaterialCommunityIcons name="chart-line" size={64} color={themeColors.textLight} />
      <Text style={[styles.tabTitle, { color: themeColors.text }]}>Visualisation</Text>
      <Text style={[styles.tabSubtitle, { color: themeColors.textSecondary }]}>Charts and progress graphs</Text>
      <Text style={[styles.tabText, { color: themeColors.textTertiary }]}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  tabTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  tabSubtitle: {
    fontSize: 16,
    marginBottom: 16,
  },
  tabText: {
    fontSize: 14,
  },
});

