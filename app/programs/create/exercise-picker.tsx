import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AddExerciseModal from "../../../components/AddExerciseModal";
import VariationExerciseLabel from "../../../components/exercise/VariationExerciseLabel";
import {
  lastPerformedAt,
  listExerciseLibraryGroups,
  type ExerciseLibraryGroup,
} from "../../../lib/db/exercises";
import { useTheme } from "../../../lib/theme/ThemeContext";
import { formatExerciseLibraryTitle } from "../../../lib/utils/exerciseVariations";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

  const [items, setItems] = useState<ExerciseLibraryGroup[]>([]);
  const [lastPerformedAtByExerciseId, setLastPerformedAtByExerciseId] = useState<
    Record<number, number | null>
  >({});
  const [expandedExerciseId, setExpandedExerciseId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("alphabetical");
  const [sortAscending, setSortAscending] = useState(true);
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const [showSearchPopup, setShowSearchPopup] = useState(false);
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const existingIdSet = useMemo(() => {
    if (!params.existingIds) return new Set<number>();
    return new Set(params.existingIds.split(",").map(Number).filter(Boolean));
  }, [params.existingIds]);

  const headerHeight = 82;

  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [0, 20],
    outputRange: [0, 0.15],
    extrapolate: "clamp",
  });

  const allExercises = useMemo(
    () => items.flatMap((item) => [item.exercise, ...item.variations]),
    [items]
  );

  const reloadExercises = useCallback(async (createdExerciseId?: number) => {
    const rows = await listExerciseLibraryGroups();
    setItems(rows);

    if (
      expandedExerciseId !== null &&
      !rows.some((item) => item.exercise.id === expandedExerciseId)
    ) {
      setExpandedExerciseId(null);
    }

    const concreteExercises = rows.flatMap((item) => [item.exercise, ...item.variations]);
    const entries = await Promise.all(
      concreteExercises.map(
        async (exercise) => [exercise.id, await lastPerformedAt(exercise.id)] as const
      )
    );
    setLastPerformedAtByExerciseId(Object.fromEntries(entries));

    if (createdExerciseId) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(createdExerciseId);
        return next;
      });
    }
  }, [expandedExerciseId]);

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
          item.exercise.name.toLowerCase().includes(query) ||
          item.exercise.muscleGroup?.toLowerCase().includes(query) ||
          item.exercise.equipment?.toLowerCase().includes(query) ||
          item.variations.some(
            (variation) =>
              variation.name.toLowerCase().includes(query) ||
              variation.variationLabel?.toLowerCase().includes(query)
          )
      );
    }

    if (sortOption === "alphabetical") {
      result.sort((a, b) => {
        const comparison = a.exercise.name.localeCompare(b.exercise.name);
        return sortAscending ? comparison : -comparison;
      });
    } else {
      result.sort((a, b) => {
        const aTime = a.familyLastPerformedAt ?? 0;
        const bTime = b.familyLastPerformedAt ?? 0;
        return sortAscending ? aTime - bTime : bTime - aTime;
      });
    }

    return result;
  }, [items, searchQuery, sortOption, sortAscending]);

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

  const handleToggleExpanded = useCallback((exerciseId: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedExerciseId((prev) => (prev === exerciseId ? null : exerciseId));
  }, []);

  const handleAdd = useCallback(() => {
    const selected = allExercises
      .filter((exercise) => selectedIds.has(exercise.id))
      .map((exercise) => ({ id: exercise.id, name: exercise.name }));

    router.back();

    setTimeout(() => {
      (globalThis as any).__exercisePickerCallback?.(selected, targetId);
    }, 100);
  }, [allExercises, selectedIds, targetId]);

  const formatLastCompletedLabel = useCallback((timestamp: number | null | undefined) => {
    return timestamp
      ? `Last completed ${new Date(timestamp).toLocaleDateString()}`
      : "Never completed";
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ExerciseLibraryGroup }) => {
      const isParentSelected = selectedIds.has(item.exercise.id);
      const isParentAlreadyAdded = existingIdSet.has(item.exercise.id);
      const hasVariations = item.variations.length > 0;
      const isExpanded = expandedExerciseId === item.exercise.id;

      return (
        <View
          style={{
            borderRadius: 24,
            overflow: "hidden",
            backgroundColor: rawColors.surface,
            borderWidth: 1,
            borderColor: isParentSelected ? rawColors.primary : rawColors.borderLight,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "stretch" }}>
            <Pressable
              onPress={() => toggleSelection(item.exercise.id)}
              style={({ pressed }) => ({
                flex: 1,
                paddingHorizontal: 20,
                paddingVertical: 18,
                opacity: pressed ? 0.75 : 1,
                backgroundColor: isParentSelected ? rawColors.primary + "10" : rawColors.surface,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: rawColors.foreground, fontSize: 16, fontWeight: "600" }} numberOfLines={1}>
                    {formatExerciseLibraryTitle(item.exercise.name, item.variations.length)}
                  </Text>
                  <Text
                    style={{ marginTop: 4, color: rawColors.foregroundSecondary, fontSize: 12 }}
                    numberOfLines={1}
                  >
                    {formatLastCompletedLabel(item.familyLastPerformedAt)}
                  </Text>
                </View>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    borderWidth: 2,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isParentSelected ? rawColors.primary : "transparent",
                    borderColor: isParentSelected ? rawColors.primary : rawColors.borderLight,
                  }}
                >
                  {isParentSelected ? (
                    <MaterialCommunityIcons
                      name="check"
                      size={16}
                      color={rawColors.primaryForeground}
                    />
                  ) : null}
                </View>
              </View>
            </Pressable>
            <Pressable
              onPress={() =>
                hasVariations ? handleToggleExpanded(item.exercise.id) : toggleSelection(item.exercise.id)
              }
              style={({ pressed }) => ({
                width: 52,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <MaterialCommunityIcons
                name={
                  hasVariations
                    ? isExpanded
                      ? "chevron-up"
                      : "chevron-down"
                    : "chevron-right"
                }
                size={22}
                color={rawColors.foregroundSecondary}
              />
            </Pressable>
          </View>

          {(item.exercise.muscleGroup || item.exercise.equipment || isParentAlreadyAdded) ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, paddingBottom: 14 }}>
              {item.exercise.muscleGroup ? (
                <View className="px-2.5 py-1.5 rounded-full bg-primary/10">
                  <Text className="text-xs font-semibold text-primary">
                    {item.exercise.muscleGroup}
                  </Text>
                </View>
              ) : null}
              {item.exercise.equipment ? (
                <View className="px-2.5 py-1.5 rounded-full bg-surface-secondary">
                  <Text className="text-xs font-semibold text-foreground-secondary">
                    {item.exercise.equipment}
                  </Text>
                </View>
              ) : null}
              {isParentAlreadyAdded ? (
                <View className="px-2.5 py-1.5 rounded-full bg-surface-secondary">
                  <Text className="text-xs font-semibold text-foreground-muted">
                    Already added
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {hasVariations && isExpanded ? (
            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: rawColors.border }}>
              {item.variations.map((variation, index) => {
                const isSelected = selectedIds.has(variation.id);
                const isAlreadyAdded = existingIdSet.has(variation.id);
                return (
                  <Pressable
                    key={variation.id}
                    onPress={() => toggleSelection(variation.id)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingLeft: 20,
                      paddingRight: 16,
                      paddingVertical: 14,
                      opacity: pressed ? 0.75 : 1,
                      borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: rawColors.border,
                      backgroundColor: isSelected ? rawColors.primary + "10" : rawColors.surfaceSecondary,
                    })}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <VariationExerciseLabel
                        exercise={{
                          name: variation.name,
                          parentExerciseId: variation.parentExerciseId,
                          variationLabel: variation.variationLabel,
                          parentName: item.exercise.name,
                        }}
                        numberOfLines={1}
                        style={{ fontSize: 15, fontWeight: "600" }}
                      />
                      <Text style={{ marginTop: 4, color: rawColors.foregroundSecondary, fontSize: 12 }}>
                        {formatLastCompletedLabel(lastPerformedAtByExerciseId[variation.id])}
                        {isAlreadyAdded ? " | Already added" : ""}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        borderWidth: 2,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isSelected ? rawColors.primary : "transparent",
                        borderColor: isSelected ? rawColors.primary : rawColors.borderLight,
                      }}
                    >
                      {isSelected ? (
                        <MaterialCommunityIcons
                          name="check"
                          size={16}
                          color={rawColors.primaryForeground}
                        />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      );
    },
    [
      expandedExerciseId,
      formatLastCompletedLabel,
      existingIdSet,
      handleToggleExpanded,
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
          { backgroundColor: rawColors.background },
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
          <Text style={[styles.headerSubtitle, { color: rawColors.foregroundSecondary }]}>
            {targetLabel}
          </Text>
          <View style={[styles.headerIcons, { alignItems: 'center' }]}>
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

            <Pressable
              onPress={() => setAddModalVisible(true)}
              className="flex-row items-center px-4 py-2 rounded-full border ml-auto"
              style={({ pressed }) => ({
                backgroundColor: pressed ? rawColors.surfaceSecondary : "transparent",
                borderColor: rawColors.borderLight,
              })}
            >
              <MaterialCommunityIcons name="plus" size={16} color={rawColors.foregroundSecondary} />
              <Text className="ml-1.5 text-sm font-semibold" style={{ color: rawColors.foregroundSecondary }}>
                Create
              </Text>
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
        keyExtractor={(item) => String(item.exercise.id)}
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingTop: headerHeight + 16,
          paddingBottom: selectedIds.size > 0 ? 116 : 32,
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

      {selectedIds.size > 0 ? (
        <View
          className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t bg-background"
          style={{
            borderColor: rawColors.borderLight,
            shadowColor: rawColors.shadow,
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 8,
          }}
        >
          <Pressable
            onPress={handleAdd}
            className="flex-row items-center justify-center py-4 rounded-xl border bg-primary border-primary"
            style={({ pressed }) => ({
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <MaterialCommunityIcons
              name="plus"
              size={22}
              color={rawColors.primaryForeground}
            />
            <Text className="text-base font-semibold ml-2 text-primary-foreground">
              Add {selectedIds.size} Exercise{selectedIds.size === 1 ? "" : "s"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <AddExerciseModal
        visible={isAddModalVisible}
        onDismiss={() => {
          setAddModalVisible(false);
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
  headerSubtitle: {
    fontSize: 16,
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
