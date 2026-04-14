import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  type ColorValue,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AddExerciseModal from "../../../components/AddExerciseModal";
import VariationExerciseLabel from "../../../components/exercise/VariationExerciseLabel";
import AppModal from "../../../components/modals/BaseModal";
import {
  lastPerformedAt,
  listExerciseLibraryGroups,
  type Exercise,
  type ExerciseLibraryGroup,
} from "../../../lib/db/exercises";
import { useTheme } from "../../../lib/theme/ThemeContext";
import { formatVariationCountLabel } from "../../../lib/utils/exerciseVariations";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type SortOption = "alphabetical" | "lastCompleted";
type SearchScope = "all" | "muscle" | "equipment";

type ExerciseSection = {
  key: string;
  title: string;
  items: ExerciseLibraryGroup[];
};

const SEARCH_SCOPE_OPTIONS: { id: SearchScope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "muscle", label: "Muscle" },
  { id: "equipment", label: "Equipment" },
];

const SECTION_ORDER = [
  "Chest & Triceps",
  "Back & Biceps",
  "Shoulders",
  "Lower Body",
  "Core",
  "Conditioning",
  "Uncategorized",
];

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatSectionTitle(muscleGroup: string | null | undefined): string {
  const value = muscleGroup?.trim().toLowerCase() ?? "";
  if (!value) {
    return "Uncategorized";
  }
  if (value.includes("chest") || value.includes("tricep")) {
    return "Chest & Triceps";
  }
  if (
    value.includes("back") ||
    value.includes("lat") ||
    value.includes("bicep") ||
    value.includes("row")
  ) {
    return "Back & Biceps";
  }
  if (
    value.includes("leg") ||
    value.includes("quad") ||
    value.includes("hamstring") ||
    value.includes("glute") ||
    value.includes("calf") ||
    value.includes("lower")
  ) {
    return "Lower Body";
  }
  if (
    value.includes("shoulder") ||
    value.includes("delt") ||
    value.includes("trap")
  ) {
    return "Shoulders";
  }
  if (value.includes("core") || value.includes("ab")) {
    return "Core";
  }
  if (value.includes("cardio") || value.includes("conditioning")) {
    return "Conditioning";
  }

  return titleCaseWords(muscleGroup!);
}

function formatMuscleGroupTitle(muscleGroup: string | null | undefined): string {
  if (!muscleGroup?.trim()) {
    return "Uncategorized";
  }

  return titleCaseWords(muscleGroup);
}

function getSectionTitleForMode(
  mode: SearchScope,
  exercise: Exercise
): string {
  if (mode === "equipment") {
    return getEquipmentBadgeLabel(exercise);
  }

  if (mode === "muscle") {
    return formatMuscleGroupTitle(exercise.muscleGroup);
  }

  return formatSectionTitle(exercise.muscleGroup);
}

function getEquipmentBadgeLabel(exercise: Exercise): string {
  if (exercise.isBodyweight) {
    return "BODYWEIGHT";
  }

  const equipment = exercise.equipment?.trim();
  if (!equipment) {
    return "GENERAL";
  }

  const normalized = equipment.toLowerCase();
  if (normalized.includes("barbell")) return "BARBELL";
  if (normalized.includes("dumbbell")) return "DUMBBELL";
  if (normalized.includes("cable")) return "CABLE";
  if (normalized.includes("machine")) return "MACHINE";
  if (normalized.includes("kettlebell")) return "KETTLEBELL";

  return equipment.toUpperCase();
}

function sortSections(sections: ExerciseSection[]): ExerciseSection[] {
  return [...sections].sort((a, b) => {
    const aIndex = SECTION_ORDER.indexOf(a.title);
    const bIndex = SECTION_ORDER.indexOf(b.title);
    const resolvedA = aIndex === -1 ? SECTION_ORDER.length : aIndex;
    const resolvedB = bIndex === -1 ? SECTION_ORDER.length : bIndex;

    if (resolvedA !== resolvedB) {
      return resolvedA - resolvedB;
    }

    return a.title.localeCompare(b.title);
  });
}

function formatCompactDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const showYear = date.getFullYear() !== now.getFullYear();

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
  });
}

function filteredLabel(count: number): string {
  return `${count} exercise${count === 1 ? "" : "s"}`;
}

export default function ExercisePickerScreen() {
  const { rawColors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
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
  const [searchScope, setSearchScope] = useState<SearchScope>("all");
  const [showAllTabBodyPartGrouping, setShowAllTabBodyPartGrouping] = useState(true);
  const [showSortModal, setShowSortModal] = useState(false);
  const [isAddModalVisible, setAddModalVisible] = useState(false);

  const existingIdSet = useMemo(() => {
    if (!params.existingIds) return new Set<number>();
    return new Set(params.existingIds.split(",").map(Number).filter(Boolean));
  }, [params.existingIds]);

  const screenBackground = rawColors.background;
  const heroGradient: readonly [ColorValue, ColorValue] = isDark
    ? [rawColors.background, rawColors.surface]
    : [rawColors.surface, rawColors.pressed];
  const sectionLabelColor = isDark ? rawColors.foregroundMuted : "#8895AB";
  const raisedSurface = isDark ? rawColors.surface : "#FFFFFF";
  const recessedSurface = isDark ? rawColors.surfaceSecondary : "#F6F8FD";
  const subtleBorder = isDark ? rawColors.border : "#E3EAF5";
  const lightShadowColor = isDark ? rawColors.shadow : "#9AA9C3";
  const selectorTrayWidth = Math.max(280, windowWidth - 40);
  const selectorSegmentWidth = Math.floor((selectorTrayWidth - 8) / 3);
  const selectorSegmentHeight = 36;
  const activeSearchScopeIndex = SEARCH_SCOPE_OPTIONS.findIndex(
    (option) => option.id === searchScope
  );
  const sortSummaryLabel =
    sortOption === "alphabetical"
      ? `A-Z / ${sortAscending ? "Asc" : "Desc"}`
      : `Recent / ${sortAscending ? "Oldest" : "Newest"}`;
  const searchPlaceholder = "Search exercises...";

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

  const formatLastCompletedLabel = useCallback((timestamp: number | null | undefined) => {
    return timestamp ? `Last completed ${formatCompactDate(timestamp)}` : "Never logged";
  }, []);

  const filteredAndSortedItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let result = [...items];

    if (query) {
      result = result.filter((item) => {
        const searchableTerms = [
          item.exercise.name,
          item.exercise.muscleGroup ?? "",
          item.exercise.equipment ?? "",
          ...item.variations.flatMap((variation) => [
            variation.name,
            variation.variationLabel ?? "",
            variation.muscleGroup ?? "",
            variation.equipment ?? "",
          ]),
        ]
          .join(" ")
          .toLowerCase();

        return searchableTerms.includes(query);
      });
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

  const sections = useMemo(() => {
    if (searchScope === "all" && !showAllTabBodyPartGrouping) {
      return [
        {
          key: "all-exercises",
          title: "",
          items: filteredAndSortedItems,
        },
      ];
    }

    const grouped = new Map<string, ExerciseLibraryGroup[]>();

    for (const item of filteredAndSortedItems) {
      const sectionTitle = getSectionTitleForMode(searchScope, item.exercise);
      if (!grouped.has(sectionTitle)) {
        grouped.set(sectionTitle, []);
      }
      grouped.get(sectionTitle)!.push(item);
    }

    const nextSections = Array.from(grouped.entries()).map(([title, groupedItems]) => ({
      key: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title,
      items: groupedItems,
    }));

    if (searchScope === "all") {
      return sortSections(nextSections);
    }

    return nextSections.sort((a, b) => a.title.localeCompare(b.title));
  }, [filteredAndSortedItems, searchScope, showAllTabBodyPartGrouping]);

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

  const handleShowAllTabBodyPartGroupingChange = useCallback((value: boolean) => {
    setShowAllTabBodyPartGrouping(value);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: screenBackground }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: selectedIds.size > 0 ? 140 : Math.max(insets.bottom + 32, 48),
        }}
      >
        <LinearGradient
          colors={heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingTop: insets.top + 12,
            paddingHorizontal: 20,
            paddingBottom: 24,
            borderBottomLeftRadius: 34,
            borderBottomRightRadius: 34,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              marginBottom: 4,
            }}
          >
            <Pressable
              onPress={() => router.back()}
              className="items-center justify-center w-10 h-10 rounded-xl"
              style={({ pressed }) => ({
                backgroundColor: pressed ? recessedSurface : "transparent",
              })}
            >
              <MaterialCommunityIcons
                name="arrow-left"
                size={24}
                color={rawColors.foreground}
              />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text className="text-foreground text-xl font-bold">
                Add Exercises
              </Text>
              <Text className="text-foreground-secondary text-xs">
                {targetLabel}
              </Text>
            </View>

            <Pressable
              onPress={() => setAddModalVisible(true)}
              className="flex-row items-center px-3.5 py-2 rounded-xl bg-primary"
              style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}
            >
              <MaterialCommunityIcons name="plus" size={16} color={rawColors.primaryForeground} />
              <Text className="ml-1.5 text-sm font-bold text-primary-foreground">
                Create
              </Text>
            </Pressable>
          </View>

          <View style={{ marginTop: 20, gap: 14 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderRadius: 16,
                backgroundColor: raisedSurface,
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderWidth: 1,
                borderColor: subtleBorder,
                shadowColor: lightShadowColor,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: isDark ? 0.14 : 0.12,
                shadowRadius: 24,
                elevation: 4,
              }}
            >
              <MaterialCommunityIcons name="magnify" size={22} color={rawColors.foregroundMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={rawColors.foregroundMuted}
                style={{
                  flex: 1,
                  color: rawColors.foreground,
                  fontSize: 16,
                }}
              />
              {searchQuery.length > 0 ? (
                <Pressable
                  onPress={() => setSearchQuery("")}
                  hitSlop={10}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={18}
                    color={rawColors.foregroundMuted}
                  />
                </Pressable>
              ) : null}
            </View>

            <View
              style={{
                width: selectorTrayWidth,
                borderRadius: 11,
                padding: 3,
                backgroundColor: isDark ? rawColors.surfaceSecondary : "#D9E1EE",
                borderWidth: 1,
                borderColor: isDark ? rawColors.border : "#D1D9E6",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <View
                style={{
                  position: "absolute",
                  top: 3,
                  left: 3 + activeSearchScopeIndex * selectorSegmentWidth,
                  width: selectorSegmentWidth,
                  height: selectorSegmentHeight,
                  borderRadius: 11,
                  backgroundColor: raisedSurface,
                  borderWidth: 1,
                  borderColor: "#E5EAF3",
                  shadowColor: lightShadowColor,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: isDark ? 0.12 : 0.06,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              />

              <View style={{ width: "100%", flexDirection: "row", alignItems: "center" }}>
                {SEARCH_SCOPE_OPTIONS.map((option) => {
                  const isSelected = searchScope === option.id;
                  return (
                    <View
                      key={option.id}
                      style={{
                        width: selectorSegmentWidth,
                        height: selectorSegmentHeight,
                      }}
                    >
                      <Pressable
                        onPress={() => setSearchScope(option.id)}
                        style={({ pressed }) => ({
                          width: "100%",
                          height: "100%",
                          borderRadius: 11,
                          opacity: pressed ? 0.82 : 1,
                        })}
                      >
                        <View
                          style={{
                            width: "100%",
                            height: "100%",
                            alignItems: "center",
                            justifyContent: "center",
                            paddingHorizontal: 12,
                          }}
                        >
                          <Text
                            style={{
                              color: isSelected ? rawColors.primary : rawColors.foregroundSecondary,
                              fontSize: 14,
                              fontWeight: "700",
                              includeFontPadding: false,
                              lineHeight: 16,
                              letterSpacing: 0.8,
                              textAlign: "center",
                              textAlignVertical: "center",
                              textTransform: "uppercase",
                              width: "100%",
                            }}
                          >
                            {option.label}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  color: rawColors.foregroundSecondary,
                  fontSize: 13,
                  fontWeight: "500",
                }}
              >
                {filteredLabel(filteredAndSortedItems.length)}
                {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open sort options"
                  onPress={() => setShowSortModal(true)}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                >
                  <Text
                    style={{
                      color: rawColors.foregroundMuted,
                      fontSize: 12,
                      fontWeight: "600",
                      letterSpacing: 0.2,
                    }}
                  >
                    {sortSummaryLabel}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open sort options"
                  onPress={() => setShowSortModal(true)}
                  style={({ pressed }) => ({
                    width: 28,
                    height: 28,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isDark ? rawColors.surfaceSecondary : "rgba(255,255,255,0.82)",
                    borderWidth: 1,
                    borderColor: subtleBorder,
                    opacity: pressed ? 0.78 : 1,
                  })}
                >
                  <MaterialCommunityIcons
                    name="tune-variant"
                    size={16}
                    color={rawColors.foregroundSecondary}
                  />
                </Pressable>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, paddingTop: 22, gap: 24 }}>
          {sections.length === 0 ? (
            <View
              style={{
                borderRadius: 26,
                paddingHorizontal: 24,
                paddingVertical: 28,
                alignItems: "center",
                backgroundColor: raisedSurface,
                borderWidth: 1,
                borderColor: subtleBorder,
                shadowColor: lightShadowColor,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: isDark ? 0.14 : 0.1,
                shadowRadius: 24,
                elevation: 3,
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isDark ? rawColors.primaryLight : "#EEF4FF",
                }}
              >
                <MaterialCommunityIcons
                  name="dumbbell"
                  size={24}
                  color={rawColors.primary}
                />
              </View>
              <Text
                style={{
                  marginTop: 16,
                  color: rawColors.foreground,
                  fontSize: 18,
                  fontWeight: "700",
                }}
              >
                {items.length === 0 ? "No exercises yet" : "No matches found"}
              </Text>
              <Text
                style={{
                  marginTop: 8,
                  textAlign: "center",
                  color: rawColors.foregroundSecondary,
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                {items.length === 0
                  ? "Create your first exercise to start building out the library."
                  : "Try adjusting the search scope or clearing your current query."}
              </Text>
              {items.length === 0 ? (
                <Pressable
                  onPress={() => setAddModalVisible(true)}
                  style={({ pressed }) => ({
                    marginTop: 18,
                    paddingHorizontal: 18,
                    paddingVertical: 12,
                    borderRadius: 16,
                    backgroundColor: rawColors.primary,
                    opacity: pressed ? 0.84 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: rawColors.primaryForeground,
                      fontSize: 14,
                      fontWeight: "700",
                    }}
                  >
                    Add Exercise
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            sections.map((section) => (
              <View key={section.key} style={{ gap: 12 }}>
                {section.title ? (
                  <Text
                    style={{
                      color: sectionLabelColor,
                      fontSize: 11,
                      fontWeight: "700",
                      letterSpacing: 2.2,
                      textTransform: "uppercase",
                    }}
                  >
                    {section.title}
                  </Text>
                ) : null}

                <View style={{ gap: 14 }}>
                  {section.items.map((item) => {
                    const isExpanded = expandedExerciseId === item.exercise.id;
                    const hasVariations = item.variations.length > 0;
                    const isParentSelected = selectedIds.has(item.exercise.id);
                    const isParentAlreadyAdded = existingIdSet.has(item.exercise.id);
                    const primaryBadgeLabel =
                      searchScope === "equipment"
                        ? formatMuscleGroupTitle(item.exercise.muscleGroup).toUpperCase()
                        : getEquipmentBadgeLabel(item.exercise);

                    return (
                      <View
                        key={item.exercise.id}
                        style={{
                          borderRadius: 18,
                          backgroundColor: raisedSurface,
                          borderWidth: isParentSelected ? 2 : 1,
                          borderColor: isParentSelected ? rawColors.primary : subtleBorder,
                          paddingTop: 8,
                          paddingBottom: hasVariations && isExpanded ? 8 : 8,
                          shadowColor: lightShadowColor,
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: isDark ? 0.14 : 0.08,
                          shadowRadius: 18,
                          elevation: 3,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                          }}
                        >
                          <View
                            style={{
                              flex: 1,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 12,
                              paddingRight: 8,
                            }}
                          >
                            <View
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 10,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: isDark ? rawColors.primaryLight : "#EFF4FF",
                              }}
                            >
                              <MaterialCommunityIcons
                                name={item.exercise.isBodyweight ? "human-handsup" : "dumbbell"}
                                size={18}
                                color={rawColors.primary}
                              />
                            </View>

                            <Pressable
                              onPress={() => toggleSelection(item.exercise.id)}
                              style={({ pressed }) => ({
                                flex: 1,
                                opacity: pressed ? 0.8 : 1,
                              })}
                            >
                              <Text
                                numberOfLines={1}
                                style={{
                                  color: rawColors.foreground,
                                  fontSize: 15,
                                  lineHeight: 20,
                                  fontWeight: "600",
                                }}
                              >
                                {item.exercise.name}
                              </Text>

                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  gap: 8,
                                  marginTop: 6,
                                }}
                              >
                                <View
                                  style={{
                                    borderRadius: 8,
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    backgroundColor: isDark ? rawColors.primaryLight : "#EEF4FF",
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: rawColors.primary,
                                      fontSize: 10,
                                      fontWeight: "700",
                                      letterSpacing: 1,
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    {primaryBadgeLabel}
                                  </Text>
                                </View>

                                {isParentAlreadyAdded ? (
                                  <View
                                    style={{
                                      borderRadius: 8,
                                      paddingHorizontal: 8,
                                      paddingVertical: 3,
                                      backgroundColor: rawColors.surfaceSecondary,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: rawColors.foregroundMuted,
                                        fontSize: 10,
                                        fontWeight: "700",
                                        letterSpacing: 1,
                                        textTransform: "uppercase",
                                      }}
                                    >
                                      ADDED
                                    </Text>
                                  </View>
                                ) : null}

                                {hasVariations ? (
                                  <Text
                                    style={{
                                      color: rawColors.foregroundSecondary,
                                      fontSize: 12,
                                    }}
                                  >
                                    {formatVariationCountLabel(item.variations.length)}
                                  </Text>
                                ) : null}
                              </View>
                            </Pressable>
                          </View>

                          <View
                            style={{
                              width: hasVariations ? 74 : 36,
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              gap: 2,
                            }}
                          >
                            {hasVariations ? (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={
                                  isExpanded
                                    ? `Collapse variations for ${item.exercise.name}`
                                    : `Expand variations for ${item.exercise.name}`
                                }
                                onPress={() => handleToggleExpanded(item.exercise.id)}
                                style={({ pressed }) => ({
                                  width: 36,
                                  height: 36,
                                  borderRadius: 12,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: pressed ? recessedSurface : "transparent",
                                })}
                              >
                                <MaterialCommunityIcons
                                  name={isExpanded ? "chevron-up" : "chevron-down"}
                                  size={20}
                                  color={rawColors.foregroundSecondary}
                                />
                              </Pressable>
                            ) : null}

                            <Pressable
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: isParentSelected }}
                              accessibilityLabel={`Select ${item.exercise.name}`}
                              onPress={() => toggleSelection(item.exercise.id)}
                              style={({ pressed }) => ({
                                width: 36,
                                height: 36,
                                borderRadius: 12,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: pressed ? recessedSurface : "transparent",
                              })}
                            >
                              <View
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: 8,
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
                            </Pressable>
                          </View>
                        </View>

                        {hasVariations && isExpanded ? (
                          <View
                            style={{
                              paddingTop: 2,
                              paddingBottom: 6,
                            }}
                          >
                            <View
                              style={{
                                height: 1,
                                marginHorizontal: 14,
                                marginBottom: 2,
                                backgroundColor: subtleBorder,
                              }}
                            />
                            {item.variations.map((variation) => {
                              const isVariationSelected = selectedIds.has(variation.id);
                              const isVariationAlreadyAdded = existingIdSet.has(variation.id);
                              return (
                                <View
                                  key={variation.id}
                                  style={{
                                    paddingHorizontal: 14,
                                  }}
                                >
                                  <Pressable
                                    onPress={() => toggleSelection(variation.id)}
                                    style={({ pressed }) => ({
                                      opacity: pressed ? 0.75 : 1,
                                    })}
                                  >
                                    <View
                                      style={{
                                        width: "100%",
                                        minHeight: 56,
                                        flexDirection: "row",
                                        alignItems: "center",
                                        paddingVertical: 8,
                                        backgroundColor: isVariationSelected
                                          ? `${rawColors.primary}10`
                                          : "transparent",
                                        borderRadius: 12,
                                        marginVertical: 2,
                                        paddingHorizontal: 8,
                                      }}
                                    >
                                      <View style={{ width: 34 }} />
                                      <View
                                        style={{
                                          flex: 1,
                                          justifyContent: "center",
                                          paddingRight: 12,
                                        }}
                                      >
                                        <VariationExerciseLabel
                                          exercise={{
                                            name: variation.name,
                                            parentExerciseId: variation.parentExerciseId,
                                            variationLabel: variation.variationLabel,
                                            parentName: item.exercise.name,
                                          }}
                                          numberOfLines={1}
                                          style={{
                                            color: rawColors.foreground,
                                            fontSize: 15,
                                            lineHeight: 20,
                                            fontWeight: "500",
                                          }}
                                        />
                                        <View
                                          style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 8,
                                            marginTop: 4,
                                          }}
                                        >
                                          <Text
                                            style={{
                                              color: rawColors.foregroundSecondary,
                                              fontSize: 12,
                                            }}
                                          >
                                            {formatLastCompletedLabel(lastPerformedAtByExerciseId[variation.id])}
                                          </Text>
                                          {isVariationAlreadyAdded ? (
                                            <View
                                              style={{
                                                borderRadius: 6,
                                                paddingHorizontal: 6,
                                                paddingVertical: 2,
                                                backgroundColor: rawColors.surfaceSecondary,
                                              }}
                                            >
                                              <Text
                                                style={{
                                                  color: rawColors.foregroundMuted,
                                                  fontSize: 9,
                                                  fontWeight: "700",
                                                  letterSpacing: 0.8,
                                                  textTransform: "uppercase",
                                                }}
                                              >
                                                ADDED
                                              </Text>
                                            </View>
                                          ) : null}
                                        </View>
                                      </View>
                                      <View
                                        style={{
                                          width: 24,
                                          height: 24,
                                          borderRadius: 8,
                                          borderWidth: 2,
                                          alignItems: "center",
                                          justifyContent: "center",
                                          backgroundColor: isVariationSelected ? rawColors.primary : "transparent",
                                          borderColor: isVariationSelected ? rawColors.primary : rawColors.borderLight,
                                        }}
                                      >
                                        {isVariationSelected ? (
                                          <MaterialCommunityIcons
                                            name="check"
                                            size={16}
                                            color={rawColors.primaryForeground}
                                          />
                                        ) : null}
                                      </View>
                                    </View>
                                  </Pressable>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {selectedIds.size > 0 ? (
        <View
          className="absolute bottom-0 left-0 right-0 px-5 pt-4 bg-background border-t border-border"
          style={{ paddingBottom: Math.max(insets.bottom + 16, 24) }}
        >
          <Pressable
            onPress={handleAdd}
            className="flex-row items-center justify-center p-3.5 rounded-lg bg-primary"
            style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
          >
            <MaterialCommunityIcons
              name="plus"
              size={20}
              color={rawColors.primaryForeground}
            />
            <Text className="ml-2 text-base font-semibold text-primary-foreground">
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

      <AppModal visible={showSortModal} onClose={() => setShowSortModal(false)} maxWidth={380}>
        <Text
          style={{
            color: rawColors.foreground,
            fontSize: 22,
            fontWeight: "700",
          }}
        >
          Sort & Filter
        </Text>
        <Text
          style={{
            marginTop: 6,
            color: rawColors.foregroundSecondary,
            fontSize: 14,
            lineHeight: 20,
          }}
        >
          Choose how the library is ordered and shown.
        </Text>

        <View style={{ marginTop: 18, gap: 10 }}>
          {[
            {
              id: "alphabetical" as const,
              label: "Alphabetical",
              icon: "sort-alphabetical-ascending" as const,
            },
            {
              id: "lastCompleted" as const,
              label: "Last completed",
              icon: "clock-outline" as const,
            },
          ].map((option) => {
            const isSelected = sortOption === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => setSortOption(option.id)}
                className={`flex-row items-center gap-3 p-3.5 rounded-lg ${
                  isSelected ? "bg-primary" : "bg-surface-secondary"
                }`}
                style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}
              >
                <MaterialCommunityIcons
                  name={option.icon}
                  size={20}
                  color={isSelected ? rawColors.primaryForeground : rawColors.foregroundSecondary}
                />
                <Text
                  className={`flex-1 text-base font-semibold ${
                    isSelected ? "text-primary-foreground" : "text-foreground"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected ? (
                  <MaterialCommunityIcons name="check" size={18} color={rawColors.primaryForeground} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          {[
            { id: "ascending", label: sortOption === "alphabetical" ? "Ascending" : "Oldest" },
            { id: "descending", label: sortOption === "alphabetical" ? "Descending" : "Newest" },
          ].map((option) => {
            const isSelected =
              (option.id === "ascending" && sortAscending) ||
              (option.id === "descending" && !sortAscending);
            return (
              <Pressable
                key={option.id}
                onPress={() => setSortAscending(option.id === "ascending")}
                className={`flex-1 items-center justify-center p-3.5 rounded-lg ${
                  isSelected ? "bg-primary" : "bg-surface-secondary"
                }`}
                style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}
              >
                <Text
                  className={`text-base font-semibold ${
                    isSelected ? "text-primary-foreground" : "text-foreground-secondary"
                  }`}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View
          style={{
            marginTop: 18,
            borderRadius: 18,
            paddingHorizontal: 16,
            paddingVertical: 15,
            backgroundColor: rawColors.surfaceSecondary,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text
                style={{
                  color: rawColors.foreground,
                  fontSize: 15,
                  fontWeight: "700",
                }}
              >
                All tab body-part groups
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  color: rawColors.foregroundSecondary,
                  fontSize: 13,
                  lineHeight: 18,
                }}
              >
                Show or hide body-part section headings while viewing the `All` tab.
              </Text>
            </View>
            <Switch
              value={showAllTabBodyPartGrouping}
              onValueChange={handleShowAllTabBodyPartGroupingChange}
              trackColor={{
                false: isDark ? rawColors.border : "#C9D2E2",
                true: rawColors.primary,
              }}
              thumbColor={rawColors.primaryForeground}
              ios_backgroundColor={isDark ? rawColors.border : "#C9D2E2"}
            />
          </View>
        </View>
      </AppModal>
    </View>
  );
}
