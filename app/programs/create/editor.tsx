import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { parseDocument } from "program-specification-language";
import BaseModal from "../../../components/modals/BaseModal";
import { createPslProgram } from "../../../lib/db/pslPrograms";
import { insertCalendarEntries } from "../../../lib/db/programCalendar";
import {
  compilePslSource,
  extractCalendarEntries,
} from "../../../lib/programs/psl/pslService";
import {
  computeEndDateIso,
  dateToIsoLocal,
  DEFAULT_ACTIVATION_WEEKS,
  getDefaultActivationStartDateIso,
  isoToDateLocal,
} from "../../../lib/programs/psl/activationDates";
import { introspectPslSource } from "../../../lib/programs/psl/pslIntrospection";
import { getPslCompatibilityWarnings } from "../../../lib/programs/psl/pslCompatibility";
import { useTheme } from "../../../lib/theme/ThemeContext";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appendSnippet(source: string, snippet: string): string {
  const trimmed = source.trimEnd();
  if (!trimmed) return snippet.trimStart() + "\n";
  const sep = trimmed.endsWith("\n") ? "" : "\n";
  return trimmed + sep + "\n" + snippet.trimStart() + "\n";
}

const SKELETON_SESSIONS = `language_version: "0.2"
metadata:
  id: my-program
  name: My Program
  description: Edit this description
units: kg
sessions:
  - id: session-a
    name: Session A
    schedule:
      type: weekdays
      days: [MON, WED, FRI]
    exercises:
      - "Back Squat: 3x5 @75%"
`;

const SKELETON_BLOCKS = `language_version: "0.2"
metadata:
  id: my-block-program
  name: My Block Program
  description: Edit this description
units: kg
blocks:
  - id: accumulation
    duration: "4w"
    sessions:
      - id: a1
        name: A1
        schedule: "MON"
        exercises:
          - "Back Squat: 3x5 @75%"
  - id: deload
    duration: "1w"
    deload: true
    sessions:
      - id: d1
        name: Deload
        schedule: "MON"
        exercises:
          - "Back Squat: 2x5 @60%"
`;

const SNIPPET_SCHEDULE_WEEKDAYS = `schedule:
  type: weekdays
  days: [MON, WED, FRI]
`;

const SNIPPET_SCHEDULE_INTERVAL = `schedule:
  type: interval_days
  every: 2
  start_offset_days: 0
`;

const SNIPPET_EXERCISE_SHORTHAND = `- "Bench Press: 3x5 @75%; +2.5kg every week if success"`;

