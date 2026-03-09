import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AddExerciseModal from "../../../components/AddExerciseModal";
import {
  lastPerformedAt,
  listExercises,
  type Exercise,
} from "../../../lib/db/exercises";
import { useTheme } from "../../../lib/theme/ThemeContext";

type SortOption = "alphabetical" | "lastCompleted";

export default function ExercisePickerScreen() {
  const { rawColors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    targetId: string;
    targetLabel?: string;
    existingIds?: string;
  }>();
  const targetId = params.targetId ?? "";
  const targetLabel = params.targetLabel ?? targetId;

  const [items, setItems] = useState<Exercise[]>([]);
  const [lastPerformedAtByExerciseId, setLastPerformedAtByExerciseId] = useState<
    Record<number, number | null>
  >({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("alphabetical");
  const [sortAscending, setSortAscending] = useState(true);
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const [showSearchPopup, setShowSearchPopup] = useState(false);
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [fabActive, setFabActive] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const existingIdSet = useMemo(() => {
    if (!params.existingIds) return new Set<number>();
    return new Set(params.existingIds.split(",").map(Number).filter(Boolean));
  }, [params.existingIds]);

  const headerHeight = 108 + insets.top;

  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [0, 20],
    outputRange: [0, 0.15],
    extrapolate: "clamp",
  });

  const reloadExercises = useCallback(async (createdExerciseId?: number) => {
    const rows = await listExercises();
    setItems(rows);

    const entries = await Promise.all(
      rows.map(async (exercise) => [exercise.id, await lastPerformedAt(exercise.id)] as const)
    );
    setLastPerformedAtByExerciseId(Object.fromEntries(entries));

    if (createdExerciseId) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(createdExerciseId);
        return next;
      });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reloadExercises().catch(console.error);
    }, [reloadExercises])
  );

  const filteredAndSortedItems = useMemo(() => {
    let result = [...items];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.muscleGroup?.toLowerCase().includes(query) ||
          item.equipment?.toLowerCase().includes(query)
      );
    }

    if (sortOption === "alphabetical") {
      result.sort((a, b) => {
        const comparison = a.name.localeCompare(b.name);
        return sortAscending ? comparison : -comparison;
      });
    } else {
      result.sort((a, b) => {
        const aTime = lastPerformedAtByExerciseId[a.id] ?? 0;
        const bTime = lastPerformedAtByExerciseId[b.id] ?? 0;
        return sortAscending ? aTime - bTime : bTime - aTime;
      });
    }

    return result;
  }, [items, searchQuery, sortOption, sortAscending, lastPerformedAtByExerciseId]);

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleAdd = useCallback(() => {
    const selected = items
      .filter((exercise) => selectedIds.has(exercise.id))
      .map((exercise) => ({ id: exercise.id, name: exercise.name }));

    router.back();

    setTimeout(() => {
      (globalThis as any).__exercisePickerCallback?.(selected, targetId);
    }, 100);
  }, [items, selectedIds, targetId]);

  const renderItem = useCallback(
    ({ item }: { item: Exercise }) => {
      const isSelected = selectedIds.has(item.id);
      const isAlreadyAdded = existingIdSet.has(item.id);
      const lastCompletedAt = lastPerformedAtByExerciseId[item.id];

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
              shadowColor: rawColors.shadow,
            },
          ]}
        >
          <View style={styles.exerciseCardHeader}>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.exerciseName, { color: rawColors.foreground }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <Text
                style={[styles.exerciseMeta, { color: rawColors.foregroundSecondary }]}
                numberOfLines={1}
              >
                {lastCompletedAt
                  ? `Last completed ${new Date(lastCompletedAt).toLocaleDateString()}`
                  : "Never completed"}
              </Text>
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
              {isSelected ? (
                <MaterialCommunityIcons
                  name="check"
                  size={16}
                  color={rawColors.primaryForeground}
                />
              ) : null}
            </View>
          </View>

          {(item.muscleGroup || item.equipment || isAlreadyAdded) ? (
            <View style={styles.tagRow}>
              {item.muscleGroup ? (
                <View
                  style={[
                    styles.tag,
                    { backgroundColor: rawColors.primary + "15" },
                  ]}
                >
                  <Text style={[styles.tagText, { color: rawColors.primary }]}>
                    {item.muscleGroup}
                  </Text>
                </View>
              ) : null}
              {item.equipment ? (
                <View
                  style={[
                    styles.tag,
                    { backgroundColor: rawColors.surfaceSecondary },
                  ]}
                >
                  <Text
                    style={[styles.tagText, { color: rawColors.foregroundSecondary }]}
                  >
                    {item.equipment}
                  </Text>
                </View>
              ) : null}
              {isAlreadyAdded ? (
                <View
                  style={[
                    styles.tag,
                    { backgroundColor: rawColors.surfaceSecondary },
                  ]}
                >
                  <Text style={[styles.tagText, { color: rawColors.foregroundMuted }]}>
                    Already added
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      );
    },
    [
      existingIdSet,
      lastPerformedAtByExerciseId,
      rawColors,
      selectedIds,
      toggleSelection,
    ]
  );

  return (
    <View style={[styles.container, { backgroundColor: rawColors.background }]}>
      <Stack.Screen
        options={{
          title: "Add Exercises",
          headerStyle: { backgroundColor: rawColors.background },
          headerTintColor: rawColors.foreground,
          headerShadowVisible: false,
        }}
      />

      <Animated.View
        style={[
          styles.headerContainer,
          { paddingTop: insets.top, backgroundColor: rawColors.background },
          {
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: headerShadowOpacity,
            shadowRadius: 8,
            elevation: scrollY.interpolate({
              inputRange: [0, 20],
              outputRange: [0, 4],
              extrapolate: "clamp",
            }),
          },
        ]}
      >
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: rawColors.foreground }]}>
            Add Exercises
          </Text>
          <Text style={[styles.headerSubtitle, { color: rawColors.foregroundSecondary }]}>
            {targetLabel}
          </Text>
          <View style={styles.headerIcons}>
            <Pressable
              style={styles.headerIconButton}
              onPress={() => setShowFilterPopup(true)}
            >
              <MaterialCommunityIcons
                name="sort"
                size={22}
                color={
                  sortOption !== "alphabetical" || !sortAscending
                    ? rawColors.primary
                    : rawColors.foregroundSecondary
                }
              />
            </Pressable>
            <Pressable
              style={styles.headerIconButton}
              onPress={() => setShowSearchPopup(true)}
            >
              <MaterialCommunityIcons
                name="magnify"
                size={22}
                color={searchQuery ? rawColors.primary : rawColors.foregroundSecondary}
              />
            </Pressable>
          </View>
        </View>
        <LinearGradient
          colors={[rawColors.background, "transparent"]}
          style={styles.headerFade}
        />
      </Animated.View>

      <FlatList
        data={filteredAndSortedItems}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingTop: headerHeight + 42,
          paddingBottom: selectedIds.size > 0 ? 176 : 108,
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
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="dumbbell"
              size={48}
              color={rawColors.foregroundMuted}
            />
            <Text style={[styles.emptyTitle, { color: rawColors.foregroundMuted }]}>
              {searchQuery ? "No exercises match your search" : "No exercises in your library"}
            </Text>
            <Pressable
              onPress={() => setAddModalVisible(true)}
              style={[
                styles.emptyAction,
                { borderColor: rawColors.primary, backgroundColor: rawColors.primary + "10" },
              ]}
            >
              <MaterialCommunityIcons name="plus" size={18} color={rawColors.primary} />
              <Text style={[styles.emptyActionText, { color: rawColors.primary }]}>
                Create new exercise
              </Text>
            </Pressable>
          </View>
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add exercise to library"
        onPressIn={() => setFabActive(true)}
        onPress={() => setAddModalVisible(true)}
        style={[
          styles.fab,
          {
            bottom: selectedIds.size > 0 ? 156 : 94,
            backgroundColor: rawColors.surface,
            borderColor: fabActive ? rawColors.foregroundSecondary : rawColors.primary,
            shadowColor: rawColors.shadow,
          },
        ]}
      >
        <MaterialCommunityIcons
          name="plus"
          size={28}
          color={fabActive ? rawColors.foregroundSecondary : rawColors.primary}
        />
      </Pressable>

      {selectedIds.size > 0 ? (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: rawColors.background,
              borderTopColor: rawColors.borderLight,
              shadowColor: rawColors.shadow,
            },
          ]}
        >
          <Pressable
            onPress={handleAdd}
            style={({ pressed }) => [
              styles.bottomButton,
              {
                backgroundColor: rawColors.primary,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="plus"
              size={20}
              color={rawColors.primaryForeground}
            />
            <Text style={[styles.bottomButtonText, { color: rawColors.primaryForeground }]}>
              Add {selectedIds.size} Exercise{selectedIds.size === 1 ? "" : "s"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <AddExerciseModal
        visible={isAddModalVisible}
        onDismiss={() => {
          setAddModalVisible(false);
          setFabActive(false);
        }}
        onSaved={reloadExercises}
      />

      <Modal
        visible={showFilterPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilterPopup(false)}
      >
        <Pressable style={styles.popupOverlay} onPress={() => setShowFilterPopup(false)}>
          <View style={[styles.popupContainerLeft, { top: insets.top + 125 }]}>
            <View
              style={[
                styles.popupArrowLeft,
                { borderBottomColor: rawColors.surface },
              ]}
            />
            <Pressable
              style={[
                styles.popup,
                { backgroundColor: rawColors.surface, shadowColor: rawColors.shadow },
              ]}
              onPress={() => {}}
            >
              <Text style={[styles.popupTitle, { color: rawColors.foregroundMuted }]}>
                Sort by
              </Text>

              <Pressable
                style={styles.popupOption}
                onPress={() => setSortOption("alphabetical")}
              >
                <MaterialCommunityIcons
                  name="sort-alphabetical-ascending"
                  size={20}
                  color={
                    sortOption === "alphabetical"
                      ? rawColors.primary
                      : rawColors.foregroundSecondary
                  }
                />
                <Text
                  style={[
                    styles.popupOptionText,
                    { color: rawColors.foreground },
                    sortOption === "alphabetical" && styles.popupOptionTextActive,
                    sortOption === "alphabetical" && { color: rawColors.primary },
                  ]}
                >
                  Alphabetically
                </Text>
                {sortOption === "alphabetical" ? (
                  <MaterialCommunityIcons
                    name="check"
                    size={18}
                    color={rawColors.primary}
                  />
                ) : null}
              </Pressable>

              <Pressable
                style={styles.popupOption}
                onPress={() => setSortOption("lastCompleted")}
              >
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={20}
                  color={
                    sortOption === "lastCompleted"
                      ? rawColors.primary
                      : rawColors.foregroundSecondary
                  }
                />
                <Text
                  style={[
                    styles.popupOptionText,
                    { color: rawColors.foreground },
                    sortOption === "lastCompleted" && styles.popupOptionTextActive,
                    sortOption === "lastCompleted" && { color: rawColors.primary },
                  ]}
                >
                  Last completed
                </Text>
                {sortOption === "lastCompleted" ? (
                  <MaterialCommunityIcons
                    name="check"
                    size={18}
                    color={rawColors.primary}
                  />
                ) : null}
              </Pressable>

              <View
                style={[styles.popupDivider, { backgroundColor: rawColors.borderLight }]}
              />

              <Text style={[styles.popupTitle, { color: rawColors.foregroundMuted }]}>
                Order
              </Text>

              <Pressable
                style={styles.popupOption}
                onPress={() => setSortAscending(true)}
              >
                <MaterialCommunityIcons
                  name="arrow-up"
                  size={20}
                  color={sortAscending ? rawColors.primary : rawColors.foregroundSecondary}
                />
                <Text
                  style={[
                    styles.popupOptionText,
                    { color: rawColors.foreground },
                    sortAscending && styles.popupOptionTextActive,
                    sortAscending && { color: rawColors.primary },
                  ]}
                >
                  Ascending
                </Text>
                {sortAscending ? (
                  <MaterialCommunityIcons
                    name="check"
                    size={18}
                    color={rawColors.primary}
                  />
                ) : null}
              </Pressable>

              <Pressable
                style={styles.popupOption}
                onPress={() => setSortAscending(false)}
              >
                <MaterialCommunityIcons
                  name="arrow-down"
                  size={20}
                  color={!sortAscending ? rawColors.primary : rawColors.foregroundSecondary}
                />
                <Text
                  style={[
                    styles.popupOptionText,
                    { color: rawColors.foreground },
                    !sortAscending && styles.popupOptionTextActive,
                    !sortAscending && { color: rawColors.primary },
                  ]}
                >
                  Descending
                </Text>
                {!sortAscending ? (
                  <MaterialCommunityIcons
                    name="check"
                    size={18}
                    color={rawColors.primary}
                  />
                ) : null}
              </Pressable>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showSearchPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSearchPopup(false)}
      >
        <Pressable style={styles.popupOverlay} onPress={() => setShowSearchPopup(false)}>
          <View style={[styles.popupContainerLeft, { top: insets.top + 125, left: 64 }]}>
            <View
              style={[
                styles.popupArrowLeft,
                { borderBottomColor: rawColors.surface },
              ]}
            />
            <Pressable
              style={[
                styles.popup,
                styles.searchPopup,
                { backgroundColor: rawColors.surface, shadowColor: rawColors.shadow },
              ]}
              onPress={() => {}}
            >
              <View style={styles.searchInputContainer}>
                <MaterialCommunityIcons
                  name="magnify"
                  size={20}
                  color={rawColors.foregroundMuted}
                />
                <TextInput
                  style={[styles.searchInput, { color: rawColors.foreground }]}
                  placeholder="Search exercises..."
                  placeholderTextColor={rawColors.foregroundMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                />
                {searchQuery.length > 0 ? (
                  <Pressable onPress={() => setSearchQuery("")}>
                    <MaterialCommunityIcons
                      name="close-circle"
                      size={18}
                      color={rawColors.foregroundMuted}
                    />
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  headerIcons: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  headerIconButton: {
    padding: 8,
    borderRadius: 8,
  },
  headerFade: {
    height: 8,
  },
  exerciseCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 12,
  },
  exerciseCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: "700",
  },
  exerciseMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 72,
  },
  emptyTitle: {
    fontSize: 14,
    marginTop: 12,
    marginBottom: 16,
  },
  emptyAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyActionText: {
    fontSize: 14,
    fontWeight: "700",
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 8,
  },
  bottomButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  bottomButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  popupContainerLeft: {
    position: "absolute",
    left: 16,
    alignItems: "flex-start",
  },
  popupArrowLeft: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginLeft: 12,
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  popup: {
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 200,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  searchPopup: {
    minWidth: 260,
    paddingVertical: 4,
  },
  popupTitle: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  popupDivider: {
    height: 1,
    marginVertical: 8,
  },
  popupOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  popupOptionText: {
    flex: 1,
    fontSize: 16,
  },
  popupOptionTextActive: {
    fontWeight: "600",
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
});
