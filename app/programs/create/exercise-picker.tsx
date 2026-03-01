import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../../../lib/theme/ThemeContext";
import { listExercises, type Exercise } from "../../../lib/db/exercises";

export default function ExercisePickerScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ day: string; dayLabel?: string; existingIds?: string }>();
  const dayKey = params.day ?? "";
  const dayLabel = params.dayLabel ?? dayKey;

  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const existingIdSet = useMemo(() => {
    if (!params.existingIds) return new Set<number>();
    return new Set(params.existingIds.split(",").map(Number).filter(Boolean));
  }, [params.existingIds]);

  useFocusEffect(
    useCallback(() => {
      listExercises().then(setAllExercises).catch(console.error);
    }, [])
  );

  const filteredExercises = useMemo(() => {
    let list = allExercises;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    return list;
  }, [allExercises, searchQuery]);

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAdd = useCallback(() => {
    const selected = allExercises
      .filter((e) => selectedIds.has(e.id))
      .map((e) => ({ id: e.id, name: e.name }));

    router.back();

    setTimeout(() => {
      (globalThis as any).__exercisePickerCallback?.(selected, dayKey);
    }, 100);
  }, [selectedIds, allExercises, dayKey]);

  const renderItem = useCallback(
    ({ item }: { item: Exercise }) => {
      const isSelected = selectedIds.has(item.id);
      const isAlreadyAdded = existingIdSet.has(item.id);

      return (
        <Pressable
          onPress={() => toggleSelection(item.id)}
          style={({ pressed }) => [
            styles.exerciseCard,
            {
              backgroundColor: isSelected
                ? rawColors.primary + "12"
                : pressed
                ? rawColors.pressed
                : rawColors.surface,
              borderColor: isSelected ? rawColors.primary : rawColors.borderLight,
            },
          ]}
        >
          <View style={styles.exerciseCardContent}>
            <View style={styles.exerciseInfo}>
              <Text
                style={[styles.exerciseName, { color: rawColors.foreground }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {item.muscleGroup ? (
                <Text style={[styles.exerciseMuscle, { color: rawColors.foregroundSecondary }]}>
                  {item.muscleGroup}
                </Text>
              ) : null}
              {isAlreadyAdded && (
                <Text style={[styles.alreadyAdded, { color: rawColors.foregroundMuted }]}>
                  Already added
                </Text>
              )}
            </View>

            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: isSelected ? rawColors.primary : "transparent",
                  borderColor: isSelected ? rawColors.primary : rawColors.borderLight,
                },
              ]}
            >
              {isSelected && (
                <MaterialCommunityIcons name="check" size={16} color={rawColors.primaryForeground} />
              )}
            </View>
          </View>
        </Pressable>
      );
    },
    [selectedIds, existingIdSet, rawColors, toggleSelection]
  );

  return (
    <View style={styles.container} className="bg-background">
      <Stack.Screen
        options={{
          title: `Add Exercises - ${dayLabel}`,
          headerStyle: { backgroundColor: rawColors.background },
          headerTintColor: rawColors.foreground,
          headerShadowVisible: false,
        }}
      />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight },
          ]}
        >
          <MaterialCommunityIcons name="magnify" size={20} color={rawColors.foregroundMuted} />
          <TextInput
            style={[styles.searchInput, { color: rawColors.foreground }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search exercises..."
            placeholderTextColor={rawColors.foregroundMuted}
            autoFocus
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={18} color={rawColors.foregroundMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Exercise List */}
      <FlatList
        data={filteredExercises}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="dumbbell" size={48} color={rawColors.foregroundMuted} />
            <Text style={[styles.emptyText, { color: rawColors.foregroundMuted }]}>
              {searchQuery ? "No exercises match your search" : "No exercises in your library"}
            </Text>
          </View>
        }
      />

      {/* Sticky Footer - Add Button */}
      {selectedIds.size > 0 && (
        <View
          className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-border bg-background"
          style={{
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 8,
          }}
        >
          <Pressable
            onPress={handleAdd}
            className="flex-row items-center justify-center py-4 rounded-xl border border-primary bg-primary"
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <MaterialCommunityIcons name="plus" size={20} color={rawColors.primaryForeground} />
            <Text className="ml-2 text-base font-semibold text-primary-foreground">
              Add {selectedIds.size} Exercise{selectedIds.size !== 1 ? "s" : ""}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  exerciseCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
  },
  exerciseCardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  exerciseInfo: {
    flex: 1,
    marginRight: 12,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: "600",
  },
  exerciseMuscle: {
    fontSize: 13,
    marginTop: 2,
  },
  alreadyAdded: {
    fontSize: 11,
    marginTop: 2,
    fontStyle: "italic",
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
});
