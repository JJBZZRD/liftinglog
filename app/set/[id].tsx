import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";

export default function SetInfoScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const setId = typeof params.id === "string" ? Number(params.id) : null;
  const isValidId = typeof setId === "number" && Number.isFinite(setId) && setId > 0;

  return (
    <View style={[styles.container, { backgroundColor: rawColors.background }]}>
      <Stack.Screen
        options={{
          title: "Set Info",
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: rawColors.surfaceSecondary }]}>
          <MaterialCommunityIcons name="information-outline" size={32} color={rawColors.primary} />
        </View>
        <Text style={[styles.title, { color: rawColors.foreground }]}>Set Info</Text>
        <Text style={[styles.subtitle, { color: rawColors.foregroundSecondary }]}>
          Detailed information for this set will be available here soon.
        </Text>
        <View style={[styles.idBadge, { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.border }]}>
          <Text style={[styles.idLabel, { color: rawColors.foregroundSecondary }]}>Set ID</Text>
          <Text style={[styles.idValue, { color: isValidId ? rawColors.foreground : rawColors.destructive }]}>
            {isValidId ? setId : "Unknown"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    padding: 8,
    marginLeft: -8,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  idBadge: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 4,
  },
  idLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  idValue: {
    fontSize: 16,
    fontWeight: "700",
  },
});
