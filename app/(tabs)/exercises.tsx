import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Link } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AddExerciseModal from "../../components/AddExerciseModal";
import { deleteExercise, lastPerformedAt, listExercises, updateExercise, type Exercise } from "../../lib/db/exercises";

export default function ExercisesScreen() {
  const [items, setItems] = useState<Exercise[]>([]);
  const [fabActive, setFabActive] = useState(false);
  const [lastPerformedAtByExerciseId, setLastPerformedAtByExerciseId] = useState<Record<number, number | null>>({});
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [isActionModalVisible, setActionModalVisible] = useState(false);
  const [isRenameModalVisible, setRenameModalVisible] = useState(false);
  const [isDeleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [renameText, setRenameText] = useState("");

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
    <SafeAreaView style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        decelerationRate="fast"
        scrollEventThrottle={16}
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
    </SafeAreaView>
  );
}


