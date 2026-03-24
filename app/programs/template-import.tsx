import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AppModal from "../../components/modals/BaseModal";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import {
  createExercise,
  getExerciseByName,
  listExercises,
  type Exercise,
} from "../../lib/db/exercises";
import { createPslProgram } from "../../lib/db/pslPrograms";
import {
  buildImportedTemplateName,
  buildPersonalizedTemplateSource,
  getTemplateById,
} from "../../lib/programs/psl/pslTemplates";
import {
  getTemplateExerciseSuggestions,
  matchTemplateExercises,
  type TemplateExerciseMatch,
  type TemplateExerciseRequirement,
} from "../../lib/programs/psl/templateExercises";
import { useTheme } from "../../lib/theme/ThemeContext";
import { returnToManagePrograms } from "../../lib/utils/programNavigation";

type ImportMode = "save" | "activate";

type TemplateImportResolution =
  | {
      kind: "pending";
    }
  | {
      kind: "existing";
      exercise: Exercise;
      source: "exact" | "suggested" | "manual";
    }
  | {
      kind: "create";
      name: string;
    };

type PickerOption = {
  exercise: Exercise;
  detail: string;
  source: "library" | "exact" | "alias" | "fuzzy";
};

function resolveImportMode(value: string | undefined): ImportMode {
  return value === "activate" ? "activate" : "save";
}

function requiresExplicitExerciseSelection(
  requirement: TemplateExerciseRequirement
): boolean {
  return requirement.resolutionStrategy === "select_or_create";
}

function getDefaultResolution(
  requirement: TemplateExerciseRequirement
): TemplateImportResolution {
  if (requiresExplicitExerciseSelection(requirement)) {
    return { kind: "pending" };
  }

  return {
    kind: "create",
    name: requirement.canonicalName,
  };
}