export default function ProgramPslEditorScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ pslSource?: string }>();

  const initialSource =
    typeof params.pslSource === "string" && params.pslSource.trim()
      ? params.pslSource
      : SKELETON_SESSIONS;

  const [pslSource, setPslSource] = useState(initialSource);
  const [helpersVisible, setHelpersVisible] = useState(false);

  const [previewStartDate, setPreviewStartDate] = useState<Date>(
    isoToDateLocal(getDefaultActivationStartDateIso())
  );
  const [previewWeeks, setPreviewWeeks] = useState(DEFAULT_ACTIVATION_WEEKS);
  const [showStartPicker, setShowStartPicker] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const activationInfo = useMemo(() => introspectPslSource(pslSource), [pslSource]);
  const requiresHorizonWeeks = useMemo(() => {
    if (!activationInfo.ok) return true;
    return activationInfo.usesSchedule && !activationInfo.hasBlocks;
  }, [activationInfo]);

  const previewStartIso = useMemo(() => dateToIsoLocal(previewStartDate), [previewStartDate]);
  const previewOverride = useMemo(() => {
    if (!activationInfo.ok) return null;
    if (activationInfo.usesSchedule && !activationInfo.hasBlocks) {
      return { start_date: previewStartIso, end_date: computeEndDateIso(previewStartIso, previewWeeks) };
    }
    return { start_date: previewStartIso };
  }, [activationInfo, previewStartIso, previewWeeks]);

  const compileResult = useMemo(() => {
    return compilePslSource(pslSource, previewOverride ? { calendarOverride: previewOverride } : {});
  }, [pslSource, previewOverride]);

  const diagnostics = useMemo(() => compileResult.diagnostics ?? [], [compileResult.diagnostics]);
  const errorDiagnostics = useMemo(
    () => diagnostics.filter((d) => d.severity === "error"),
    [diagnostics]
  );

  const compatibilityWarnings = useMemo(() => {
    if (!compileResult.ast) return [];
    return getPslCompatibilityWarnings(compileResult.ast);
  }, [compileResult.ast]);

  const programMeta = useMemo(() => {
    try {
      const raw = parseDocument(pslSource);
      if (!isRecord(raw)) return { name: "Untitled Program" };
      const meta = raw.metadata;
      const name =
        isRecord(meta) && typeof meta.name === "string" && meta.name.trim()
          ? meta.name.trim()
          : "Untitled Program";
      const description =
        isRecord(meta) && typeof meta.description === "string" && meta.description.trim()
          ? meta.description.trim()
          : undefined;
      const units = typeof raw.units === "string" ? raw.units : undefined;
      return { name, description, units };
    } catch {
      return { name: "Untitled Program" };
    }
  }, [pslSource]);

  const handleInsert = useCallback(
    (snippet: string, { replace }: { replace: boolean }) => {
      setPslSource((prev) => (replace ? snippet.trimStart() + "\n" : appendSnippet(prev, snippet)));
      setHelpersVisible(false);
    },
    []
  );

  const handleSaveTemplate = useCallback(async () => {
    setSaving(true);
    setSaveError("");
    try {
      // Require parseable YAML for saving, but do not require full PSL validation (templates may omit calendar).
      parseDocument(pslSource);

      await createPslProgram({
        name: programMeta.name,
        description: programMeta.description,
        pslSource,
        isActive: false,
        units: programMeta.units,
      });

      router.replace("/programs/manage");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [pslSource, programMeta]);

  const handleSaveAndActivate = useCallback(async () => {
    setSaving(true);
    setSaveError("");
    try {
      const override = previewOverride;
      if (!override) {
        throw new Error("Fix YAML parse errors before activating.");
      }

      const result = compilePslSource(pslSource, { calendarOverride: override });
      if (!result.valid || !result.materialized) {
        const errors = result.diagnostics
          .filter((d) => d.severity === "error")
          .map((d) => d.message)
          .join("\n");
        throw new Error(errors || "Program could not be activated.");
      }

      const storedEndDate = override.end_date ?? result.ast?.calendar?.end_date ?? null;
      const program = await createPslProgram({
        name: programMeta.name,
        description: programMeta.description,
        pslSource,
        compiledHash: result.compiled?.source_hash,
        isActive: true,
        startDate: override.start_date,
        endDate: storedEndDate ?? undefined,
        units: result.ast?.units ?? programMeta.units,
      });

      const entries = extractCalendarEntries(result.materialized);
      await insertCalendarEntries(program.id, entries);

      router.replace("/(tabs)/programs");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [pslSource, previewOverride, programMeta]);

  const sessionsPreview = useMemo(() => {
    if (!compileResult.compiled) return null;
    return compileResult.compiled.sessions.slice(0, 6).map((s) => ({
      id: s.id,
      name: s.name,
      exerciseCount: s.exercises.length,
    }));
  }, [compileResult.compiled]);

  const materializedPreview = useMemo(() => {
    if (!compileResult.materialized) return null;
    return compileResult.materialized.slice(0, 10).map((s) => ({
      id: s.id,
      name: s.name,
      dateIso: s.date_iso ?? "",
    }));
  }, [compileResult.materialized]);

  const previewDerivedEndIso = useMemo(() => {
    if (!activationInfo.ok) return null;
    if (activationInfo.hasBlocks) {
      if (!activationInfo.totalBlockDays) return null;
      const startUtc = new Date(`${previewStartIso}T00:00:00Z`);
      const endUtc = new Date(startUtc);
      endUtc.setUTCDate(endUtc.getUTCDate() + activationInfo.totalBlockDays - 1);
      return endUtc.toISOString().slice(0, 10);
    }
    if (activationInfo.usesSchedule && !activationInfo.hasBlocks) {
      return computeEndDateIso(previewStartIso, previewWeeks);
    }
    return null;
  }, [activationInfo, previewStartIso, previewWeeks]);

  const showPreviewDatesPanel = true;

  return (
    <View style={styles.container} className="bg-background">
      <Stack.Screen
        options={{
          title: "PSL Editor",
          headerStyle: { backgroundColor: rawColors.background },
          headerTintColor: rawColors.foreground,
          headerRight: () => (
            <Pressable onPress={() => setHelpersVisible(true)} hitSlop={8}>
              <MaterialCommunityIcons name="plus-box-multiple-outline" size={22} color={rawColors.primary} />
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sectionTitle, { color: rawColors.foregroundSecondary }]}>
          YAML
        </Text>
        <TextInput
          value={pslSource}
          onChangeText={setPslSource}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          placeholder="Paste PSL YAML here..."
          placeholderTextColor={rawColors.foregroundMuted}
          style={[
            styles.editor,
            {
              backgroundColor: rawColors.surfaceSecondary,
              borderColor: rawColors.borderLight,
              color: rawColors.foreground,
            },
          ]}
        />

        {showPreviewDatesPanel && (
          <View style={[styles.panel, { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight }]}>
            <Text style={[styles.panelTitle, { color: rawColors.foreground }]}>
              Preview / Activation Dates
            </Text>

            <Text style={[styles.helpText, { color: rawColors.foregroundMuted }]}>
              Templates can omit calendar dates. Use these dates to preview and to activate.
            </Text>

            <Pressable
              onPress={() => {
                setPreviewStartDate(isoToDateLocal(getDefaultActivationStartDateIso()));
                setPreviewWeeks(DEFAULT_ACTIVATION_WEEKS);
              }}
              hitSlop={8}
              style={{ marginTop: 10, alignSelf: "flex-start" }}
            >
              <Text style={{ color: rawColors.primary, fontWeight: "700" }}>
                Use default preview dates
              </Text>
            </Pressable>

            <View style={{ marginTop: 10 }}>
              <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
                Start date
              </Text>
              <Pressable
                onPress={() => setShowStartPicker(true)}
                style={[styles.inputRow, { backgroundColor: rawColors.surface, borderColor: rawColors.borderLight }]}
              >
                <Text style={{ color: rawColors.foreground, fontWeight: "700" }}>
                  {previewStartIso}
                </Text>
                <MaterialCommunityIcons name="calendar" size={20} color={rawColors.foregroundSecondary} />
              </Pressable>
              {showStartPicker && (
                <DateTimePicker
                  value={previewStartDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(_, date) => {
                    setShowStartPicker(Platform.OS === "ios");
                    if (date) setPreviewStartDate(date);
                  }}
                />
              )}
            </View>

            {requiresHorizonWeeks && (
              <View style={{ marginTop: 10 }}>
                <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
                  Horizon (weeks)
                </Text>
                <TextInput
                  value={String(previewWeeks)}
                  onChangeText={(v) => setPreviewWeeks(Math.max(1, parseInt(v, 10) || 1))}
                  keyboardType="number-pad"
                  placeholder="e.g. 12"
                  placeholderTextColor={rawColors.foregroundMuted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: rawColors.surface,
                      borderColor: rawColors.borderLight,
                      color: rawColors.foreground,
                    },
                  ]}
                />
              </View>
            )}

            {previewDerivedEndIso ? (
              <Text style={[styles.helpText, { color: rawColors.foregroundMuted, marginTop: 10 }]}>
                End date preview: {previewDerivedEndIso}
              </Text>
            ) : null}
          </View>
        )}

        <View style={[styles.panel, { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight }]}>
          <Text style={[styles.panelTitle, { color: rawColors.foreground }]}>
            Diagnostics
          </Text>
          <Text style={[styles.helpText, { color: rawColors.foregroundMuted }]}>
            {compileResult.valid ? "Valid PSL (with preview dates applied)" : `${errorDiagnostics.length} error(s)`}
          </Text>

          {errorDiagnostics.slice(0, 6).map((d, i) => (
            <Text key={i} style={[styles.diagLine, { color: rawColors.destructive }]}>
              • {d.message}
            </Text>
          ))}
          {!compileResult.valid && errorDiagnostics.length === 0 ? (
            <Text style={[styles.diagLine, { color: rawColors.foregroundMuted }]}>
              • No structured diagnostics available.
            </Text>
          ) : null}

          {compatibilityWarnings.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
                Logging compatibility
              </Text>
              {compatibilityWarnings.slice(0, 4).map((w, idx) => (
                <Text key={idx} style={[styles.diagLine, { color: rawColors.warning }]}>
                  • {w.title}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View style={[styles.panel, { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight }]}>
          <Text style={[styles.panelTitle, { color: rawColors.foreground }]}>
            Preview
          </Text>

          {sessionsPreview ? (
            <>
              {sessionsPreview.map((s) => (
                <Text key={s.id} style={[styles.previewLine, { color: rawColors.foregroundSecondary }]}>
                  • {s.name} ({s.exerciseCount} exercise{s.exerciseCount !== 1 ? "s" : ""})
                </Text>
              ))}
              {compileResult.compiled && compileResult.compiled.sessions.length > 6 ? (
                <Text style={[styles.previewLine, { color: rawColors.foregroundMuted }]}>
                  … +{compileResult.compiled.sessions.length - 6} more sessions
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[styles.helpText, { color: rawColors.foregroundMuted }]}>
              No preview available yet.
            </Text>
          )}

          {materializedPreview && (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.fieldLabel, { color: rawColors.foregroundSecondary }]}>
                First occurrences
              </Text>
              {materializedPreview.map((m, idx) => (
                <Text key={`${m.id}-${idx}`} style={[styles.previewLine, { color: rawColors.foregroundSecondary }]}>
                  • {m.dateIso || "—"} — {m.name}
                </Text>
              ))}
            </View>
          )}
        </View>
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
        {saveError ? (
          <Text style={[styles.saveError, { color: rawColors.destructive }]}>
            {saveError}
          </Text>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            onPress={handleSaveTemplate}
            disabled={saving}
            className="flex-1 items-center justify-center py-3.5 rounded-xl border border-border"
            style={({ pressed }) => ({
              backgroundColor: pressed ? rawColors.surfaceSecondary : "transparent",
              opacity: saving ? 0.6 : 1,
            })}
          >
            <Text style={{ color: rawColors.foreground }}>
              Save as Template
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSaveAndActivate}
            disabled={saving}
            className="flex-1 items-center justify-center py-3.5 rounded-xl border border-primary bg-primary"
            style={({ pressed }) => ({ opacity: pressed || saving ? 0.7 : 1 })}
          >
            <Text className="text-base font-semibold text-primary-foreground">
              {saving ? "Saving..." : "Save & Activate"}
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.metaHint, { color: rawColors.foregroundMuted }]}>
          Program name: {programMeta.name}
        </Text>
      </View>

      <BaseModal visible={helpersVisible} onClose={() => setHelpersVisible(false)}>
        <Text style={[styles.modalTitle, { color: rawColors.foreground }]}>
          Helpers
        </Text>

        <Pressable
          onPress={() => handleInsert(SKELETON_SESSIONS, { replace: true })}
          style={[styles.helperOption, { backgroundColor: rawColors.surfaceSecondary }]}
        >
          <MaterialCommunityIcons name="file-document-edit-outline" size={22} color={rawColors.primary} />
          <Text style={[styles.helperOptionText, { color: rawColors.foreground }]}>
            Replace with sessions skeleton
          </Text>
        </Pressable>

        <Pressable
          onPress={() => handleInsert(SKELETON_BLOCKS, { replace: true })}
          style={[styles.helperOption, { backgroundColor: rawColors.surfaceSecondary }]}
        >
          <MaterialCommunityIcons name="view-week-outline" size={22} color={rawColors.primary} />
          <Text style={[styles.helperOptionText, { color: rawColors.foreground }]}>
            Replace with blocks skeleton
          </Text>
        </Pressable>

        <Pressable
          onPress={() => handleInsert(SNIPPET_SCHEDULE_WEEKDAYS, { replace: false })}
          style={[styles.helperOption, { backgroundColor: rawColors.surfaceSecondary }]}
        >
          <MaterialCommunityIcons name="calendar-week" size={22} color={rawColors.primary} />
          <Text style={[styles.helperOptionText, { color: rawColors.foreground }]}>
            Insert weekdays schedule
          </Text>
        </Pressable>

        <Pressable
          onPress={() => handleInsert(SNIPPET_SCHEDULE_INTERVAL, { replace: false })}
          style={[styles.helperOption, { backgroundColor: rawColors.surfaceSecondary }]}
        >
          <MaterialCommunityIcons name="calendar-refresh" size={22} color={rawColors.primary} />
          <Text style={[styles.helperOptionText, { color: rawColors.foreground }]}>
            Insert interval schedule
          </Text>
        </Pressable>

        <Pressable
          onPress={() => handleInsert(SNIPPET_EXERCISE_SHORTHAND, { replace: false })}
          style={[styles.helperOption, { backgroundColor: rawColors.surfaceSecondary }]}
        >
          <MaterialCommunityIcons name="dumbbell" size={22} color={rawColors.primary} />
          <Text style={[styles.helperOptionText, { color: rawColors.foreground }]}>
            Insert exercise shorthand
          </Text>
        </Pressable>
      </BaseModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 160,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  editor: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 12,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    minHeight: 240,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  panel: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
  },
  helpText: {
    fontSize: 13,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  diagLine: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  previewLine: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  saveError: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
  },
  metaHint: {
    marginTop: 10,
    fontSize: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
  },
  helperOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 10,
    marginBottom: 10,
  },
  helperOptionText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
});
