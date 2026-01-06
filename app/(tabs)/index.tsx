import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";

export default function OverviewScreen() {
  const { themeColors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>
            WorkoutLog
          </Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
            Track your fitness journey
          </Text>
        </View>

        {/* Quick Stats */}
        <View
          style={[
            styles.card,
            { backgroundColor: themeColors.surface, shadowColor: themeColors.shadow }
          ]}
        >
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>
            Quick Stats
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="dumbbell" size={32} color={themeColors.primary} />
              <Text style={[styles.statValue, { color: themeColors.text }]}>0</Text>
              <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Workouts</Text>
            </View>
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="fire" size={32} color={themeColors.warning} />
              <Text style={[styles.statValue, { color: themeColors.text }]}>0</Text>
              <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Day Streak</Text>
            </View>
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="trophy" size={32} color={themeColors.success} />
              <Text style={[styles.statValue, { color: themeColors.text }]}>0</Text>
              <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>PRs</Text>
            </View>
          </View>
        </View>

        {/* Recent Activity */}
        <View
          style={[
            styles.card,
            { backgroundColor: themeColors.surface, shadowColor: themeColors.shadow }
          ]}
        >
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>
            Recent Activity
          </Text>
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={themeColors.textLight} />
            <Text style={[styles.emptyText, { color: themeColors.textTertiary }]}>
              No recent workouts
            </Text>
            <Text style={[styles.emptySubtext, { color: themeColors.textLight }]}>
              Start recording to see your activity here
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
    marginTop: 48,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
  },
});
