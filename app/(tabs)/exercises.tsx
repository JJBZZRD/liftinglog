import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Link } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Animated, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AddExerciseModal from "../../components/AddExerciseModal";
import { deleteExercise, lastPerformedAt, listExercises, updateExercise, type Exercise } from "../../lib/db/exercises";

export default function ExercisesScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Exercise[]>([]);
  const [fabActive, setFabActive] = useState(false);
  const [lastPerformedAtByExerciseId, setLastPerformedAtByExerciseId] = useState<Record<number, number | null>>({});
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [isActionModalVisible, setActionModalVisible] = useState(false);
  const [isRenameModalVisible, setRenameModalVisible] = useState(false);
  const [isDeleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [renameText, setRenameText] = useState("");
  const scrollY = useRef(new Animated.Value(0)).current;

  const HEADER_HEIGHT = 120 + insets.top;
  
  // Shadow opacity based on scroll position (0 when at top, 1 when scrolled)
  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [0, 20],
    outputRange: [0, 0.15],
    extrapolate: "clamp",
  });

  const reloadExercises = useCallback(async () => {
    const rows = await listExercises();
    setItems(rows);
    const entries = await Promise.all(
      rows.map(async (exercise) => [exercise.id, await lastPerformedAt(exercise.id)] as const)
    );
    setLastPerformedAtByExerciseId(Object.fromEntries(entries));
  }, []);

  // Floating action button replaces the header add button

  useFocusEffect(
    useCallback(() => {
      // When returning to this screen (modal dismissed), reset FAB color to blue
      setFabActive(false);
      let isActive = true;
      (async () => {
        await reloadExercises();
      })();
      return () => {
        isActive = false;
      };
    }, [reloadExercises])
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#f5f5f5" }}>
      {/* Fixed Header */}
      <Animated.View 
        style={[
          styles.headerContainer, 
          { paddingTop: insets.top },
          {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: headerShadowOpacity,
            shadowRadius: 8,
            elevation: scrollY.interpolate({
              inputRange: [0, 20],
              outputRange: [0, 4],
              extrapolate: "clamp",
            }),
          }
        ]}
      >
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Exercises</Text>
          <Text style={styles.headerSubtitle}>Your exercise library</Text>
        </View>
        {/* Fade gradient */}
        <LinearGradient
          colors={["#f5f5f5", "rgba(245, 245, 245, 0)"]}
          style={styles.headerFade}
        />
      </Animated.View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ 
          padding: 16, 
          gap: 12,
          paddingTop: HEADER_HEIGHT + 8,
          paddingBottom: 100, // Space for bottom nav bar
        }}
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        renderItem={({ item }) => (
          <Link
            href={{ pathname: "/exercise/[id]", params: { id: String(item.id), name: item.name } }}
            asChild
          >
            <Pressable
              onLongPress={() => {
                setSelectedExercise(item);
                setRenameText(item.name);
                setActionModalVisible(true);
              }}
              style={{
                borderWidth: 1,
                borderColor: "#e5e5ea",
                borderRadius: 10,
                padding: 12,
                backgroundColor: "#fff",
              }}
            >
              <Text style={{ fontWeight: "600", marginBottom: 4 }}>{item.name}</Text>
              <Text style={{ fontSize: 12, color: "#666" }}>
                {lastPerformedAtByExerciseId[item.id]
                  ? new Date(lastPerformedAtByExerciseId[item.id] as number).toLocaleDateString()
                  : "Never"}
              </Text>
            </Pressable>
          </Link>
        )}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add exercise"
        onPressIn={() => setFabActive(true)}
        onPress={() => setAddModalVisible(true)}
        style={{
          position: "absolute",
          right: 20,
          bottom: 94, // above floating tab bar (18 bottom + 64 height + 12 gap)
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#fff",
          borderWidth: 2,
          borderColor: fabActive ? "#9E9E9E" : "#0A84FF", // toggle blue/grey
          alignItems: "center",
          justifyContent: "center",
          // Shadow (iOS)
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.15,
          shadowRadius: 10,
          // Elevation (Android)
          elevation: 8,
        }}
      >
        <MaterialCommunityIcons name="plus" size={28} color={fabActive ? "#9E9E9E" : "#0A84FF"} />
      </Pressable>

      <AddExerciseModal
        visible={isAddModalVisible}
        onDismiss={() => {
          setAddModalVisible(false);
          setFabActive(false);
        }}
        onSaved={reloadExercises}
      />

      {/* Actions modal: Rename / Delete */}
      <Modal
        visible={isActionModalVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setActionModalVisible(false)}
      >
        <Pressable
          onPress={() => setActionModalVisible(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center", padding: 16 }}
        >
          <Pressable
            onPress={() => {}}
            style={{ width: "100%", maxWidth: 420, backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 12 }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600" }}>Exercise options</Text>
            <Pressable
              onPress={() => {
                setActionModalVisible(false);
                setRenameModalVisible(true);
              }}
              style={{ paddingVertical: 10 }}
            >
              <Text style={{ color: "#007AFF", fontWeight: "600" }}>Rename</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setActionModalVisible(false);
                setDeleteConfirmVisible(true);
              }}
              style={{ paddingVertical: 10 }}
            >
              <Text style={{ color: "#FF3B30", fontWeight: "600" }}>Delete</Text>
            </Pressable>
            <View style={{ alignItems: "flex-end" }}>
              <Pressable onPress={() => setActionModalVisible(false)} style={{ padding: 10 }}>
                <Text style={{ color: "#555" }}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename modal */}
      <Modal
        visible={isRenameModalVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <Pressable
          onPress={() => setRenameModalVisible(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center", padding: 16 }}
        >
          <Pressable
            onPress={() => {}}
            style={{ width: "100%", maxWidth: 520, backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 12 }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600" }}>Rename exercise</Text>
            <TextInput
              placeholder="New name"
              value={renameText}
              onChangeText={setRenameText}
              style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10 }}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
              <Pressable onPress={() => setRenameModalVisible(false)} style={{ padding: 10 }}>
                <Text style={{ color: "#555" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  const trimmed = renameText.trim();
                  if (!selectedExercise || !trimmed) {
                    setRenameModalVisible(false);
                    return;
                  }
                  await updateExercise(selectedExercise.id, { name: trimmed });
                  setRenameModalVisible(false);
                  setSelectedExercise(null);
                  await reloadExercises();
                }}
                style={{ backgroundColor: "#007AFF", padding: 10, borderRadius: 8 }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        visible={isDeleteConfirmVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setDeleteConfirmVisible(false)}
      >
        <Pressable
          onPress={() => setDeleteConfirmVisible(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center", padding: 16 }}
        >
          <Pressable
            onPress={() => {}}
            style={{ width: "100%", maxWidth: 420, backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 12 }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600" }}>Delete exercise?</Text>
            <Text style={{ color: "#666" }}>This action cannot be undone.</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
              <Pressable onPress={() => setDeleteConfirmVisible(false)} style={{ padding: 10 }}>
                <Text style={{ color: "#555" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!selectedExercise) {
                    setDeleteConfirmVisible(false);
                    return;
                  }
                  await deleteExercise(selectedExercise.id);
                  setDeleteConfirmVisible(false);
                  setSelectedExercise(null);
                  await reloadExercises();
                }}
                style={{ backgroundColor: "#FF3B30", padding: 10, borderRadius: 8 }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: "#f5f5f5",
  },
  headerContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: "#000",
  },
  headerSubtitle: {
    fontSize: 16,
    color: "#666",
    marginTop: 4,
  },
  headerFade: {
    height: 24,
  },
});
