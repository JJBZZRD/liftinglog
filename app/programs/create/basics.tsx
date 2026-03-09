import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  buildStarterPslSource,
  type FlatProgramTimingMode,
} from "../../../lib/programs/psl/pslGenerator";
import { useTheme } from "../../../lib/theme/ThemeContext";

type ProgramStructure = "sessions" | "blocks";

const TIMING_MODE_OPTIONS: {
  key: FlatProgramTimingMode;
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  {
    key: "sequence",
    title: "Ordered split",
    description: "Program Day 1, Day 2, Day 3 with rest gaps between sessions.",
    icon: "playlist-play",
  },
  {
    key: "weekdays",
    title: "Weekdays",
    description: "Sessions repeat on selected weekdays. A session can target multiple days.",
    icon: "calendar-week",
  },
  {
    key: "fixed_day",
    title: "Fixed program days",
    description: "Sessions land on numbered program days relative to activation start date.",
    icon: "calendar-range",
  },
  {
    key: "interval_days",
    title: "Every N days",
    description: "Sessions repeat by interval with optional offsets and bounds.",
    icon: "calendar-refresh",
  },
];

function buildBlocksStarter(
  name: string,
  description: string,
  units: "kg" | "lb"
): string {
  const safeName = name.trim() || "My Block Program";
  const safeDesc = description.trim();
  const progId = safeName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "my-block-program";

  const lines: string[] = [];
  lines.push('language_version: "0.3"');
  lines.push("metadata:");
  lines.push(`  id: ${progId}`);
  lines.push(`  name: ${JSON.stringify(safeName)}`);
  if (safeDesc) lines.push(`  description: ${JSON.stringify(safeDesc)}`);
  lines.push(`units: ${units}`);
  lines.push("blocks:");
  lines.push("  - id: accumulation");
  lines.push('    duration: "4w"');
  lines.push("    sessions:");
  lines.push("      - id: a1");
  lines.push("        name: A1");
  lines.push('        schedule: "MON"');
  lines.push("        exercises:");
  lines.push('          - "Back Squat: 3x5 @75%"');
  lines.push("  - id: deload");
  lines.push('    duration: "1w"');
  lines.push("    deload: true");
  lines.push("    sessions:");
  lines.push("      - id: d1");
  lines.push("        name: Deload");
  lines.push('        schedule: "MON"');
  lines.push("        exercises:");
  lines.push('          - "Back Squat: 2x5 @60%"');
  return `${lines.join("\n")}\n`;
}

