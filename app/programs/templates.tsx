import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import BaseModal from "../../components/modals/BaseModal";
import { useTheme } from "../../lib/theme/ThemeContext";
import { ALL_TEMPLATES, type ProgramTemplate } from "../../lib/programs/templates";
import { serializePrescription } from "../../lib/programs/prescription";
import { createProgram, activateProgram } from "../../lib/db/programs";
import { createProgramDay } from "../../lib/db/programDays";
import { createProgramExercise } from "../../lib/db/programExercises";
import { createProgression } from "../../lib/db/progressions";
import { generatePlannedWorkoutsWindow } from "../../lib/db/plannedWorkouts";
import { listExercises, createExercise } from "../../lib/db/exercises";

export default function TemplateBrowserScreen() {
  const { rawColors } = useTheme();
  const [selectedTemplate, setSelectedTemplate] = useState<ProgramTemplate | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleImport = useCallback(
    async (template: ProgramTemplate) => {
      if (importing) return;
      setImporting(true);

      try {
        // Build exercise name -> id map
        const existingExercises = await listExercises();
        const nameToId = new Map<string, number>();
        for (const ex of existingExercises) {
          nameToId.set(ex.name.toLowerCase(), ex.id);
        }

        // Create program
        const programId = await createProgram({
          name: template.name,
          description: template.description,
          is_active: true,
        });
        await activateProgram(programId);

        // Create days, exercises, progressions
        for (const day of template.days) {
          const dayId = await createProgramDay({
            program_id: programId,
            schedule: day.schedule,
            day_of_week: day.day_of_week ?? null,
            interval_days: day.interval_days ?? null,
            note: day.note,
          });

          for (let i = 0; i < day.exercises.length; i++) {
            const exDef = day.exercises[i];

            // Match or create exercise
            let exerciseId = nameToId.get(exDef.name.toLowerCase());
            if (!exerciseId) {
              exerciseId = await createExercise({
                name: exDef.name,
                muscle_group: exDef.muscle_group ?? null,
                equipment: exDef.equipment ?? null,
              });
              nameToId.set(exDef.name.toLowerCase(), exerciseId);
            }

            const peId = await createProgramExercise({
              program_day_id: dayId,
              exercise_id: exerciseId,
              order_index: i,
              prescription_json: serializePrescription(exDef.prescription),
            });

            if (exDef.progression) {
              await createProgression({
                program_exercise_id: peId,
                type: exDef.progression.type,
                value: exDef.progression.value,
                cadence: exDef.progression.cadence,
                cap_kg: exDef.progression.cap_kg ?? null,
              });
            }
          }
        }

        // Generate 8-week window
        await generatePlannedWorkoutsWindow(programId);

        setPreviewVisible(false);
        router.back();
      } catch (error) {
        console.error("Error importing template:", error);
        Alert.alert(
          "Import Failed",
          "Could not import this template. The program name may already be taken."
        );
      } finally {
        setImporting(false);
      }
    },
    [importing]
  );

  const openPreview = (template: ProgramTemplate) => {
    setSelectedTemplate(template);
    setPreviewVisible(true);
  };

  // Group templates by category
  const categories = Array.from(new Set(ALL_TEMPLATES.map((t) => t.category)));

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Program Templates",
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {categories.map((category) => (
          <View key={category} className="mb-6">
            <Text className="text-base font-semibold mb-3 text-foreground-secondary uppercase tracking-wide">
              {category}
            </Text>
            {ALL_TEMPLATES.filter((t) => t.category === category).map((template) => (
              <Pressable
                key={template.id}
                onPress={() => openPreview(template)}
                className="rounded-2xl p-4 mb-3 bg-surface"
                style={{
                  shadowColor: rawColors.shadow,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    <Text className="text-base font-semibold text-foreground">
                      {template.name}
                    </Text>
                    <Text className="text-sm mt-1 text-foreground-secondary" numberOfLines={2}>
                      {template.description}
                    </Text>
                    <View className="flex-row items-center mt-2">
                      <MaterialCommunityIcons
                        name="calendar-week"
                        size={14}
                        color={rawColors.foregroundMuted}
                      />
                      <Text className="text-xs ml-1 text-foreground-muted">
                        {template.days.length} day{template.days.length !== 1 ? "s" : ""}
                      </Text>
                      <Text className="text-xs mx-1 text-foreground-muted">-</Text>
                      <Text className="text-xs text-foreground-muted">
                        {template.days.reduce((sum, d) => sum + d.exercises.length, 0)} exercises
                      </Text>
                    </View>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={rawColors.foregroundSecondary}
                  />
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Template Preview Modal */}
      <BaseModal
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
        maxWidth={420}
        contentStyle={{ padding: 0, maxHeight: "80%" }}
      >
        {selectedTemplate && (
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text className="text-xl font-bold text-foreground mb-2">
              {selectedTemplate.name}
            </Text>
            <Text className="text-sm text-foreground-secondary mb-4">
              {selectedTemplate.description}
            </Text>

            {selectedTemplate.days.map((day, dayIdx) => (
              <View key={dayIdx} className="rounded-xl p-3 mb-3 bg-surface-secondary">
                <Text className="text-sm font-semibold text-foreground mb-2">{day.note}</Text>
                {day.exercises.map((ex, exIdx) => {
                  const wb = ex.prescription.blocks.find((b) => b.kind === "work");
                  let setRep = "";
                  if (wb && wb.kind === "work") {
                    const repsStr =
                      wb.reps.type === "fixed"
                        ? `${wb.reps.value}`
                        : `${wb.reps.min}-${wb.reps.max}`;
                    setRep = `${wb.sets}x${repsStr}`;
                  }
                  return (
                    <View key={exIdx} className="flex-row items-center py-1 ml-1">
                      <Text className="text-xs font-medium text-primary mr-1">
                        {String.fromCharCode(65 + exIdx)}.
                      </Text>
                      <Text className="text-xs text-foreground flex-1" numberOfLines={1}>
                        {ex.name}
                      </Text>
                      <Text className="text-xs text-foreground-secondary">{setRep}</Text>
                    </View>
                  );
                })}
              </View>
            ))}

            <View className="flex-row gap-3 mt-4">
              <Pressable
                className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
                onPress={() => setPreviewVisible(false)}
              >
                <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
              </Pressable>
              <Pressable
                className="flex-1 flex-row items-center justify-center p-3.5 rounded-lg bg-primary"
                style={({ pressed }) => ({ opacity: pressed || importing ? 0.6 : 1 })}
                onPress={() => handleImport(selectedTemplate)}
                disabled={importing}
              >
                <MaterialCommunityIcons name="download" size={18} color={rawColors.primaryForeground} />
                <Text className="text-base font-semibold ml-1.5 text-primary-foreground">
                  {importing ? "Importing..." : "Import"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </BaseModal>
    </View>
  );
}
