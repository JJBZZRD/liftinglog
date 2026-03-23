import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import BaseModal from "../../components/modals/BaseModal";
import { useTheme } from "../../lib/theme/ThemeContext";
import {
	PSL_TEMPLATES,
	TEMPLATE_CATEGORIES,
	searchTemplates,
	getTemplatesByCategory,
	type PslTemplate,
	type TemplateCategory,
} from "../../lib/programs/psl/pslTemplates";
import { compilePslSource } from "../../lib/programs/psl/pslService";
import {
  computeEndDateIso,
  DEFAULT_ACTIVATION_WEEKS,
  getDefaultActivationStartDateIso,
} from "../../lib/programs/psl/activationDates";
import { introspectPslSource } from "../../lib/programs/psl/pslIntrospection";

const CATEGORY_ICONS: Record<TemplateCategory, string> = {
  Beginner: "school-outline",
  Strength: "arm-flex-outline",
  Powerlifting: "weight-lifter",
  Hypertrophy: "human-handsup",
  Powerbuilding: "lightning-bolt-outline",
  "Single-Exercise": "target",
};

export default function TemplateBrowserScreen() {
  const { rawColors } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<PslTemplate | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [showPslSource, setShowPslSource] = useState(false);
  const trimmedSearchQuery = searchQuery.trim();

  const displayTemplates = useMemo(() => {
    if (trimmedSearchQuery) return searchTemplates(trimmedSearchQuery);
    if (selectedCategory) return getTemplatesByCategory(selectedCategory);
    return PSL_TEMPLATES;
  }, [trimmedSearchQuery, selectedCategory]);

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(
      TEMPLATE_CATEGORIES.map((category) => [category, 0])
    ) as Record<TemplateCategory, number>;

    PSL_TEMPLATES.forEach((template) => {
      counts[template.category] += 1;
    });

    return counts;
  }, []);

  const resultsLabel = `${displayTemplates.length} template${displayTemplates.length === 1 ? "" : "s"}`;
  const hasActiveSearch = trimmedSearchQuery.length > 0;
  const listSectionTitle = hasActiveSearch
    ? "Search Results"
    : selectedCategory
      ? `${selectedCategory} Templates`
      : "Browse Templates";
  const summaryDescription = hasActiveSearch
    ? `Results for "${trimmedSearchQuery}". Tap any program to preview it before importing.`
    : selectedCategory
      ? `${selectedCategory} programs ready to preview and import into your library.`
      : "Ready-made programs you can preview and import into your library.";

  const handlePreview = useCallback((template: PslTemplate) => {
    setPreviewTemplate(template);
    setShowPslSource(false);
    setPreviewVisible(true);
  }, []);

  const handleAddToMyPrograms = useCallback(async () => {
    if (!previewTemplate) return;
    setPreviewVisible(false);
    setPreviewTemplate(null);
    router.push({
      pathname: "/programs/template-import",
      params: {
        templateId: previewTemplate.id,
        action: "save",
      },
    });
  }, [previewTemplate]);

  const handleActivateFromTemplate = useCallback(async () => {
    if (!previewTemplate) return;
    setPreviewVisible(false);
    setPreviewTemplate(null);
    router.push({
      pathname: "/programs/template-import",
      params: {
        templateId: previewTemplate.id,
        action: "activate",
      },
    });
  }, [previewTemplate]);

  const previewCalendarOverride = useMemo(() => {
    if (!previewTemplate) return null;

    const startDateIso = getDefaultActivationStartDateIso();
    const introspection = introspectPslSource(previewTemplate.pslSource);

    if (!introspection.ok) return null;

    if (introspection.hasBlocks) {
      return { start_date: startDateIso };
    }

    if (!introspection.requiresEndDateForActivation) return null;

    const previewWeeks =
      previewTemplate.defaultActivationWeeks ?? DEFAULT_ACTIVATION_WEEKS;

    return {
      start_date: startDateIso,
      end_date: computeEndDateIso(startDateIso, previewWeeks),
    };
  }, [previewTemplate]);

  // Parse template preview info
  const previewInfo = useMemo(() => {
    if (!previewTemplate) return null;
    const result = compilePslSource(
      previewTemplate.pslSource,
      previewCalendarOverride ? { calendarOverride: previewCalendarOverride } : {}
    );
    if (!result.valid || !result.compiled) return null;

    const sessions = result.compiled.sessions.map((s) => ({
      name: s.name,
      exercises: s.exercises.map((e) => ({
        name: e.exercise,
        setsSummary: e.sets
          .map((set) => {
            const reps = set.reps
              ? set.reps.min === set.reps.max
                ? String(set.reps.min)
                : `${set.reps.min}-${set.reps.max}`
              : "?";
            return reps;
          })
          .join(", "),
        totalSets: e.sets.length,
      })),
    }));

    return { sessions, units: result.compiled.units };
  }, [previewTemplate, previewCalendarOverride]);

  const renderTemplate = useCallback(
    ({ item }: { item: PslTemplate }) => (
      <Pressable
        onPress={() => handlePreview(item)}
        style={({ pressed }) => [
          styles.templateCardShell,
          {
            backgroundColor: pressed ? rawColors.primary + "18" : rawColors.border,
            shadowColor: rawColors.shadow,
          },
        ]}
      >
        {({ pressed }) => (
          <View
            style={[
              styles.templateCard,
              {
                backgroundColor: pressed ? rawColors.surfaceSecondary : rawColors.surface,
              },
            ]}
          >
            <View style={styles.templateCardTop}>
              <View
                style={[
                  styles.templateIconCircle,
                  { backgroundColor: pressed ? rawColors.primary + "1C" : rawColors.primary + "12" },
                ]}
              >
                <MaterialCommunityIcons
                  name={CATEGORY_ICONS[item.category] as any}
                  size={18}
                  color={rawColors.primary}
                />
              </View>
              <View style={styles.templateCardInfo}>
                <Text
                  style={[styles.templateName, { color: rawColors.foreground }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text
                  style={[styles.templateKicker, { color: rawColors.foregroundMuted }]}
                  numberOfLines={1}
                >
                  {item.category} template
                </Text>
              </View>
              <View
                style={[
                  styles.chevronBadge,
                  {
                    backgroundColor: pressed
                      ? rawColors.primary + "12"
                      : rawColors.surfaceSecondary,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={18}
                  color={rawColors.foregroundSecondary}
                />
              </View>
            </View>

            <Text
              style={[styles.templateDesc, { color: rawColors.foregroundSecondary }]}
              numberOfLines={3}
            >
              {item.description}
            </Text>

            <View style={styles.templateTags}>
              <View style={[styles.tag, { backgroundColor: rawColors.primary + "15" }]}>
                <Text style={[styles.tagText, { color: rawColors.primary }]}>
                  {item.category}
                </Text>
              </View>
              <View style={[styles.tag, { backgroundColor: rawColors.surfaceSecondary }]}>
                <Text style={[styles.tagText, { color: rawColors.foregroundSecondary }]}>
                  {item.daysPerWeek} days/wk
                </Text>
              </View>
              <View style={[styles.previewTag, { backgroundColor: rawColors.surfaceSecondary }]}>
                <MaterialCommunityIcons
                  name="eye-outline"
                  size={14}
                  color={rawColors.foregroundMuted}
                />
                <Text style={[styles.previewTagText, { color: rawColors.foregroundMuted }]}>
                  Preview
                </Text>
              </View>
            </View>
          </View>
        )}
      </Pressable>
    ),
    [rawColors, handlePreview]
  );

  const renderTemplateSeparator = useCallback(
    () => <View style={styles.templateCardSeparator} />,
    []
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: rawColors.surface,
              borderColor: rawColors.borderLight,
            },
          ]}
        >
          <View style={styles.summaryHeaderRow}>
            <View
              style={[
                styles.summaryIconCircle,
                { backgroundColor: rawColors.primary + "12" },
              ]}
            >
              <MaterialCommunityIcons
                name="book-open-page-variant-outline"
                size={20}
                color={rawColors.primary}
              />
            </View>
            <View style={styles.summaryTextBlock}>
              <Text style={[styles.summaryEyebrow, { color: rawColors.foregroundMuted }]}>
                Template Library
              </Text>
              <Text style={[styles.summaryTitle, { color: rawColors.foreground }]}>
                {resultsLabel}
              </Text>
            </View>
            <View
              style={[
                styles.summaryCountBadge,
                { backgroundColor: rawColors.surfaceSecondary },
              ]}
            >
              <Text style={[styles.summaryCountValue, { color: rawColors.foreground }]}>
                {PSL_TEMPLATES.length}
              </Text>
              <Text style={[styles.summaryCountLabel, { color: rawColors.foregroundMuted }]}>
                total
              </Text>
            </View>
          </View>

          <Text
            style={[styles.summaryDescription, { color: rawColors.foregroundSecondary }]}
          >
            {summaryDescription}
          </Text>

          <View style={styles.summaryMetaRow}>
            <View style={[styles.summaryMetaPill, { backgroundColor: rawColors.primary + "12" }]}>
              <MaterialCommunityIcons
                name="shape-outline"
                size={14}
                color={rawColors.primary}
              />
              <Text style={[styles.summaryMetaText, { color: rawColors.primary }]}>
                {selectedCategory ?? "All templates"}
              </Text>
            </View>
            <View
              style={[
                styles.summaryMetaPill,
                { backgroundColor: rawColors.surfaceSecondary },
              ]}
            >
              <MaterialCommunityIcons
                name={hasActiveSearch ? "magnify" : "gesture-tap"}
                size={14}
                color={rawColors.foregroundMuted}
              />
              <Text style={[styles.summaryMetaText, { color: rawColors.foregroundMuted }]}>
                {hasActiveSearch ? trimmedSearchQuery : "Tap a card to preview"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: rawColors.surface,
                borderColor: rawColors.border,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="magnify"
              size={20}
              color={rawColors.foregroundMuted}
            />
            <TextInput
              style={[styles.searchInput, { color: rawColors.foreground }]}
              value={searchQuery}
              onChangeText={(q) => {
                setSearchQuery(q);
                if (q.trim()) setSelectedCategory(null);
              }}
              placeholder="Search templates..."
              placeholderTextColor={rawColors.foregroundMuted}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                <MaterialCommunityIcons
                  name="close-circle"
                  size={18}
                  color={rawColors.foregroundMuted}
                />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          <Pressable
            onPress={() => {
              setSelectedCategory(null);
              setSearchQuery("");
            }}
            style={[
              styles.categoryChip,
              {
                backgroundColor: !selectedCategory
                  ? rawColors.primary
                  : rawColors.surface,
                borderColor: !selectedCategory
                  ? rawColors.primary
                  : rawColors.borderLight,
              },
            ]}
          >
            <Text
              style={[
                styles.categoryChipText,
                {
                  color: !selectedCategory
                    ? rawColors.primaryForeground
                    : rawColors.foreground,
                },
              ]}
            >
              All
            </Text>
            <View
              style={[
                styles.categoryChipCount,
                {
                  backgroundColor: !selectedCategory
                    ? rawColors.primaryForeground + "24"
                    : rawColors.surfaceSecondary,
                },
              ]}
            >
              <Text
                style={[
                  styles.categoryChipCountText,
                  {
                    color: !selectedCategory
                      ? rawColors.primaryForeground
                      : rawColors.foregroundMuted,
                  },
                ]}
              >
                {PSL_TEMPLATES.length}
              </Text>
            </View>
          </Pressable>
          {TEMPLATE_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => {
                  setSelectedCategory(cat);
                  setSearchQuery("");
                }}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: isSelected ? rawColors.primary : rawColors.surface,
                    borderColor: isSelected ? rawColors.primary : rawColors.borderLight,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={CATEGORY_ICONS[cat] as any}
                  size={14}
                  color={isSelected ? rawColors.primaryForeground : rawColors.foreground}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    {
                      color: isSelected
                        ? rawColors.primaryForeground
                        : rawColors.foreground,
                    },
                  ]}
                >
                  {cat}
                </Text>
                <View
                  style={[
                    styles.categoryChipCount,
                    {
                      backgroundColor: isSelected
                        ? rawColors.primaryForeground + "24"
                        : rawColors.surfaceSecondary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipCountText,
                      {
                        color: isSelected
                          ? rawColors.primaryForeground
                          : rawColors.foregroundMuted,
                      },
                    ]}
                  >
                    {categoryCounts[cat]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.listSectionHeader}>
          <Text style={[styles.listSectionTitle, { color: rawColors.foreground }]}>
            {listSectionTitle}
          </Text>
          <View
            style={[
              styles.listSectionCount,
              { backgroundColor: rawColors.surfaceSecondary },
            ]}
          >
            <Text style={[styles.listSectionCountText, { color: rawColors.foregroundMuted }]}>
              {displayTemplates.length}
            </Text>
          </View>
        </View>
      </View>
    ),
    [
      categoryCounts,
      displayTemplates.length,
      hasActiveSearch,
      listSectionTitle,
      rawColors,
      resultsLabel,
      searchQuery,
      selectedCategory,
      summaryDescription,
      trimmedSearchQuery,
    ]
  );

  return (
    <View style={styles.container} className="bg-background">
      <Stack.Screen
        options={{
          title: "Templates",
          headerStyle: { backgroundColor: rawColors.background },
          headerTintColor: rawColors.foreground,
        }}
      />

      <FlatList
        data={displayTemplates}
        keyExtractor={(item) => item.id}
        renderItem={renderTemplate}
        ItemSeparatorComponent={renderTemplateSeparator}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View
            style={[
              styles.emptyState,
              {
                backgroundColor: rawColors.surface,
                borderColor: rawColors.borderLight,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="file-search-outline"
              size={40}
              color={rawColors.foregroundMuted}
            />
            <Text style={[styles.emptyTitle, { color: rawColors.foreground }]}>
              No templates found
            </Text>
            <Text style={[styles.emptyText, { color: rawColors.foregroundMuted }]}>
              Try a different search term or switch categories.
            </Text>
          </View>
        }
      />

      {/* Preview Modal */}
      <BaseModal
        visible={previewVisible}
        onClose={() => { setPreviewVisible(false); setPreviewTemplate(null); }}
      >
        {previewTemplate && (
          <ScrollView style={styles.previewScroll}>
            <Text style={[styles.previewTitle, { color: rawColors.foreground }]}>
              {previewTemplate.name}
            </Text>
            <Text style={[styles.previewDesc, { color: rawColors.foregroundSecondary }]}>
              {previewTemplate.description}
            </Text>

            <View style={styles.previewTags}>
              <View style={[styles.tag, { backgroundColor: rawColors.primary + "15" }]}>
                <Text style={[styles.tagText, { color: rawColors.primary }]}>
                  {previewTemplate.category}
                </Text>
              </View>
              <View style={[styles.tag, { backgroundColor: rawColors.surfaceSecondary }]}>
                <Text style={[styles.tagText, { color: rawColors.foregroundSecondary }]}>
                  {previewTemplate.daysPerWeek} days/week
                </Text>
              </View>
              {previewTemplate.defaultActivationWeeks ? (
                <View style={[styles.tag, { backgroundColor: rawColors.surfaceSecondary }]}>
                  <Text style={[styles.tagText, { color: rawColors.foregroundSecondary }]}>
                    {previewTemplate.defaultActivationWeeks} week cycle
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Session Breakdown */}
	            {previewInfo && (
	              <View style={styles.sessionsPreview}>
	                <Text style={[styles.previewSectionTitle, { color: rawColors.foreground }]}>
	                  Sessions
	                </Text>
                {previewInfo.sessions.map((session, i) => (
                  <View
                    key={i}
                    style={[styles.sessionCard, { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight }]}
                  >
                    <Text style={[styles.sessionName, { color: rawColors.foreground }]}>
                      {session.name}
                    </Text>
                    {session.exercises.map((ex, j) => (
                      <Text
                        key={j}
                        style={[styles.sessionExercise, { color: rawColors.foregroundSecondary }]}
                        numberOfLines={1}
                      >
                        {ex.name} - {ex.totalSets} sets
                      </Text>
                    ))}
                  </View>
                ))}
	              </View>
	            )}

	            {previewCalendarOverride && (
	              <Text style={[styles.previewHint, { color: rawColors.foregroundMuted }]}>
	                Preview dates: {previewCalendarOverride.start_date}
	                {"end_date" in previewCalendarOverride ? ` → ${previewCalendarOverride.end_date}` : ""}
	              </Text>
	            )}

	            {/* PSL Source (collapsible) */}
	            <Pressable
	              onPress={() => setShowPslSource(!showPslSource)}
              style={styles.pslToggle}
            >
              <Text style={[styles.pslToggleText, { color: rawColors.foregroundSecondary }]}>
                {showPslSource ? "Hide" : "Show"} PSL Source
              </Text>
              <MaterialCommunityIcons
                name={showPslSource ? "chevron-up" : "chevron-down"}
                size={18}
                color={rawColors.foregroundSecondary}
              />
            </Pressable>

	            {showPslSource && (
	              <View style={[styles.pslSourceBox, { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight }]}>
	                <Text style={[styles.pslSourceText, { color: rawColors.foreground }]}>
	                  {previewTemplate.pslSource}
	                </Text>
	              </View>
	            )}

	            {/* Action Buttons */}
	            <View style={styles.previewActions}>
	              <Pressable
	                onPress={handleAddToMyPrograms}
	                className="flex-row items-center justify-center py-4 rounded-xl border border-primary bg-primary gap-2"
	                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
	              >
	                <MaterialCommunityIcons name="download" size={20} color={rawColors.primaryForeground} />
	                <Text className="text-base font-semibold text-primary-foreground">
	                  Add to My Programs
	                </Text>
	              </Pressable>
	              <View style={styles.secondaryActions}>
	                <Pressable
	                  onPress={handleActivateFromTemplate}
	                  className="flex-1 flex-row items-center justify-center py-3.5 rounded-xl border border-primary gap-1.5"
	                  style={({ pressed }) => ({
	                    backgroundColor: pressed ? rawColors.primary + "15" : "transparent",
	                  })}
	                >
	                  <MaterialCommunityIcons name="play" size={18} color={rawColors.primary} />
	                  <Text className="text-sm font-semibold" style={{ color: rawColors.primary }}>
	                    Activate
	                  </Text>
	                </Pressable>
	              </View>
	            </View>
          </ScrollView>
        )}
      </BaseModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listHeader: {
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  summaryCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  summaryTextBlock: {
    flex: 1,
  },
  summaryEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  summaryTitle: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  summaryCountBadge: {
    minWidth: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 1,
  },
  summaryCountValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  summaryCountLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  summaryDescription: {
    fontSize: 14,
    lineHeight: 21,
  },
  summaryMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    gap: 6,
  },
  summaryMetaText: {
    fontSize: 12,
    fontWeight: "600",
  },
  searchContainer: {
    paddingTop: 2,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  categoryScroll: {
    paddingVertical: 2,
    paddingRight: 16,
    gap: 8,
    alignItems: "center",
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    gap: 8,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  categoryChipCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  categoryChipCountText: {
    fontSize: 11,
    fontWeight: "700",
  },
  listSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    paddingBottom: 2,
  },
  listSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  listSectionCount: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  listSectionCountText: {
    fontSize: 12,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  templateCardShell: {
    borderRadius: 25,
    padding: 1,
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.10)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  templateCard: {
    borderRadius: 24,
    padding: 16,
    paddingBottom: 18,
  },
  templateCardSeparator: {
    height: 18,
  },
  templateCardTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  templateIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  templateCardInfo: {
    flex: 1,
  },
  chevronBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  templateName: {
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
  },
  templateKicker: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
    marginTop: 3,
  },
  templateDesc: {
    fontSize: 14,
    lineHeight: 21,
  },
  templateTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 16,
    gap: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "700",
  },
  previewTag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    gap: 6,
  },
  previewTagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 36,
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  previewScroll: {
    maxHeight: 550,
  },
  previewTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
  },
  previewDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  previewTags: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
	  previewSectionTitle: {
	    fontSize: 15,
	    fontWeight: "700",
	    marginBottom: 10,
	  },
	  previewHint: {
	    fontSize: 12,
	    marginTop: 6,
	    marginBottom: 6,
	  },
	  sessionsPreview: {
	    marginBottom: 16,
	  },
  sessionCard: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 8,
  },
  sessionName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  sessionExercise: {
    fontSize: 13,
    paddingVertical: 1,
  },
  pslToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 4,
  },
  pslToggleText: {
    fontSize: 13,
    fontWeight: "500",
  },
  pslSourceBox: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 16,
  },
	  pslSourceText: {
	    fontSize: 11,
	    fontFamily: "monospace",
	    lineHeight: 16,
	  },
	  previewActions: {
	    gap: 10,
	    marginTop: 8,
	    marginBottom: 16,
	  },
	  secondaryActions: {
	    flexDirection: "row",
	    gap: 10,
	  },
	});