export default function ProgramBasicsScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{
    name?: string;
    description?: string;
    units?: string;
    timingMode?: string;
    programStructure?: string;
    editProgramId?: string;
  }>();

  const [name, setName] = useState(typeof params.name === "string" ? params.name : "");
  const [description, setDescription] = useState(
    typeof params.description === "string" ? params.description : ""
  );
  const [units, setUnits] = useState<"kg" | "lb">(params.units === "lb" ? "lb" : "kg");
  const [programStructure, setProgramStructure] = useState<ProgramStructure>(
    params.programStructure === "blocks" ? "blocks" : "sessions"
  );
  const [timingMode, setTimingMode] = useState<FlatProgramTimingMode>(
    params.timingMode === "weekdays" ||
      params.timingMode === "fixed_day" ||
      params.timingMode === "interval_days"
      ? params.timingMode
      : "sequence"
  );

  const trimmedName = name.trim();
  const isEditing = typeof params.editProgramId === "string" && params.editProgramId.length > 0;

  const handleNext = useCallback(() => {
    if (!trimmedName) return;
    Keyboard.dismiss();

    if (programStructure === "blocks") {
      router.push({
        pathname: "/programs/create/editor",
        params: {
          pslSource: buildBlocksStarter(trimmedName, description, units),
          ...(isEditing ? { editProgramId: params.editProgramId } : {}),
        },
      });
      return;
    }

    router.push({
      pathname: "/programs/create/schedule",
      params: {
        name: trimmedName,
        description: description.trim(),
        units,
        timingMode,
        ...(isEditing ? { editProgramId: params.editProgramId } : {}),
      },
    });
  }, [trimmedName, description, units, programStructure, timingMode, isEditing, params.editProgramId]);

  const handleEditPslInstead = useCallback(() => {
    Keyboard.dismiss();
    const starter =
      programStructure === "blocks"
        ? buildBlocksStarter(trimmedName || "My Block Program", description, units)
        : buildStarterPslSource(timingMode, {
            name: trimmedName || "My Program",
            description,
            units,
          });
    router.push({ pathname: "/programs/create/editor", params: { pslSource: starter } });
  }, [programStructure, trimmedName, description, units, timingMode]);

  return (
    <View style={styles.container} className="bg-background">
      <Stack.Screen
        options={{
          title: isEditing ? "Edit Program" : "Program Basics",
          headerStyle: { backgroundColor: rawColors.background },
          headerTintColor: rawColors.foreground,
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={[styles.label, { color: rawColors.foregroundSecondary }]}>
            Program Name *
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: rawColors.surfaceSecondary,
                borderColor: rawColors.borderLight,
                color: rawColors.foreground,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder="e.g., My Strength Program"
            placeholderTextColor={rawColors.foregroundMuted}
            autoFocus
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: rawColors.foregroundSecondary }]}>
            Description
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: rawColors.surfaceSecondary,
                borderColor: rawColors.borderLight,
                color: rawColors.foreground,
              },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your program..."
            placeholderTextColor={rawColors.foregroundMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: rawColors.foregroundSecondary }]}>
            Units
          </Text>
          <View style={styles.unitRow}>
            {(["kg", "lb"] as const).map((unit) => (
              <Pressable
                key={unit}
                onPress={() => setUnits(unit)}
                style={[
                  styles.unitButton,
                  {
                    backgroundColor: units === unit ? rawColors.primary : rawColors.surfaceSecondary,
                    borderColor: units === unit ? rawColors.primary : rawColors.borderLight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.unitButtonText,
                    { color: units === unit ? rawColors.primaryForeground : rawColors.foreground },
                  ]}
                >
                  {unit}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: rawColors.foregroundSecondary }]}>
            Program Structure
          </Text>
          <View style={styles.structureRow}>
            <Pressable
              onPress={() => setProgramStructure("sessions")}
              style={[
                styles.structureOption,
                {
                  backgroundColor:
                    programStructure === "sessions"
                      ? `${rawColors.primary}15`
                      : rawColors.surfaceSecondary,
                  borderColor:
                    programStructure === "sessions" ? rawColors.primary : rawColors.borderLight,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="calendar-week"
                size={24}
                color={
                  programStructure === "sessions"
                    ? rawColors.primary
                    : rawColors.foregroundSecondary
                }
              />
              <Text
                style={[
                  styles.structureTitle,
                  {
                    color:
                      programStructure === "sessions" ? rawColors.primary : rawColors.foreground,
                  },
                ]}
              >
                Sessions
              </Text>
              <Text style={[styles.structureDesc, { color: rawColors.foregroundSecondary }]}>
                Flat programs authored in the builder or PSL editor.
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setProgramStructure("blocks")}
              style={[
                styles.structureOption,
                {
                  backgroundColor:
                    programStructure === "blocks"
                      ? `${rawColors.primary}15`
                      : rawColors.surfaceSecondary,
                  borderColor:
                    programStructure === "blocks" ? rawColors.primary : rawColors.borderLight,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="view-week-outline"
                size={24}
                color={
                  programStructure === "blocks"
                    ? rawColors.primary
                    : rawColors.foregroundSecondary
                }
              />
              <Text
                style={[
                  styles.structureTitle,
                  {
                    color:
                      programStructure === "blocks" ? rawColors.primary : rawColors.foreground,
                  },
                ]}
              >
                Blocks
              </Text>
              <Text style={[styles.structureDesc, { color: rawColors.foregroundSecondary }]}>
                Phased programs stay editor-first for now.
              </Text>
            </Pressable>
          </View>
        </View>

        {programStructure === "sessions" ? (
          <View style={styles.field}>
            <Text style={[styles.label, { color: rawColors.foregroundSecondary }]}>
              Flat Program Timing
            </Text>
            <View style={styles.timingGrid}>
              {TIMING_MODE_OPTIONS.map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => setTimingMode(option.key)}
                  style={[
                    styles.timingOption,
                    {
                      backgroundColor:
                        timingMode === option.key
                          ? `${rawColors.primary}15`
                          : rawColors.surfaceSecondary,
                      borderColor: timingMode === option.key ? rawColors.primary : rawColors.borderLight,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={option.icon}
                    size={22}
                    color={timingMode === option.key ? rawColors.primary : rawColors.foregroundSecondary}
                  />
                  <Text
                    style={[
                      styles.timingTitle,
                      { color: timingMode === option.key ? rawColors.primary : rawColors.foreground },
                    ]}
                  >
                    {option.title}
                  </Text>
                  <Text style={[styles.timingDesc, { color: rawColors.foregroundSecondary }]}>
                    {option.description}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {!isEditing ? (
          <Pressable
            onPress={handleEditPslInstead}
            className="flex-row items-center justify-center py-3.5 rounded-xl border border-border"
            style={({ pressed }) => ({
              backgroundColor: pressed ? rawColors.surfaceSecondary : "transparent",
            })}
          >
            <MaterialCommunityIcons name="code-tags" size={18} color={rawColors.foregroundSecondary} />
            <Text className="ml-2 text-sm font-semibold" style={{ color: rawColors.foregroundSecondary }}>
              Edit PSL instead
            </Text>
          </Pressable>
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
          onPress={handleNext}
          disabled={!trimmedName}
          className={`flex-row items-center justify-center py-4 rounded-xl border ${
            trimmedName ? "bg-primary border-primary" : "bg-surface-secondary border-border"
          }`}
          style={({ pressed }) => ({
            opacity: pressed && trimmedName ? 0.8 : 1,
          })}
        >
          <MaterialCommunityIcons
            name="arrow-right"
            size={22}
            color={trimmedName ? rawColors.primaryForeground : rawColors.foregroundMuted}
          />
          <Text
            className={`text-base font-semibold ml-2 ${
              trimmedName ? "text-primary-foreground" : "text-foreground-muted"
            }`}
          >
            {programStructure === "blocks" ? "Next: PSL Editor" : "Next: Build Sessions"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  unitRow: {
    flexDirection: "row",
    gap: 12,
  },
  unitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  unitButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  structureRow: {
    flexDirection: "row",
    gap: 12,
  },
  structureOption: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  structureTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  structureDesc: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 15,
  },
  timingGrid: {
    gap: 12,
  },
  timingOption: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    gap: 6,
  },
  timingTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  timingDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
});
