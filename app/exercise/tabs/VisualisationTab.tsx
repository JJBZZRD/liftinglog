import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function VisualisationTab() {
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  return (
    <View style={styles.tabContainer}>
      <Text style={styles.tabTitle}>Visualisation</Text>
      <Text style={styles.tabSubtitle}>Charts and progress graphs</Text>
      {typeof params.id === "string" && (
        <Text style={styles.tabText}>Exercise ID: {params.id}</Text>
      )}
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
    marginBottom: 8,
    color: "#000",
  },
  tabSubtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 16,
  },
  tabText: {
    fontSize: 14,
    color: "#999",
  },
});

