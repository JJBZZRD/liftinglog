import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScrollView, Text, View } from "react-native";

export default function OverviewScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: "#f5f5f5" }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Header */}
        <View style={{ marginBottom: 24, marginTop: 48 }}>
          <Text style={{ fontSize: 32, fontWeight: "700", color: "#000" }}>
            WorkoutLog
          </Text>
          <Text style={{ fontSize: 16, color: "#666", marginTop: 4 }}>
            Track your fitness journey
          </Text>
        </View>

        {/* Quick Stats Placeholder */}
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 16,
            padding: 20,
            marginBottom: 16,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 16 }}>
            Quick Stats
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
            <View style={{ alignItems: "center" }}>
              <MaterialCommunityIcons name="dumbbell" size={32} color="#007AFF" />
              <Text style={{ fontSize: 24, fontWeight: "700", marginTop: 8 }}>0</Text>
              <Text style={{ fontSize: 12, color: "#666" }}>Workouts</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <MaterialCommunityIcons name="fire" size={32} color="#FF9500" />
              <Text style={{ fontSize: 24, fontWeight: "700", marginTop: 8 }}>0</Text>
              <Text style={{ fontSize: 12, color: "#666" }}>Day Streak</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <MaterialCommunityIcons name="trophy" size={32} color="#34C759" />
              <Text style={{ fontSize: 24, fontWeight: "700", marginTop: 8 }}>0</Text>
              <Text style={{ fontSize: 12, color: "#666" }}>PRs</Text>
            </View>
          </View>
        </View>

        {/* Recent Activity Placeholder */}
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 16,
            padding: 20,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 16 }}>
            Recent Activity
          </Text>
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={48} color="#ccc" />
            <Text style={{ fontSize: 16, color: "#999", marginTop: 12 }}>
              No recent workouts
            </Text>
            <Text style={{ fontSize: 14, color: "#ccc", marginTop: 4 }}>
              Start recording to see your activity here
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
