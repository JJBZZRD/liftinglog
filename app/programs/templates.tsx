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
import { createPslProgram } from "../../lib/db/pslPrograms";
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
	  const [importing, setImporting] = useState(false);
	  const [importError, setImportError] = useState("");

  const displayTemplates = useMemo(() => {
    if (searchQuery) return searchTemplates(searchQuery);
    if (selectedCategory) return getTemplatesByCategory(selectedCategory);
    return PSL_TEMPLATES;
  }, [searchQuery, selectedCategory]);

	  const handlePreview = useCallback((template: PslTemplate) => {
	    setPreviewTemplate(template);
	    setShowPslSource(false);
	    setImportError("");
	    setPreviewVisible(true);
	  }, []);

	  const handleAddToMyPrograms = useCallback(async () => {
	    if (!previewTemplate) return;
	    setImporting(true);
	    setImportError("");

	    try {
	      await createPslProgram({
	        name: previewTemplate.name,
	        description: previewTemplate.description,
	        pslSource: previewTemplate.pslSource,
	        isActive: false,
	      });

	      setPreviewVisible(false);
	      setPreviewTemplate(null);
	      router.replace("/programs/manage");
	    } catch (error) {
	      console.error("Error adding template:", error);
	      setImportError(error instanceof Error ? error.message : "Failed to add template");
	    } finally {
	      setImporting(false);
	    }
	  }, [previewTemplate]);

	  const handleActivateFromTemplate = useCallback(async () => {
	    if (!previewTemplate) return;
	    setImporting(true);
	    setImportError("");

	    try {
	      const program = await createPslProgram({
	        name: previewTemplate.name,
	        description: previewTemplate.description,
	        pslSource: previewTemplate.pslSource,
	        isActive: false,
	      });

	      setPreviewVisible(false);
	      setPreviewTemplate(null);
	      router.replace({
	        pathname: "/programs/manage",
	        params: { activateProgramId: String(program.id) },
	      });
	    } catch (error) {
	      console.error("Error activating template:", error);
	      setImportError(error instanceof Error ? error.message : "Failed to activate template");
	    } finally {
	      setImporting(false);
	    }
	  }, [previewTemplate]);

	  const handleEditPsl = useCallback(() => {
	    if (!previewTemplate) return;
	    setPreviewVisible(false);
	    router.push({
	      pathname: "/programs/create/editor",
	      params: {
	        pslSource: previewTemplate.pslSource,
	      },
	    });
	  }, [previewTemplate]);

	  const previewCalendarOverride = useMemo(() => {
	    if (!previewTemplate) return null;

	    const startDateIso = getDefaultActivationStartDateIso();
	    const introspection = introspectPslSource(previewTemplate.pslSource);

	    if (!introspection.ok || !introspection.usesSchedule) return null;

	    if (introspection.hasBlocks) {
	      return { start_date: startDateIso };
	    }

	    return {
	      start_date: startDateIso,
	      end_date: computeEndDateIso(startDateIso, DEFAULT_ACTIVATION_WEEKS),
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
          styles.templateCard,
          {
            backgroundColor: pressed ? rawColors.pressed : rawColors.surface,
            borderColor: rawColors.borderLight,
          },
        ]}
      >
        <View style={styles.templateCardTop}>
          <View style={styles.templateCardInfo}>
            <Text
              style={[styles.templateName, { color: rawColors.foreground }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <Text
              style={[styles.templateDesc, { color: rawColors.foregroundSecondary }]}
              numberOfLines={2}
            >
              {item.description}
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={rawColors.foregroundSecondary}
          />
        </View>
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
        </View>
      </Pressable>
    ),
    [rawColors, handlePreview]
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

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight }]}>
          <MaterialCommunityIcons name="magnify" size={20} color={rawColors.foregroundMuted} />
          <TextInput
            style={[styles.searchInput, { color: rawColors.foreground }]}
            value={searchQuery}
            onChangeText={(q) => { setSearchQuery(q); if (q) setSelectedCategory(null); }}
            placeholder="Search templates..."
            placeholderTextColor={rawColors.foregroundMuted}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={18} color={rawColors.foregroundMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Category Chips */}
      <View style={styles.categoryContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
        <Pressable
          onPress={() => { setSelectedCategory(null); setSearchQuery(""); }}
          style={[
            styles.categoryChip,
            {
              backgroundColor: !selectedCategory ? rawColors.primary : rawColors.surfaceSecondary,
              borderColor: !selectedCategory ? rawColors.primary : rawColors.borderLight,
            },
          ]}
        >
          <Text
            style={[
              styles.categoryChipText,
              { color: !selectedCategory ? rawColors.primaryForeground : rawColors.foreground },
            ]}
          >
            All
          </Text>
        </Pressable>
        {TEMPLATE_CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => { setSelectedCategory(cat); setSearchQuery(""); }}
            style={[
              styles.categoryChip,
              {
                backgroundColor: selectedCategory === cat ? rawColors.primary : rawColors.surfaceSecondary,
                borderColor: selectedCategory === cat ? rawColors.primary : rawColors.borderLight,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={CATEGORY_ICONS[cat] as any}
              size={14}
              color={selectedCategory === cat ? rawColors.primaryForeground : rawColors.foreground}
            />
            <Text
              style={[
                styles.categoryChipText,
                { color: selectedCategory === cat ? rawColors.primaryForeground : rawColors.foreground },
              ]}
            >
              {cat}
            </Text>
          </Pressable>
        ))}
        </ScrollView>
      </View>

      {/* Template List */}
      <FlatList
        data={displayTemplates}
        keyExtractor={(item) => item.id}
        renderItem={renderTemplate}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="file-search-outline" size={48} color={rawColors.foregroundMuted} />
            <Text style={[styles.emptyText, { color: rawColors.foregroundMuted }]}>
              No templates found
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

	            {importError ? (
	              <Text style={[styles.importError, { color: rawColors.destructive }]}>
	                {importError}
	              </Text>
	            ) : null}

	            {/* Action Buttons */}
	            <View style={styles.previewActions}>
	              <Pressable
	                onPress={handleAddToMyPrograms}
	                disabled={importing}
	                className="flex-row items-center justify-center py-4 rounded-xl border border-primary bg-primary gap-2"
	                style={({ pressed }) => ({ opacity: pressed || importing ? 0.7 : 1 })}
	              >
	                <MaterialCommunityIcons name="download" size={20} color={rawColors.primaryForeground} />
	                <Text className="text-base font-semibold text-primary-foreground">
	                  {importing ? "Adding..." : "Add to My Programs"}
	                </Text>
	              </Pressable>
	              <View style={styles.secondaryActions}>
	                <Pressable
	                  onPress={handleActivateFromTemplate}
	                  disabled={importing}
	                  className="flex-1 flex-row items-center justify-center py-3.5 rounded-xl border border-primary gap-1.5"
	                  style={({ pressed }) => ({
	                    backgroundColor: pressed ? rawColors.primary + "15" : "transparent",
	                    opacity: importing ? 0.6 : 1,
	                  })}
	                >
	                  <MaterialCommunityIcons name="play" size={18} color={rawColors.primary} />
	                  <Text className="text-sm font-semibold" style={{ color: rawColors.primary }}>
	                    Activate
	                  </Text>
	                </Pressable>
	                <Pressable
	                  onPress={handleEditPsl}
	                  disabled={importing}
	                  className="flex-1 flex-row items-center justify-center py-3.5 rounded-xl border border-border gap-1.5"
	                  style={({ pressed }) => ({
	                    backgroundColor: pressed ? rawColors.surfaceSecondary : "transparent",
	                    opacity: importing ? 0.6 : 1,
	                  })}
	                >
	                  <MaterialCommunityIcons name="code-tags" size={18} color={rawColors.foregroundSecondary} />
	                  <Text className="text-sm font-semibold" style={{ color: rawColors.foregroundSecondary }}>
	                    Edit PSL
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
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
  categoryContainer: {
    paddingVertical: 8,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: "center",
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  templateCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 10,
  },
  templateCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  templateCardInfo: {
    flex: 1,
    marginRight: 8,
  },
  templateName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  templateDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  templateTags: {
    flexDirection: "row",
    marginTop: 10,
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
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
	  importError: {
	    marginTop: 10,
	    marginBottom: 6,
	    fontSize: 13,
	    fontWeight: "600",
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
