import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";

export default function ProgramsScreen() {
  const { themeColors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Programs</Text>
        <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
          Your workout programs
        </Text>
      </View>
      <View style={styles.emptyState}>
        <MaterialCommunityIcons name="book-outline" size={64} color={themeColors.textLight} />
        <Text style={[styles.emptyText, { color: themeColors.textTertiary }]}>
          No programs yet
        </Text>
        <Text style={[styles.emptySubtext, { color: themeColors.textLight }]}>
          Create custom workout programs to structure your training
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginTop: 48,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    maxWidth: 280,
  },
});


