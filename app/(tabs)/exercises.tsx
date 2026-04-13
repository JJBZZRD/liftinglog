import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
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
import AddExerciseModal from "../../components/AddExerciseModal";
import VariationExerciseLabel from "../../components/exercise/VariationExerciseLabel";
import BaseModal from "../../components/modals/BaseModal";
import {
  createExerciseVariation,
  deleteExercise,
  deleteExerciseVariation,
  lastPerformedAt,
  listExerciseLibraryGroups,
  renameExerciseVariation,
  type Exercise,
  type ExerciseLibraryGroup,
} from "../../lib/db/exercises";
import { useTheme } from "../../lib/theme/ThemeContext";
import { formatExerciseLibraryTitle } from "../../lib/utils/exerciseVariations";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type SortOption = "alphabetical" | "lastCompleted";

export default function ExercisesScreen() {
  const { rawColors } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ExerciseLibraryGroup[]>([]);
  const [lastPerformedAtByExerciseId, setLastPerformedAtByExerciseId] = useState<
    Record<number, number | null>
  >({});
  const [expandedExerciseId, setExpandedExerciseId] = useState<number | null>(null);
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [isActionModalVisible, setActionModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [isDeleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [isVariationsModalVisible, setVariationsModalVisible] = useState(false);
  const [isVariationEditorVisible, setVariationEditorVisible] = useState(false);
  const [isVariationDeleteConfirmVisible, setVariationDeleteConfirmVisible] = useState(false);
  const [selectedParentExerciseId, setSelectedParentExerciseId] = useState<number | null>(null);
  const [variationEditorMode, setVariationEditorMode] = useState<"create" | "rename">("create");
  const [variationDraft, setVariationDraft] = useState("");
  const [variationError, setVariationError] = useState<string | null>(null);
  const [variationTarget, setVariationTarget] = useState<Exercise | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Filter and search state
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const [showSearchPopup, setShowSearchPopup] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("alphabetical");
  const [sortAscending, setSortAscending] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const HEADER_HEIGHT = 105 + insets.top;

  const selectedGroup = useMemo(
    () => items.find((item) => item.exercise.id === selectedParentExerciseId) ?? null,
    [items, selectedParentExerciseId]
  );
  const selectedExercise = selectedGroup?.exercise ?? null;

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

  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [0, 20],
    outputRange: [0, 0.15],
    extrapolate: "clamp",
  });

  const reloadExercises = useCallback(async () => {
    const rows = await listExerciseLibraryGroups();
    setItems(rows);

    if (
      selectedParentExerciseId !== null &&
      !rows.some((item) => item.exercise.id === selectedParentExerciseId)
    ) {
      setSelectedParentExerciseId(null);
      setActionModalVisible(false);
      setEditModalVisible(false);
      setDeleteConfirmVisible(false);
      setVariationsModalVisible(false);
      setVariationEditorVisible(false);
      setVariationDeleteConfirmVisible(false);
      setVariationTarget(null);
    }

    if (
      expandedExerciseId !== null &&
      !rows.some((item) => item.exercise.id === expandedExerciseId)
    ) {
      setExpandedExerciseId(null);
    }

    const concreteExercises = rows.flatMap((group) => [group.exercise, ...group.variations]);
    const entries = await Promise.all(
      concreteExercises.map(
        async (exercise) => [exercise.id, await lastPerformedAt(exercise.id)] as const
      )
    );
    setLastPerformedAtByExerciseId(Object.fromEntries(entries));
  }, [expandedExerciseId, selectedParentExerciseId]);

  useFocusEffect(
    useCallback(() => {
      reloadExercises();
    }, [reloadExercises])
  );

  const formatLastCompletedLabel = useCallback((timestamp: number | null | undefined) => {
    return timestamp
      ? `Last completed ${new Date(timestamp).toLocaleDateString()}`
      : "Never completed";
  }, []);

  const closeActionModal = useCallback(() => {
    setActionModalVisible(false);
  }, []);

  const closeVariationEditor = useCallback(() => {
    setVariationEditorVisible(false);
    setVariationDraft("");
    setVariationError(null);
    setVariationTarget(null);
  }, []);

  const closeVariationDeleteConfirm = useCallback(() => {
    setVariationDeleteConfirmVisible(false);
    setVariationTarget(null);
  }, []);

  const handleToggleExpanded = useCallback((exerciseId: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedExerciseId((prev) => (prev === exerciseId ? null : exerciseId));
  }, []);

  const handleNavigateToExercise = useCallback((exercise: Exercise) => {
    router.push({
      pathname: "/exercise/[id]",
      params: { id: String(exercise.id), name: exercise.name },
    });
  }, []);

  const handleOpenActions = useCallback((group: ExerciseLibraryGroup) => {
    setSelectedParentExerciseId(group.exercise.id);
    setActionModalVisible(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedExercise) {
      setDeleteConfirmVisible(false);
      return;
    }
    try {
      await deleteExercise(selectedExercise.id);
      setDeleteConfirmVisible(false);
      setSelectedParentExerciseId(null);
      await reloadExercises();
    } catch (error: any) {
      Alert.alert("Unable to delete", error?.message ?? "Please resolve the exercise variations first.");
      setDeleteConfirmVisible(false);
    }
  }, [selectedExercise, reloadExercises]);

  const handleOpenVariationEditor = useCallback(
    (mode: "create" | "rename", variation?: Exercise | null) => {
      setVariationEditorMode(mode);
      setVariationTarget(variation ?? null);
      setVariationDraft(mode === "rename" ? variation?.variationLabel ?? "" : "");
      setVariationError(null);
      setVariationEditorVisible(true);
    },
    []
  );

  const handleSaveVariation = useCallback(async () => {
    if (!selectedGroup) {
      closeVariationEditor();
      return;
    }

    try {
      if (variationEditorMode === "create") {
        await createExerciseVariation(selectedGroup.exercise.id, variationDraft);
      } else if (variationTarget) {
        await renameExerciseVariation(variationTarget.id, variationDraft);
      }

      closeVariationEditor();
      await reloadExercises();
    } catch (error: any) {
      setVariationError(error?.message ?? "Unable to save variation.");
    }
  }, [
    closeVariationEditor,
    reloadExercises,
    selectedGroup,
    variationDraft,
    variationEditorMode,
    variationTarget,
  ]);

  const handleDeleteVariation = useCallback(
    async (mode: "keep_data" | "delete_data") => {
      if (!variationTarget) {
        closeVariationDeleteConfirm();
        return;
      }

      try {
        await deleteExerciseVariation(variationTarget.id, mode);
        closeVariationDeleteConfirm();
        await reloadExercises();
      } catch (error: any) {
        Alert.alert("Unable to delete variation", error?.message ?? "Please try again.");
      }
    },
    [closeVariationDeleteConfirm, reloadExercises, variationTarget]
  );

  return (
    <View style={[styles.container, { backgroundColor: rawColors.background }]}>
      {/* Fixed Header */}
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
          }
        ]}
      >
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { color: rawColors.foreground }]}>Exercises</Text>
          <Text style={[styles.headerSubtitle, { color: rawColors.foregroundSecondary }]}>Your exercise library</Text>
          <View style={[styles.headerIcons, { alignItems: 'center' }]}>
            <Pressable 
              style={styles.headerIconButton}
              onPress={() => setShowFilterPopup(true)}
            >
              <MaterialCommunityIcons 
                name="sort" 
                size={22} 
                color={(sortOption !== "alphabetical" || !sortAscending) ? rawColors.primary : rawColors.foregroundSecondary} 
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
                Add Exercise
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
          paddingTop: HEADER_HEIGHT + 45,
          paddingBottom: 100,
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
        renderItem={({ item }) => {
          const isExpanded = expandedExerciseId === item.exercise.id;
          const hasVariations = item.variations.length > 0;
          const parentLastCompleted = item.familyLastPerformedAt;

          return (
            <View
              style={{
                borderRadius: 16,
                backgroundColor: rawColors.surface,
                shadowColor: rawColors.shadow,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "stretch" }}>
                <Pressable
                  onPress={() => handleNavigateToExercise(item.exercise)}
                  onLongPress={() => handleOpenActions(item)}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingHorizontal: 20,
                    paddingVertical: 18,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text
                    style={{ color: rawColors.foreground, fontSize: 16, fontWeight: "600" }}
                    numberOfLines={1}
                  >
                    {formatExerciseLibraryTitle(item.exercise.name, item.variations.length)}
                  </Text>
                  <Text
                    style={{
                      marginTop: 4,
                      color: rawColors.foregroundSecondary,
                      fontSize: 12,
                    }}
                  >
                    {formatLastCompletedLabel(parentLastCompleted)}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    hasVariations
                      ? `${isExpanded ? "Collapse" : "Expand"} variations for ${item.exercise.name}`
                      : `Open ${item.exercise.name}`
                  }
                  onPress={() =>
                    hasVariations
                      ? handleToggleExpanded(item.exercise.id)
                      : handleNavigateToExercise(item.exercise)
                  }
                  style={({ pressed }) => ({
                    width: 56,
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
              {hasVariations && isExpanded ? (
                <View
                  style={{
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: rawColors.border,
                    paddingVertical: 8,
                  }}
                >
                  {item.variations.map((variation, index) => (
                    <Pressable
                      key={variation.id}
                      onPress={() => handleNavigateToExercise(variation)}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingLeft: 20,
                        paddingRight: 16,
                        paddingVertical: 12,
                        opacity: pressed ? 0.78 : 1,
                        borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                        borderTopColor: rawColors.border,
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
                          suffixStyle={{ fontWeight: "500" }}
                        />
                        <Text
                          style={{
                            marginTop: 4,
                            color: rawColors.foregroundSecondary,
                            fontSize: 12,
                          }}
                        >
                          {formatLastCompletedLabel(lastPerformedAtByExerciseId[variation.id])}
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={18}
                        color={rawColors.foregroundSecondary}
                      />
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        }}
      />

      <AddExerciseModal
        visible={isAddModalVisible}
        onDismiss={() => setAddModalVisible(false)}
        onSaved={reloadExercises}
      />

      {/* Actions Modal */}
      <BaseModal
        visible={isActionModalVisible}
        onClose={closeActionModal}
        maxWidth={400}
      >
        {selectedExercise && (
          <>
            <Text className="text-xl font-bold mb-5 text-foreground">
              {selectedExercise.name}
            </Text>
            <Pressable
              onPress={() => {
                closeActionModal();
                setEditModalVisible(true);
              }}
              className="flex-row items-center p-3.5 rounded-xl mb-2 gap-3 bg-surface-secondary"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialCommunityIcons name="pencil-outline" size={22} color={rawColors.primary} />
              <Text className="text-[15px] font-medium text-foreground">Edit Details</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                closeActionModal();
                setVariationsModalVisible(true);
              }}
              className="flex-row items-center p-3.5 rounded-xl mb-2 gap-3 bg-surface-secondary"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialCommunityIcons
                name="swap-vertical"
                size={22}
                color={rawColors.primary}
              />
              <Text className="text-[15px] font-medium text-foreground">Variations</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                closeActionModal();
                setDeleteConfirmVisible(true);
              }}
              className="flex-row items-center p-3.5 rounded-xl mb-2 gap-3 bg-surface-secondary"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <MaterialCommunityIcons name="delete-outline" size={22} color={rawColors.destructive} />
              <Text className="text-[15px] font-medium text-destructive">Delete</Text>
            </Pressable>
          </>
        )}
      </BaseModal>

      {/* Edit Exercise Modal */}
      <AddExerciseModal
        visible={isEditModalVisible}
        exercise={selectedExercise}
        onDismiss={() => {
          setEditModalVisible(false);
        }}
        onSaved={reloadExercises}
      />

      <BaseModal
        visible={isVariationsModalVisible}
        onClose={() => {
          setVariationsModalVisible(false);
          setVariationTarget(null);
        }}
        maxWidth={420}
      >
        {selectedGroup ? (
          <>
            <Text className="text-xl font-bold mb-2 text-foreground">
              Manage Variations
            </Text>
            <Text className="text-sm mb-4 text-foreground-secondary">
              {selectedGroup.exercise.name}
            </Text>

            <Pressable
              onPress={() => handleOpenVariationEditor("create")}
              className="flex-row items-center justify-center p-3.5 rounded-xl mb-4 gap-2 bg-primary"
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <MaterialCommunityIcons name="plus" size={18} color={rawColors.surface} />
              <Text className="text-[15px] font-semibold text-primary-foreground">
                Add Variation
              </Text>
            </Pressable>

            {selectedGroup.variations.length === 0 ? (
              <View
                style={{
                  borderRadius: 14,
                  padding: 16,
                  backgroundColor: rawColors.surfaceSecondary,
                }}
              >
                <Text style={{ color: rawColors.foreground, fontSize: 14, fontWeight: "600" }}>
                  No variations yet
                </Text>
                <Text style={{ marginTop: 4, color: rawColors.foregroundSecondary, fontSize: 13 }}>
                  Create a variation to log and analyze a concrete version of this exercise.
                </Text>
              </View>
            ) : (
              <View
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: rawColors.border,
                }}
              >
                {selectedGroup.variations.map((variation, index) => (
                  <View
                    key={variation.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: rawColors.border,
                      backgroundColor: rawColors.surfaceSecondary,
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <VariationExerciseLabel
                        exercise={{
                          name: variation.name,
                          parentExerciseId: variation.parentExerciseId,
                          variationLabel: variation.variationLabel,
                          parentName: selectedGroup.exercise.name,
                        }}
                        numberOfLines={1}
                        style={{ fontSize: 15, fontWeight: "600" }}
                      />
                      <Text
                        style={{
                          marginTop: 4,
                          color: rawColors.foregroundSecondary,
                          fontSize: 12,
                        }}
                      >
                        {formatLastCompletedLabel(lastPerformedAtByExerciseId[variation.id])}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleOpenVariationEditor("rename", variation)}
                      hitSlop={10}
                      style={{ padding: 8 }}
                    >
                      <MaterialCommunityIcons
                        name="pencil-outline"
                        size={18}
                        color={rawColors.primary}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setVariationTarget(variation);
                        setVariationDeleteConfirmVisible(true);
                      }}
                      hitSlop={10}
                      style={{ padding: 8 }}
                    >
                      <MaterialCommunityIcons
                        name="delete-outline"
                        size={18}
                        color={rawColors.destructive}
                      />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : null}
      </BaseModal>

      <BaseModal
        visible={isVariationEditorVisible}
        onClose={closeVariationEditor}
        maxWidth={380}
      >
        <Text className="text-xl font-bold mb-2 text-foreground">
          {variationEditorMode === "create" ? "New Variation" : "Rename Variation"}
        </Text>
        <Text className="text-sm mb-4 text-foreground-secondary">
          {selectedGroup?.exercise.name ?? "Exercise"}
        </Text>
        {variationError ? (
          <View className="mb-4 px-3 py-2.5 rounded-lg bg-destructive/10">
            <Text className="text-sm font-medium text-destructive">{variationError}</Text>
          </View>
        ) : null}
        <View className="mb-4">
          <Text className="text-sm font-medium mb-2 text-foreground-secondary">
            Variation Label
          </Text>
          <TextInput
            className="border border-border rounded-lg p-3 text-base bg-surface-secondary text-foreground"
            value={variationDraft}
            onChangeText={(text) => {
              setVariationDraft(text);
              setVariationError(null);
            }}
            placeholder="e.g. Larson"
            placeholderTextColor={rawColors.foregroundMuted}
            autoFocus
          />
        </View>
        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
            onPress={closeVariationEditor}
          >
            <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
          </Pressable>
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-primary"
            onPress={handleSaveVariation}
          >
            <Text className="text-base font-semibold text-primary-foreground">
              {variationEditorMode === "create" ? "Create" : "Save"}
            </Text>
          </Pressable>
        </View>
      </BaseModal>

      {/* Delete Confirm Modal */}
      <BaseModal
        visible={isDeleteConfirmVisible}
        onClose={() => {
          setDeleteConfirmVisible(false);
        }}
        maxWidth={380}
      >
        <Text className="text-xl font-bold mb-2 text-foreground">Delete Exercise?</Text>
        <Text className="text-base mb-4 text-foreground-secondary">
          This will permanently delete{" "}
          <Text className="font-semibold text-foreground">{selectedExercise?.name}</Text>.
          {" "}This action cannot be undone.
        </Text>
        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
            onPress={() => {
              setDeleteConfirmVisible(false);
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center p-3.5 rounded-lg gap-1.5 bg-destructive"
            onPress={handleDelete}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <MaterialCommunityIcons name="delete" size={20} color={rawColors.surface} />
            <Text className="text-base font-semibold text-primary-foreground">Delete</Text>
          </Pressable>
        </View>
      </BaseModal>

      <BaseModal
        visible={isVariationDeleteConfirmVisible}
        onClose={closeVariationDeleteConfirm}
        maxWidth={420}
      >
        <Text className="text-xl font-bold mb-2 text-foreground">Delete Variation?</Text>
        {variationTarget ? (
          <>
            <VariationExerciseLabel
              exercise={{
                name: variationTarget.name,
                parentExerciseId: variationTarget.parentExerciseId,
                variationLabel: variationTarget.variationLabel,
                parentName: selectedGroup?.exercise.name ?? null,
              }}
              style={{ fontSize: 16, fontWeight: "600", marginBottom: 12 }}
            />
            <Text className="text-sm mb-4 text-foreground-secondary">
              Choose what should happen to the variation data that has already been logged.
            </Text>
            <Pressable
              onPress={() => handleDeleteVariation("keep_data")}
              className="p-3.5 rounded-xl mb-2 bg-surface-secondary"
              style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
            >
              <Text className="text-[15px] font-semibold text-foreground">
                Keep data under parent
              </Text>
              <Text className="mt-1 text-xs text-foreground-secondary">
                Logged sessions stay in history and move back under the parent exercise.
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleDeleteVariation("delete_data")}
              className="p-3.5 rounded-xl mb-3 bg-surface-secondary"
              style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
            >
              <Text className="text-[15px] font-semibold text-destructive">
                Delete data entirely
              </Text>
              <Text className="mt-1 text-xs text-foreground-secondary">
                Logged sessions for this variation are removed along with the variation row.
              </Text>
            </Pressable>
            <Pressable
              className="items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
              onPress={closeVariationDeleteConfirm}
            >
              <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
            </Pressable>
          </>
        ) : null}
      </BaseModal>

      {/* Filter popup */}
      <Modal
        visible={showFilterPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilterPopup(false)}
      >
        <Pressable
          style={styles.popupOverlay}
          onPress={() => setShowFilterPopup(false)}
        >
          <View style={[styles.popupContainerLeft, { top: insets.top + 125 }]}>
            <View style={[styles.popupArrowLeft, { borderBottomColor: rawColors.surface }]} />
            <Pressable style={[styles.popup, { backgroundColor: rawColors.surface, shadowColor: rawColors.shadow }]} onPress={() => {}}>
              <Text style={[styles.popupTitle, { color: rawColors.foregroundMuted }]}>Sort by</Text>
              <Pressable
                style={styles.popupOption}
                onPress={() => setSortOption("alphabetical")}
              >
                <MaterialCommunityIcons 
                  name="sort-alphabetical-ascending" 
                  size={20} 
                  color={sortOption === "alphabetical" ? rawColors.primary : rawColors.foregroundSecondary} 
                />
                <Text style={[
                  styles.popupOptionText,
                  { color: rawColors.foreground },
                  sortOption === "alphabetical" && { color: rawColors.primary, fontWeight: "600" }
                ]}>
                  Alphabetically
                </Text>
                {sortOption === "alphabetical" && (
                  <MaterialCommunityIcons name="check" size={18} color={rawColors.primary} />
                )}
              </Pressable>
              <Pressable
                style={styles.popupOption}
                onPress={() => setSortOption("lastCompleted")}
              >
                <MaterialCommunityIcons 
                  name="clock-outline" 
                  size={20} 
                  color={sortOption === "lastCompleted" ? rawColors.primary : rawColors.foregroundSecondary} 
                />
                <Text style={[
                  styles.popupOptionText,
                  { color: rawColors.foreground },
                  sortOption === "lastCompleted" && { color: rawColors.primary, fontWeight: "600" }
                ]}>
                  Last completed
                </Text>
                {sortOption === "lastCompleted" && (
                  <MaterialCommunityIcons name="check" size={18} color={rawColors.primary} />
                )}
              </Pressable>
              
              <View style={[styles.popupDivider, { backgroundColor: rawColors.borderLight }]} />
              
              <Text style={[styles.popupTitle, { color: rawColors.foregroundMuted }]}>Order</Text>
              <Pressable
                style={styles.popupOption}
                onPress={() => setSortAscending(true)}
              >
                <MaterialCommunityIcons 
                  name="arrow-up" 
                  size={20} 
                  color={sortAscending ? rawColors.primary : rawColors.foregroundSecondary} 
                />
                <Text style={[
                  styles.popupOptionText,
                  { color: rawColors.foreground },
                  sortAscending && { color: rawColors.primary, fontWeight: "600" }
                ]}>
                  Ascending
                </Text>
                {sortAscending && (
                  <MaterialCommunityIcons name="check" size={18} color={rawColors.primary} />
                )}
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
                <Text style={[
                  styles.popupOptionText,
                  { color: rawColors.foreground },
                  !sortAscending && { color: rawColors.primary, fontWeight: "600" }
                ]}>
                  Descending
                </Text>
                {!sortAscending && (
                  <MaterialCommunityIcons name="check" size={18} color={rawColors.primary} />
                )}
              </Pressable>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Search popup */}
      <Modal
        visible={showSearchPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSearchPopup(false)}
      >
        <Pressable
          style={styles.popupOverlay}
          onPress={() => setShowSearchPopup(false)}
        >
          <View style={[styles.popupContainerLeft, { top: insets.top + 125, left: 64 }]}>
            <View style={[styles.popupArrowLeft, { borderBottomColor: rawColors.surface }]} />
            <Pressable style={[styles.popup, { backgroundColor: rawColors.surface, shadowColor: rawColors.shadow }]} onPress={() => {}}>
              <View style={styles.searchInputContainer}>
                <MaterialCommunityIcons name="magnify" size={20} color={rawColors.foregroundMuted} />
                <TextInput
                  style={[styles.searchInput, { color: rawColors.foreground }]}
                  placeholder="Search exercises..."
                  placeholderTextColor={rawColors.foregroundMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery("")}>
                    <MaterialCommunityIcons name="close-circle" size={18} color={rawColors.foregroundMuted} />
                  </Pressable>
                )}
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
  headerIcons: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  headerIconButton: {
    padding: 8,
    borderRadius: 8,
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
  headerFade: {
    height: 8,
  },
  // Popup styles (kept as-is for custom positioning)
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
