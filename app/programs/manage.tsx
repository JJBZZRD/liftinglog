import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import BaseModal from "../../components/modals/BaseModal";
import { useTheme } from "../../lib/theme/ThemeContext";
import {
  listPslPrograms,
  deactivatePslProgram,
  deletePslProgram,
  updatePslProgram,
  type PslProgramRow,
} from "../../lib/db/pslPrograms";
import {
  deleteCalendarForProgram,
  insertCalendarEntries,
} from "../../lib/db/programCalendar";
import {
  compilePslSource,
  extractCalendarEntries,
} from "../../lib/programs/psl/pslService";
import {
  computeEndDateIso,
  dateToIsoLocal,
  DEFAULT_ACTIVATION_WEEKS,
  getDefaultActivationStartDateIso,
  isoToDateLocal,
} from "../../lib/programs/psl/activationDates";
import { introspectPslSource } from "../../lib/programs/psl/pslIntrospection";
import { getPslCompatibilityWarnings } from "../../lib/programs/psl/pslCompatibility";

export default function ManageProgramsScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ activateProgramId?: string }>();
  const [programs, setPrograms] = useState<PslProgramRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [actionProgram, setActionProgram] = useState<PslProgramRow | null>(null);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const [activateModalVisible, setActivateModalVisible] = useState(false);
  const [activateProgram, setActivateProgram] = useState<PslProgramRow | null>(null);
  const [activationStartDate, setActivationStartDate] = useState<Date>(isoToDateLocal(getDefaultActivationStartDateIso()));
  const [activationWeeks, setActivationWeeks] = useState(DEFAULT_ACTIVATION_WEEKS);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const all = await listPslPrograms();
      setPrograms(all);
    } catch (error) {
      console.error("Error loading programs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handledActivateParam = useRef<string | null>(null);
  useEffect(() => {
    if (!params.activateProgramId) return;
    if (handledActivateParam.current === params.activateProgramId) return;
    const targetId = parseInt(params.activateProgramId, 10);
    if (!Number.isFinite(targetId)) return;
    const program = programs.find((p) => p.id === targetId);
    if (!program) return;
    handledActivateParam.current = params.activateProgramId;
    setActivateProgram(program);
    setActivationStartDate(program.startDate ? isoToDateLocal(program.startDate) : isoToDateLocal(getDefaultActivationStartDateIso()));
    setActivationWeeks(DEFAULT_ACTIVATION_WEEKS);
    setActivationError("");
    setActivateModalVisible(true);
  }, [params.activateProgramId, programs]);

  const activePrograms = programs.filter((p) => p.isActive);
  const inactivePrograms = programs.filter((p) => !p.isActive);

  const sections = [
    { title: "Active Programs", data: activePrograms },
    { title: "All Programs", data: inactivePrograms },
  ];

  const handleDeactivate = useCallback(
    async (program: PslProgramRow) => {
      setActionModalVisible(false);
      setActionProgram(null);
      await deactivatePslProgram(program.id);
      await deleteCalendarForProgram(program.id);
      await loadData();
    },
    [loadData]
  );

  const handleOpenActivate = useCallback((program: PslProgramRow) => {
    setActionModalVisible(false);
    setActionProgram(null);
    setActivateProgram(program);
    setActivationStartDate(program.startDate ? isoToDateLocal(program.startDate) : isoToDateLocal(getDefaultActivationStartDateIso()));
    setActivationWeeks(DEFAULT_ACTIVATION_WEEKS);
    setActivationError("");
    setActivateModalVisible(true);
  }, []);

  const activationInfo = useMemo(() => {
    if (!activateProgram) return null;
    return introspectPslSource(activateProgram.pslSource);
  }, [activateProgram]);

  const activationStartIso = useMemo(() => dateToIsoLocal(activationStartDate), [activationStartDate]);

  const requiresHorizonWeeks = useMemo(() => {
    if (!activationInfo || !activationInfo.ok) return true;
    return activationInfo.usesSchedule && !activationInfo.hasBlocks;
  }, [activationInfo]);

  const derivedEndIso = useMemo(() => {
    if (!activationInfo || !activationInfo.ok) {
      return requiresHorizonWeeks ? computeEndDateIso(activationStartIso, activationWeeks) : null;
    }

    if (activationInfo.hasBlocks) {
      if (!activationInfo.totalBlockDays) return null;
      const startUtc = new Date(`${activationStartIso}T00:00:00Z`);
      const endUtc = new Date(startUtc);
      endUtc.setUTCDate(endUtc.getUTCDate() + activationInfo.totalBlockDays - 1);
      return endUtc.toISOString().slice(0, 10);
    }

    if (requiresHorizonWeeks) {
      return computeEndDateIso(activationStartIso, activationWeeks);
    }

    return null;
  }, [activationInfo, activationStartIso, activationWeeks, requiresHorizonWeeks]);

  const compatibilityWarnings = useMemo(() => {
    if (!activateProgram) return [];
    const override = { start_date: activationStartIso, ...(derivedEndIso ? { end_date: derivedEndIso } : {}) };
    const result = compilePslSource(activateProgram.pslSource, { calendarOverride: override });
    if (!result.ast) return [];
    return getPslCompatibilityWarnings(result.ast);
  }, [activateProgram, activationStartIso, derivedEndIso]);

  const handleConfirmActivate = useCallback(async () => {
    if (!activateProgram) return;
    setActivationError("");
    setActivating(true);

    try {
      const override = { start_date: activationStartIso, ...(requiresHorizonWeeks && derivedEndIso ? { end_date: derivedEndIso } : {}) };
      const result = compilePslSource(activateProgram.pslSource, { calendarOverride: override });
      if (!result.valid || !result.materialized) {
        const errors = result.diagnostics
          .filter((d) => d.severity === "error")
          .map((d) => d.message)
          .join("\n");
        setActivationError(errors || "Program could not be activated.");
        return;
      }

      const storedEndDate = override.end_date ?? result.ast?.calendar?.end_date ?? null;
      await updatePslProgram(activateProgram.id, {
        isActive: true,
        startDate: override.start_date,
        endDate: storedEndDate,
        units: result.ast?.units ?? null,
        compiledHash: result.compiled?.source_hash ?? null,
      });

      await deleteCalendarForProgram(activateProgram.id);
      const entries = extractCalendarEntries(result.materialized);
      await insertCalendarEntries(activateProgram.id, entries);

      setActivateModalVisible(false);
      setActivateProgram(null);
      await loadData();
    } catch (e) {
      setActivationError(e instanceof Error ? e.message : String(e));
    } finally {
      setActivating(false);
    }
  }, [activateProgram, activationStartIso, derivedEndIso, requiresHorizonWeeks, loadData]);

  const handleDelete = useCallback(async () => {
    if (!actionProgram) return;
    setDeleteModalVisible(false);
    setActionModalVisible(false);
    await deletePslProgram(actionProgram.id);
    setActionProgram(null);
    await loadData();
  }, [actionProgram, loadData]);

  const handleProgramPress = useCallback((program: PslProgramRow) => {
    setActionProgram(program);
    setActionModalVisible(true);
  }, []);

  const renderProgramItem = useCallback(
    ({ item }: { item: PslProgramRow }) => (
      <Pressable
        onPress={() => handleProgramPress(item)}
        style={({ pressed }) => [
          styles.programItem,
          {
            backgroundColor: pressed ? rawColors.pressed : rawColors.surface,
            borderColor: rawColors.borderLight,
          },
        ]}
      >
        <View style={styles.programInfo}>
          <Text
            style={[styles.programName, { color: rawColors.foreground }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {item.description ? (
            <Text
              style={[styles.programDesc, { color: rawColors.foregroundSecondary }]}
              numberOfLines={1}
            >
              {item.description}
            </Text>
          ) : null}
        </View>
        <View style={styles.programBadges}>
          {item.isActive && (
            <View style={[styles.activeBadge, { backgroundColor: rawColors.success + "20" }]}>
              <View style={[styles.activeDot, { backgroundColor: rawColors.success }]} />
              <Text style={[styles.activeBadgeText, { color: rawColors.success }]}>Active</Text>
            </View>
          )}
          <MaterialCommunityIcons name="dots-vertical" size={20} color={rawColors.foregroundSecondary} />
        </View>
      </Pressable>
    ),
    [rawColors, handleProgramPress]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string; data: PslProgramRow[] } }) => (
      <View style={[styles.sectionHeader, { backgroundColor: rawColors.background }]}>
        <Text style={[styles.sectionTitle, { color: rawColors.foregroundSecondary }]}>
          {section.title}
        </Text>
        <Text style={[styles.sectionCount, { color: rawColors.foregroundMuted }]}>
          {section.data.length}
        </Text>
      </View>
    ),
    [rawColors]
  );

  const renderEmptySection = useCallback(
    ({ section }: { section: { title: string } }) => {
      if (section.title === "Active Programs") {
        return (
          <View style={styles.emptySection}>
            <Text style={[styles.emptySectionText, { color: rawColors.foregroundMuted }]}>
              No active programs. Long press a program to activate it.
            </Text>
          </View>
        );
      }
      return null;
    },
    [rawColors]
  );

  return (
    <View style={styles.container} className="bg-background">
      <Stack.Screen
        options={{
          title: "Manage Programs",
          headerStyle: { backgroundColor: rawColors.background },
          headerTintColor: rawColors.foreground,
          headerRight: () => (
            <Pressable onPress={() => setAddModalVisible(true)} hitSlop={8}>
              <MaterialCommunityIcons name="plus" size={26} color={rawColors.primary} />
            </Pressable>
          ),
        }}
      />

      {programs.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="book-outline" size={64} color={rawColors.foregroundMuted} />
          <Text style={[styles.emptyTitle, { color: rawColors.foregroundMuted }]}>
            No programs yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: rawColors.foregroundMuted }]}>
            Create a custom program or import a template to get started.
          </Text>
          <Pressable
            onPress={() => setAddModalVisible(true)}
            className="flex-row items-center justify-center mt-6 px-6 py-4 rounded-xl border border-primary bg-primary"
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <MaterialCommunityIcons name="plus" size={20} color={rawColors.primaryForeground} />
            <Text className="ml-2 text-base font-semibold text-primary-foreground">
              Add Program
            </Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderProgramItem}
          renderSectionHeader={renderSectionHeader}
          renderSectionFooter={renderEmptySection}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* Add Program Modal */}
      <BaseModal visible={addModalVisible} onClose={() => setAddModalVisible(false)}>
        <Text style={[styles.modalTitle, { color: rawColors.foreground }]}>
          Add Program
        </Text>
        <Pressable
          onPress={() => {
            setAddModalVisible(false);
            router.push("/programs/create/basics");
          }}
          style={[styles.addOption, { backgroundColor: rawColors.surfaceSecondary }]}
        >
          <MaterialCommunityIcons name="pencil-plus-outline" size={24} color={rawColors.primary} />
          <View style={styles.addOptionText}>
            <Text style={[styles.addOptionTitle, { color: rawColors.foreground }]}>
              Create Program
            </Text>
            <Text style={[styles.addOptionDesc, { color: rawColors.foregroundSecondary }]}>
              Build a custom program from scratch
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => {
            setAddModalVisible(false);
            router.push("/programs/templates");
          }}
          style={[styles.addOption, { backgroundColor: rawColors.surfaceSecondary }]}
        >
          <MaterialCommunityIcons name="book-open-variant" size={24} color={rawColors.primary} />
          <View style={styles.addOptionText}>
            <Text style={[styles.addOptionTitle, { color: rawColors.foreground }]}>
              Use Template
            </Text>
            <Text style={[styles.addOptionDesc, { color: rawColors.foregroundSecondary }]}>
              Choose from popular training programs
            </Text>
          </View>
        </Pressable>
      </BaseModal>

      {/* Program Action Modal */}
      <BaseModal visible={actionModalVisible} onClose={() => { setActionModalVisible(false); setActionProgram(null); }}>
        {actionProgram && (
          <>
            <Text style={[styles.modalTitle, { color: rawColors.foreground }]}>
              {actionProgram.name}
            </Text>
            <Pressable
              onPress={() => actionProgram.isActive ? handleDeactivate(actionProgram) : handleOpenActivate(actionProgram)}
              style={[styles.actionOption, { backgroundColor: rawColors.surfaceSecondary }]}
            >
              <MaterialCommunityIcons
                name={actionProgram.isActive ? "pause-circle-outline" : "play-circle-outline"}
                size={22}
                color={rawColors.primary}
              />
              <Text style={[styles.actionOptionText, { color: rawColors.foreground }]}>
                {actionProgram.isActive ? "Deactivate" : "Activate"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {}}
              disabled
              style={[styles.actionOption, { backgroundColor: rawColors.surfaceSecondary, opacity: 0.5 }]}
            >
              <MaterialCommunityIcons
                name="arrow-expand-right"
                size={22}
                color={rawColors.foregroundSecondary}
              />
              <Text style={[styles.actionOptionText, { color: rawColors.foregroundSecondary }]}>
                Extend schedule (coming soon)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setActionModalVisible(false);
                setDeleteModalVisible(true);
              }}
              style={[styles.actionOption, { backgroundColor: rawColors.surfaceSecondary }]}
            >
              <MaterialCommunityIcons name="delete-outline" size={22} color={rawColors.destructive} />
              <Text style={[styles.actionOptionText, { color: rawColors.destructive }]}>
                Delete Program
              </Text>
            </Pressable>
          </>
        )}
      </BaseModal>

      {/* Activate Program Modal */}
      <BaseModal
        visible={activateModalVisible}
        onClose={() => {
          if (activating) return;
          setActivateModalVisible(false);
          setActivateProgram(null);
          setActivationError("");
        }}
        centerContent={false}
      >
        <ScrollView>
          <Text style={[styles.modalTitle, { color: rawColors.foreground }]}>
            Activate Program
          </Text>

          {activateProgram ? (
            <>
              <Text style={[styles.modalBody, { color: rawColors.foregroundSecondary, marginBottom: 12 }]}>
                {activateProgram.name}
              </Text>

              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { color: rawColors.foregroundSecondary }]}>
                  Start Date
                </Text>
                <Pressable
                  onPress={() => setShowStartPicker(true)}
                  style={[styles.inputRow, { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight }]}
                >
                  <Text style={{ color: rawColors.foreground, fontWeight: "700" }}>
                    {activationStartIso}
                  </Text>
                  <MaterialCommunityIcons name="calendar" size={20} color={rawColors.foregroundSecondary} />
                </Pressable>
                {showStartPicker && (
                  <DateTimePicker
                    value={activationStartDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(_, date) => {
                      setShowStartPicker(Platform.OS === "ios");
                      if (date) setActivationStartDate(date);
                    }}
                  />
                )}
              </View>

              {requiresHorizonWeeks && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[styles.sectionTitle, { color: rawColors.foregroundSecondary }]}>
                    Horizon (weeks)
                  </Text>
                  <TextInput
                    value={String(activationWeeks)}
                    onChangeText={(v) => setActivationWeeks(Math.max(1, parseInt(v, 10) || 1))}
                    keyboardType="number-pad"
                    placeholder="e.g. 12"
                    placeholderTextColor={rawColors.foregroundMuted}
                    style={[styles.input, { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight, color: rawColors.foreground }]}
                  />
                  <View style={styles.chipRow}>
                    {[4, 8, 12, 16].map((w) => (
                      <Pressable
                        key={w}
                        onPress={() => setActivationWeeks(w)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: activationWeeks === w ? rawColors.primary : rawColors.surfaceSecondary,
                            borderColor: activationWeeks === w ? rawColors.primary : rawColors.borderLight,
                          },
                        ]}
                      >
                        <Text style={{ color: activationWeeks === w ? rawColors.primaryForeground : rawColors.foreground, fontWeight: "700" }}>
                          {w}w
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              <Text style={[styles.modalBody, { color: rawColors.foregroundSecondary, marginBottom: 12 }]}>
                End Date: {derivedEndIso ?? "Derived from program"}
              </Text>

              {compatibilityWarnings.length > 0 ? (
                <View style={[styles.warningBox, { backgroundColor: rawColors.warning + "12", borderColor: rawColors.warning }]}>
                  <Text style={{ color: rawColors.warning, fontWeight: "800", marginBottom: 6 }}>
                    Compatibility warnings
                  </Text>
                  {compatibilityWarnings.slice(0, 4).map((w) => (
                    <Text key={w.code} style={{ color: rawColors.foregroundSecondary, marginBottom: 4 }}>
                      • {w.message}
                    </Text>
                  ))}
                  {compatibilityWarnings.length > 4 ? (
                    <Text style={{ color: rawColors.foregroundMuted }}>
                      +{compatibilityWarnings.length - 4} more…
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {activationError ? (
                <Text style={{ color: rawColors.destructive, marginBottom: 12 }}>
                  {activationError}
                </Text>
              ) : null}

              <View style={styles.modalButtons}>
                <Pressable
                  onPress={() => {
                    setActivateModalVisible(false);
                    setActivateProgram(null);
                    setActivationError("");
                  }}
                  disabled={activating}
                  className="flex-1 items-center justify-center py-3.5 rounded-lg bg-surface-secondary"
                  style={({ pressed }) => ({ opacity: pressed || activating ? 0.7 : 1 })}
                >
                  <Text className="text-base font-semibold text-foreground">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleConfirmActivate}
                  disabled={activating}
                  className="flex-1 items-center justify-center py-3.5 rounded-lg bg-primary"
                  style={({ pressed }) => ({ opacity: pressed || activating ? 0.7 : 1 })}
                >
                  <Text style={[styles.modalButtonText, { color: rawColors.primaryForeground }]}>
                    {activating ? "Activating..." : "Activate"}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>
      </BaseModal>

      {/* Delete Confirmation */}
      <BaseModal visible={deleteModalVisible} onClose={() => { setDeleteModalVisible(false); setActionProgram(null); }}>
        <Text style={[styles.modalTitle, { color: rawColors.foreground }]}>
          Delete Program?
        </Text>
        <Text style={[styles.modalBody, { color: rawColors.foregroundSecondary }]}>
          This will permanently delete {actionProgram?.name} and all its scheduled sessions. This cannot be undone.
        </Text>
        <View style={styles.modalButtons}>
          <Pressable
            onPress={() => { setDeleteModalVisible(false); setActionProgram(null); }}
            className="flex-1 items-center justify-center py-3.5 rounded-lg bg-surface-secondary"
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <Text className="text-base font-semibold text-foreground">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            className="flex-1 items-center justify-center py-3.5 rounded-lg bg-destructive"
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <Text style={[styles.modalButtonText, { color: rawColors.surface }]}>Delete</Text>
          </Pressable>
        </View>
      </BaseModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: "600",
  },
  programItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  programInfo: {
    flex: 1,
    marginRight: 8,
  },
  programName: {
    fontSize: 15,
    fontWeight: "600",
  },
  programDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  programBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptySection: {
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  emptySectionText: {
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  addOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    gap: 14,
  },
  addOptionText: {
    flex: 1,
  },
  addOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  addOptionDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  actionOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  actionOptionText: {
    fontSize: 15,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  warningBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