export default function TemplateImportScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const params = useLocalSearchParams<{ templateId?: string; action?: string }>();
  const templateId = typeof params.templateId === "string" ? params.templateId : "";
  const template = useMemo(
    () => getTemplateById(templateId, unitPreference),
    [templateId, unitPreference]
  );
  const importMode = resolveImportMode(
    typeof params.action === "string" ? params.action : undefined
  );

  const [libraryExercises, setLibraryExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [resolutions, setResolutions] = useState<
    Record<string, TemplateImportResolution>
  >({});
  const [pickerRequirementId, setPickerRequirementId] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");

  useEffect(() => {
    if (!template) {
      router.back();
    }
  }, [template]);

  useEffect(() => {
    if (!template) return;
    const currentTemplate = template;

    let cancelled = false;

    async function loadExercises() {
      setLoading(true);
      try {
        const exercises = await listExercises();
        if (cancelled) return;

        setLibraryExercises(exercises);
        const initialMatches = matchTemplateExercises(
          currentTemplate.exerciseRequirements,
          exercises
        );

        const initialResolutions = Object.fromEntries(
          initialMatches.map((match) => [
            match.requirement.exerciseId,
            match.exactMatch &&
            !requiresExplicitExerciseSelection(match.requirement)
              ? {
                  kind: "existing",
                  exercise: match.exactMatch.exercise,
                  source: "exact",
                }
              : getDefaultResolution(match.requirement),
          ])
        ) as Record<string, TemplateImportResolution>;

        setResolutions(initialResolutions);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load exercise library."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadExercises();

    return () => {
      cancelled = true;
    };
  }, [template]);

  const exerciseMatches = useMemo(() => {
    if (!template) return [];
    return matchTemplateExercises(template.exerciseRequirements, libraryExercises);
  }, [libraryExercises, template]);

  const matchesByRequirementId = useMemo(() => {
    return new Map(
      exerciseMatches.map((match) => [match.requirement.exerciseId, match] as const)
    );
  }, [exerciseMatches]);

  const pickerRequirement = useMemo(
    () =>
      template?.exerciseRequirements.find(
        (requirement) => requirement.exerciseId === pickerRequirementId
      ) ?? null,
    [pickerRequirementId, template]
  );

  const pickerOptions = useMemo<PickerOption[]>(() => {
    if (!pickerRequirement) return [];

    if (requiresExplicitExerciseSelection(pickerRequirement)) {
      const query = pickerQuery.trim().toLowerCase();
      return [...libraryExercises]
        .filter((exercise) =>
          query.length === 0 ? true : exercise.name.toLowerCase().includes(query)
        )
        .sort((left, right) => {
          if (query.length > 0) {
            const leftStartsWith = left.name.toLowerCase().startsWith(query);
            const rightStartsWith = right.name.toLowerCase().startsWith(query);
            if (leftStartsWith !== rightStartsWith) {
              return leftStartsWith ? -1 : 1;
            }
          }

          return left.name.localeCompare(right.name);
        })
        .map((exercise) => ({
          exercise,
          detail: "Existing exercise",
          source: "library" as const,
        }));
    }

    const suggestions = getTemplateExerciseSuggestions(
      pickerRequirement,
      libraryExercises,
      {
        includeLowConfidence: true,
        limit: libraryExercises.length,
      }
    );

    if (!pickerQuery.trim()) {
      return suggestions.map((suggestion) => ({
        exercise: suggestion.exercise,
        detail:
          suggestion.matchType === "alias"
            ? `Alias match on "${suggestion.matchedName}"`
            : suggestion.matchType === "exact"
              ? "Exact template name match"
              : `Similarity ${Math.round(suggestion.score * 100)}%`,
        source: suggestion.matchType,
      }));
    }

    const query = pickerQuery.trim().toLowerCase();
    return suggestions
      .filter(
        (suggestion) =>
          suggestion.exercise.name.toLowerCase().includes(query) ||
          suggestion.matchedName.toLowerCase().includes(query)
      )
      .map((suggestion) => ({
        exercise: suggestion.exercise,
        detail:
          suggestion.matchType === "alias"
            ? `Alias match on "${suggestion.matchedName}"`
            : suggestion.matchType === "exact"
              ? "Exact template name match"
              : `Similarity ${Math.round(suggestion.score * 100)}%`,
        source: suggestion.matchType,
      }));
  }, [libraryExercises, pickerQuery, pickerRequirement]);

  const pickerCreateName = useMemo(() => {
    if (!pickerRequirement) return "";
    const trimmedQuery = pickerQuery.trim();
    if (trimmedQuery.length > 0) {
      return trimmedQuery;
    }
    return requiresExplicitExerciseSelection(pickerRequirement)
      ? ""
      : pickerRequirement.canonicalName;
  }, [pickerQuery, pickerRequirement]);

  const counts = useMemo(() => {
    if (!template) {
      return {
        existing: 0,
        creating: 0,
        suggested: 0,
        pending: 0,
      };
    }

    let existing = 0;
    let creating = 0;
    let suggested = 0;
    let pending = 0;

    template.exerciseRequirements.forEach((requirement) => {
      const resolution = resolutions[requirement.exerciseId];
      const match = matchesByRequirementId.get(requirement.exerciseId);

      if (resolution?.kind === "existing") {
        existing += 1;
        return;
      }

      if (resolution?.kind === "pending") {
        pending += 1;
        return;
      }

      creating += 1;
      if (match?.suggestions.some((suggestion) => suggestion.matchType !== "exact")) {
        suggested += 1;
      }
    });

    return { existing, creating, suggested, pending };
  }, [matchesByRequirementId, resolutions, template]);

  const setExistingResolution = useCallback(
    (
      requirement: TemplateExerciseRequirement,
      exercise: Exercise,
      source: "exact" | "suggested" | "manual"
    ) => {
      setResolutions((current) => ({
        ...current,
        [requirement.exerciseId]: {
          kind: "existing",
          exercise,
          source,
        },
      }));
    },
    []
  );

  const setCreateResolution = useCallback(
    (requirement: TemplateExerciseRequirement, name?: string) => {
      const nextName = name?.trim() || requirement.canonicalName;
      setResolutions((current) => ({
        ...current,
        [requirement.exerciseId]: {
          kind: "create",
          name: nextName,
        },
      }));
    },
    []
  );

  const handleConfirmImport = useCallback(async () => {
    if (!template) return;

    setImporting(true);
    setError("");

    try {
      const exerciseNameOverrides: Record<string, string> = {};

      for (const requirement of template.exerciseRequirements) {
        const resolution =
          resolutions[requirement.exerciseId] ?? getDefaultResolution(requirement);

        if (resolution.kind === "pending") {
          throw new Error(
            `Choose a target exercise for ${requirement.canonicalName} before importing.`
          );
        }

        if (resolution.kind === "existing") {
          exerciseNameOverrides[requirement.exerciseId] = resolution.exercise.name;
          continue;
        }

        const nextName = resolution.name.trim();
        if (!nextName) {
          throw new Error(`Enter a name for ${requirement.canonicalName} before importing.`);
        }

        const existingExercise = await getExerciseByName(nextName);
        if (!existingExercise) {
          await createExercise({ name: nextName });
        }

        exerciseNameOverrides[requirement.exerciseId] = nextName;
      }

      const programName = buildImportedTemplateName(template.id, exerciseNameOverrides);
      const pslSource = buildPersonalizedTemplateSource(
        template.id,
        exerciseNameOverrides,
        programName,
        { targetUnit: unitPreference }
      );

      const program = await createPslProgram({
        name: programName,
        description: template.description,
        pslSource,
        isActive: false,
        units: unitPreference,
      });

      if (importMode === "activate") {
        returnToManagePrograms({ activateProgramId: String(program.id) });
        return;
      }

      returnToManagePrograms();
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Failed to import template."
      );
    } finally {
      setImporting(false);
    }
  }, [importMode, resolutions, template, unitPreference]);

  const renderMatchRow = useCallback(
    (match: TemplateExerciseMatch<Exercise>) => {
      const resolution =
        resolutions[match.requirement.exerciseId] ?? getDefaultResolution(match.requirement);
      const explicitSelectionRequired = requiresExplicitExerciseSelection(
        match.requirement
      );
      const topSuggestion =
        match.suggestions.find((suggestion) => suggestion.matchType !== "exact") ?? null;

      return (
        <View
          key={match.requirement.exerciseId}
          style={[
            styles.matchCard,
            {
              backgroundColor: rawColors.surface,
              borderColor: rawColors.borderLight,
            },
          ]}
        >
          <View style={styles.matchHeader}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.matchName, { color: rawColors.foreground }]}>
                {match.requirement.canonicalName}
              </Text>
              <Text
                style={[
                  styles.matchSummary,
                  { color: rawColors.foregroundSecondary },
                ]}
              >
                {resolution.kind === "existing"
                  ? `Using ${resolution.exercise.name}`
                  : resolution.kind === "pending"
                    ? "Choose the target exercise before import."
                  : `Will add ${resolution.name} to your library on import`}
              </Text>
            </View>
            <View
              style={[
                styles.matchBadge,
                {
                  backgroundColor:
                    resolution.kind === "existing"
                      ? rawColors.primary + "14"
                      : rawColors.surfaceSecondary,
                },
              ]}
            >
              <Text
                style={[
                  styles.matchBadgeText,
                  {
                    color:
                      resolution.kind === "existing"
                        ? rawColors.primary
                        : rawColors.foregroundSecondary,
                  },
                ]}
                  >
                {resolution.kind === "pending"
                  ? "Pending"
                  : resolution.kind === "existing"
                  ? resolution.source === "exact"
                    ? "Exact"
                    : resolution.source === "suggested"
                      ? "Suggested"
                      : "Manual"
                  : "Create"}
              </Text>
            </View>
          </View>

          {topSuggestion &&
          resolution.kind !== "existing" &&
          !explicitSelectionRequired ? (
            <View
              style={[
                styles.suggestionBox,
                {
                  backgroundColor: rawColors.primary + "10",
                  borderColor: rawColors.primary + "25",
                },
              ]}
            >
              <Text style={[styles.suggestionLabel, { color: rawColors.primary }]}>
                Possible match
              </Text>
              <Text
                style={[
                  styles.suggestionText,
                  { color: rawColors.foregroundSecondary },
                ]}
              >
                {topSuggestion.exercise.name}
                {topSuggestion.matchType === "alias"
                  ? ` matches alias "${topSuggestion.matchedName}"`
                  : ` looks similar to "${topSuggestion.matchedName}"`}
              </Text>
            </View>
          ) : null}

          <View style={styles.matchActions}>
            {topSuggestion &&
            resolution.kind !== "existing" &&
            !explicitSelectionRequired ? (
              <Pressable
                onPress={() =>
                  setExistingResolution(
                    match.requirement,
                    topSuggestion.exercise,
                    "suggested"
                  )
                }
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    borderColor: rawColors.primary,
                    backgroundColor: pressed ? rawColors.primary + "12" : "transparent",
                  },
                ]}
              >
                <Text style={[styles.secondaryButtonText, { color: rawColors.primary }]}>
                  Use Suggestion
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => {
                setPickerRequirementId(match.requirement.exerciseId);
                setPickerQuery("");
              }}
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: rawColors.borderLight,
                  backgroundColor: pressed ? rawColors.surfaceSecondary : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: rawColors.foregroundSecondary },
                ]}
              >
                {resolution.kind === "existing"
                  ? "Choose Different"
                  : explicitSelectionRequired
                    ? "Choose Exercise"
                    : "Choose Existing"}
              </Text>
            </Pressable>

            {resolution.kind === "existing" && !explicitSelectionRequired ? (
              <Pressable
                onPress={() => setCreateResolution(match.requirement)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    borderColor: rawColors.borderLight,
                    backgroundColor: pressed ? rawColors.surfaceSecondary : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    { color: rawColors.foregroundSecondary },
                  ]}
                >
                  Create New
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    },
    [rawColors, resolutions, setCreateResolution, setExistingResolution]
  );

  if (!template) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: rawColors.background }]}>
      <Stack.Screen
        options={{
          title: "Match Exercises",
          headerStyle: { backgroundColor: rawColors.background },
          headerTintColor: rawColors.foreground,
        }}
      />

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="small" color={rawColors.primary} />
          <Text style={{ color: rawColors.foregroundSecondary }} selectable>
            Loading exercise library...
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.scrollContent}
          >
            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor: rawColors.surface,
                  borderColor: rawColors.borderLight,
                },
              ]}
            >
              <Text style={[styles.summaryTitle, { color: rawColors.foreground }]}>
                {template.name}
              </Text>
              <Text
                style={[
                  styles.summaryDescription,
                  { color: rawColors.foregroundSecondary },
                ]}
              >
                Review template exercises before import. Exact name matches are already
                selected. Any target-exercise placeholders must be chosen explicitly.
                Everything else left unresolved will be added to your exercise library
                automatically.
              </Text>
              <View style={styles.summaryStats}>
                <View
                  style={[
                    styles.summaryChip,
                    { backgroundColor: rawColors.primary + "12" },
                  ]}
                >
                  <Text style={[styles.summaryChipText, { color: rawColors.primary }]}>
                    {counts.existing} matched
                  </Text>
                </View>
                <View
                  style={[
                    styles.summaryChip,
                    { backgroundColor: rawColors.surfaceSecondary },
                  ]}
                >
                  <Text
                    style={[
                      styles.summaryChipText,
                      { color: rawColors.foregroundSecondary },
                    ]}
                  >
                    {counts.creating} to add
                  </Text>
                </View>
                {counts.pending > 0 ? (
                  <View
                    style={[
                      styles.summaryChip,
                      { backgroundColor: rawColors.warning + "14" },
                    ]}
                  >
                    <Text style={[styles.summaryChipText, { color: rawColors.warning }]}>
                      {counts.pending} pending
                    </Text>
                  </View>
                ) : null}
                {counts.suggested > 0 ? (
                  <View
                    style={[
                      styles.summaryChip,
                      { backgroundColor: rawColors.warning + "14" },
                    ]}
                  >
                    <Text style={[styles.summaryChipText, { color: rawColors.warning }]}>
                      {counts.suggested} suggestions
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.matchList}>
              {exerciseMatches.map(renderMatchRow)}
            </View>

            {error ? (
              <Text style={[styles.errorText, { color: rawColors.destructive }]}>
                {error}
              </Text>
            ) : null}
          </ScrollView>

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
              onPress={handleConfirmImport}
              disabled={importing}
              className={`flex-row items-center justify-center py-4 rounded-xl border ${
                importing ? "bg-surface-secondary border-border" : "bg-primary border-primary"
              }`}
              style={({ pressed }) => ({
                opacity: pressed && !importing ? 0.8 : 1,
              })}
            >
              <MaterialCommunityIcons
                name={importMode === "activate" ? "play" : "download"}
                size={22}
                color={importing ? rawColors.foregroundMuted : rawColors.primaryForeground}
              />
              <Text
                className={`text-base font-semibold ml-2 ${
                  importing ? "text-foreground-muted" : "text-primary-foreground"
                }`}
              >
                {importing
                  ? importMode === "activate"
                    ? "Preparing..."
                    : "Importing..."
                  : importMode === "activate"
                    ? "Import and Activate"
                    : "Import Template"}
              </Text>
            </Pressable>
          </View>
        </>
      )}

      <AppModal
        visible={pickerRequirement !== null}
        onClose={() => {
          setPickerRequirementId(null);
          setPickerQuery("");
        }}
        centerContent={false}
      >
        {pickerRequirement ? (
          <View style={styles.pickerContent}>
            <Text style={[styles.pickerTitle, { color: rawColors.foreground }]}>
              Choose exercise
            </Text>
            <Text
              style={[
                styles.pickerSubtitle,
                { color: rawColors.foregroundSecondary },
              ]}
            >
              {requiresExplicitExerciseSelection(pickerRequirement)
                ? "Choose an existing exercise or type a new one to create it."
                : pickerRequirement.canonicalName}
            </Text>

            <TextInput
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder={
                requiresExplicitExerciseSelection(pickerRequirement)
                  ? "Search or type a new exercise name..."
                  : "Search your library..."
              }
              placeholderTextColor={rawColors.foregroundMuted}
              style={[
                styles.pickerInput,
                {
                  backgroundColor: rawColors.surfaceSecondary,
                  borderColor: rawColors.borderLight,
                  color: rawColors.foreground,
                },
              ]}
            />

            <ScrollView style={styles.pickerList}>
              {pickerOptions.length > 0 ? (
                pickerOptions.slice(0, 20).map((option) => (
                  <Pressable
                    key={option.exercise.id}
                    onPress={() => {
                      setExistingResolution(
                        pickerRequirement,
                        option.exercise,
                        option.source === "exact" ? "exact" : "manual"
                      );
                      setPickerRequirementId(null);
                      setPickerQuery("");
                    }}
                    style={({ pressed }) => [
                      styles.pickerItem,
                      {
                        backgroundColor: pressed
                          ? rawColors.surfaceSecondary
                          : "transparent",
                        borderColor: rawColors.borderLight,
                      },
                    ]}
                  >
                    <View style={styles.pickerItemBody}>
                      <Text style={[styles.pickerItemName, { color: rawColors.foreground }]}>
                        {option.exercise.name}
                      </Text>
                      <Text
                        style={[
                          styles.pickerItemMeta,
                          { color: rawColors.foregroundSecondary },
                        ]}
                      >
                        {option.detail}
                      </Text>
                    </View>
                    <View style={styles.pickerChevronWrap}>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={18}
                        color={rawColors.foregroundSecondary}
                      />
                    </View>
                  </Pressable>
                ))
              ) : (
                <View style={styles.emptyPickerState}>
                  <Text
                    style={[
                      styles.pickerItemMeta,
                      { color: rawColors.foregroundMuted },
                    ]}
                  >
                    {requiresExplicitExerciseSelection(pickerRequirement)
                      ? "No library exercises matched your search. Type a name below to create one."
                      : "No library exercises matched your search."}
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.pickerActions}>
              <Pressable
                onPress={() => {
                  if (!pickerCreateName) return;
                  setCreateResolution(pickerRequirement, pickerCreateName);
                  setPickerRequirementId(null);
                  setPickerQuery("");
                }}
                disabled={!pickerCreateName}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    borderColor: rawColors.borderLight,
                    backgroundColor: pressed ? rawColors.surfaceSecondary : "transparent",
                    opacity: pickerCreateName ? 1 : 0.5,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    { color: rawColors.foregroundSecondary },
                  ]}
                >
                  {pickerCreateName
                    ? `Create "${pickerCreateName}"`
                    : "Type a name to create"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 120,
  },
  summaryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  summaryDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  summaryStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  matchList: {
    gap: 12,
  },
  matchCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  matchHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  matchName: {
    fontSize: 16,
    fontWeight: "700",
  },
  matchSummary: {
    fontSize: 13,
    lineHeight: 18,
  },
  matchBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  matchBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  suggestionBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  suggestionLabel: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  suggestionText: {
    fontSize: 13,
    lineHeight: 18,
  },
  matchActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
  },
  pickerContent: {
    gap: 12,
  },
  pickerTitle: {
    fontSize: 19,
    fontWeight: "700",
  },
  pickerSubtitle: {
    fontSize: 14,
  },
  pickerInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  pickerList: {
    maxHeight: 360,
  },
  pickerItem: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  pickerItemBody: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  pickerItemName: {
    fontSize: 14,
    fontWeight: "700",
  },
  pickerItemMeta: {
    fontSize: 12,
    lineHeight: 17,
  },
  pickerChevronWrap: {
    flexShrink: 0,
    alignSelf: "center",
  },
  emptyPickerState: {
    paddingVertical: 12,
  },
  pickerActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
});
