import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
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
import { useTheme } from "../../../lib/theme/ThemeContext";

export default function ProgramBasicsScreen() {
  const { rawColors } = useTheme();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [units, setUnits] = useState<"kg" | "lb">("kg");
  const [programStructure, setProgramStructure] = useState<"sessions" | "blocks">("sessions");

  const trimmedName = name.trim();

  const toProgramId = useCallback((s: string) => {
    const slug = s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return slug || "my-program";
  }, []);

  const buildSessionsStarter = useCallback(() => {
    const safeName = trimmedName || "My Program";
    const safeDesc = description.trim();
    const progId = toProgramId(safeName);

    const lines: string[] = [];
    lines.push('language_version: "0.2"');
    lines.push("metadata:");
    lines.push(`  id: ${progId}`);
    lines.push(`  name: ${JSON.stringify(safeName)}`);
    if (safeDesc) lines.push(`  description: ${JSON.stringify(safeDesc)}`);
    lines.push(`units: ${units}`);
    lines.push("sessions:");
    lines.push("  - id: session-a");
    lines.push("    name: Session A");
    lines.push("    schedule:");
    lines.push("      type: weekdays");
    lines.push("      days: [MON, WED, FRI]");
    lines.push("    exercises:");
    lines.push('      - "Back Squat: 3x5 @75%"');
    return lines.join("\n") + "\n";
  }, [trimmedName, description, units, toProgramId]);

  const buildBlocksStarter = useCallback(() => {
    const safeName = trimmedName || "My Block Program";
    const safeDesc = description.trim();
    const progId = toProgramId(safeName);

    const lines: string[] = [];
    lines.push('language_version: "0.2"');
    lines.push("metadata:");
    lines.push(`  id: ${progId}`);
    lines.push(`  name: ${JSON.stringify(safeName)}`);
    if (safeDesc) lines.push(`  description: ${JSON.stringify(safeDesc)}`);
    lines.push(`units: ${units}`);
    lines.push("blocks:");
    lines.push("  - id: accumulation");
    lines.push('    duration: \"4w\"');
    lines.push("    sessions:");
    lines.push("      - id: a1");
    lines.push("        name: A1");
    lines.push('        schedule: \"MON\"');
    lines.push("        exercises:");
    lines.push('          - "Back Squat: 3x5 @75%"');
    lines.push("  - id: deload");
    lines.push('    duration: \"1w\"');
    lines.push("    deload: true");
    lines.push("    sessions:");
    lines.push("      - id: d1");
    lines.push("        name: Deload");
    lines.push('        schedule: \"MON\"');
    lines.push("        exercises:");
    lines.push('          - "Back Squat: 2x5 @60%"');
    return lines.join("\n") + "\n";
  }, [trimmedName, description, units, toProgramId]);

  const handleNext = useCallback(() => {
    if (!trimmedName) return;
    Keyboard.dismiss();

    if (programStructure === "blocks") {
      router.push({
        pathname: "/programs/create/editor",
        params: { pslSource: buildBlocksStarter() },
      });
      return;
    }

    router.push({
      pathname: "/programs/create/schedule",
      params: {
        name: trimmedName,
        description: description.trim(),
        units,
      },
    });
  }, [trimmedName, description, units, programStructure, buildBlocksStarter]);

  const handleEditPslInstead = useCallback(() => {
    Keyboard.dismiss();
    const starter = programStructure === "blocks" ? buildBlocksStarter() : buildSessionsStarter();
    router.push({ pathname: "/programs/create/editor", params: { pslSource: starter } });
  }, [programStructure, buildBlocksStarter, buildSessionsStarter]);

  return (
    <View style={styles.container} className="bg-background">
      <Stack.Screen
        options={{
          title: "Program Basics",
          headerStyle: { backgroundColor: rawColors.background },
          headerTintColor: rawColors.foreground,
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name */}
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

        {/* Description */}
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

        {/* Units */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: rawColors.foregroundSecondary }]}>
            Units
          </Text>
          <View style={styles.unitRow}>
            <Pressable
              onPress={() => setUnits("kg")}
              style={[
                styles.unitButton,
                {
                  backgroundColor: units === "kg" ? rawColors.primary : rawColors.surfaceSecondary,
                  borderColor: units === "kg" ? rawColors.primary : rawColors.borderLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.unitButtonText,
                  { color: units === "kg" ? rawColors.primaryForeground : rawColors.foreground },
                ]}
              >
                kg
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setUnits("lb")}
              style={[
                styles.unitButton,
                {
                  backgroundColor: units === "lb" ? rawColors.primary : rawColors.surfaceSecondary,
                  borderColor: units === "lb" ? rawColors.primary : rawColors.borderLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.unitButtonText,
                  { color: units === "lb" ? rawColors.primaryForeground : rawColors.foreground },
                ]}
              >
                lb
              </Text>
            </Pressable>
          </View>
        </View>

	        {/* Program Structure */}
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
	                  backgroundColor: programStructure === "sessions" ? rawColors.primary + "15" : rawColors.surfaceSecondary,
	                  borderColor: programStructure === "sessions" ? rawColors.primary : rawColors.borderLight,
	                },
	              ]}
	            >
	              <MaterialCommunityIcons
	                name="calendar-week"
	                size={24}
	                color={programStructure === "sessions" ? rawColors.primary : rawColors.foregroundSecondary}
	              />
	              <Text
	                style={[
	                  styles.structureTitle,
	                  { color: programStructure === "sessions" ? rawColors.primary : rawColors.foreground },
	                ]}
	              >
	                Sessions
	              </Text>
	              <Text style={[styles.structureDesc, { color: rawColors.foregroundSecondary }]}>
	                Sessions with weekday or interval schedules
	              </Text>
	            </Pressable>
	            <Pressable
	              onPress={() => setProgramStructure("blocks")}
              style={[
                styles.structureOption,
                {
                  backgroundColor: programStructure === "blocks" ? rawColors.primary + "15" : rawColors.surfaceSecondary,
                  borderColor: programStructure === "blocks" ? rawColors.primary : rawColors.borderLight,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="view-week-outline"
                size={24}
                color={programStructure === "blocks" ? rawColors.primary : rawColors.foregroundSecondary}
              />
              <Text
                style={[
                  styles.structureTitle,
                  { color: programStructure === "blocks" ? rawColors.primary : rawColors.foreground },
                ]}
              >
                Blocks
              </Text>
              <Text style={[styles.structureDesc, { color: rawColors.foregroundSecondary }]}>
                Training phases with set durations (e.g. 4-week cycles)
              </Text>
	            </Pressable>
	          </View>
	        </View>

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
	      </ScrollView>

      {/* Next Button */}
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
	            {programStructure === "blocks" ? "Next: PSL Editor" : "Next: Schedule"}
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  dateSection: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  dateValue: {
    fontSize: 14,
    fontWeight: "600",
  },
});
