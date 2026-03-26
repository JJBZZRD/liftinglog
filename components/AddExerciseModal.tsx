import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { createExercise, updateExercise, type Exercise } from "../lib/db/exercises";
import { useTheme } from "../lib/theme/ThemeContext";
import BaseModal from "./modals/BaseModal";

type AddExerciseModalProps = {
  visible: boolean;
  onDismiss: () => void;
  onSaved?: (exerciseId?: number) => void | Promise<void>;
  exercise?: Exercise | null;
};

export default function AddExerciseModal({ visible, onDismiss, onSaved, exercise }: AddExerciseModalProps) {
  const { rawColors } = useTheme();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!exercise;

  useEffect(() => {
    if (exercise) {
      setName(exercise.name);
      setDescription(exercise.description ?? "");
      setMuscle(exercise.muscleGroup ?? "");
      setEquipment(exercise.equipment ?? "");
      setError(null);
    }
  }, [exercise]);

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setMuscle("");
    setEquipment("");
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onDismiss();
  }, [onDismiss, resetForm]);

  const handleSave = useCallback(async () => {
    try {
      if (!name.trim()) {
        setError("Name is required");
        return;
      }

      if (isEditMode && exercise) {
        await updateExercise(exercise.id, {
          name: name.trim(),
          description: description.trim() || null,
          muscle_group: muscle.trim() || null,
          equipment: equipment.trim() || null,
        });
        resetForm();
        await onSaved?.(exercise.id);
        onDismiss();
      } else {
        const exerciseId = await createExercise({
          name: name.trim(),
          description: description.trim() || null,
          muscle_group: muscle.trim() || null,
          equipment: equipment.trim() || null,
          is_bodyweight: false,
        });
        resetForm();
        await onSaved?.(exerciseId);
        onDismiss();
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [name, description, muscle, equipment, exercise, isEditMode, onDismiss, onSaved, resetForm]);

  return (
    <BaseModal
      visible={visible}
      onClose={handleClose}
      maxWidth={480}
      contentStyle={{ padding: 0, maxHeight: "70%" }}
    >
      <ScrollView
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-xl font-bold mb-5 text-foreground">
          {isEditMode ? "Edit Exercise" : "New Exercise"}
        </Text>

        {error ? (
          <View className="mb-4 px-3 py-2.5 rounded-lg bg-destructive/10">
            <Text className="text-sm font-medium text-destructive">{error}</Text>
          </View>
        ) : null}

        <View className="mb-4">
          <Text className="text-sm font-medium mb-2 text-foreground-secondary">Name</Text>
          <TextInput
            className="border border-border rounded-lg p-3 text-base bg-surface-secondary text-foreground"
            value={name}
            onChangeText={(text) => { setName(text); setError(null); }}
            placeholder="e.g. Bench Press"
            placeholderTextColor={rawColors.foregroundMuted}
            autoFocus={!isEditMode}
          />
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium mb-2 text-foreground-secondary">Muscle Group (optional)</Text>
          <TextInput
            className="border border-border rounded-lg p-3 text-base bg-surface-secondary text-foreground"
            value={muscle}
            onChangeText={setMuscle}
            placeholder="e.g. Chest"
            placeholderTextColor={rawColors.foregroundMuted}
          />
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium mb-2 text-foreground-secondary">Equipment (optional)</Text>
          <TextInput
            className="border border-border rounded-lg p-3 text-base bg-surface-secondary text-foreground"
            value={equipment}
            onChangeText={setEquipment}
            placeholder="e.g. Barbell"
            placeholderTextColor={rawColors.foregroundMuted}
          />
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium mb-2 text-foreground-secondary">Description (optional)</Text>
          <TextInput
            className="border border-border rounded-lg p-3 text-base bg-surface-secondary text-foreground min-h-[80px]"
            style={{ textAlignVertical: "top" }}
            value={description}
            onChangeText={setDescription}
            placeholder="Add notes about form, cues, etc."
            placeholderTextColor={rawColors.foregroundMuted}
            multiline
          />
        </View>

        <View className="flex-row gap-3 mt-2">
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
            onPress={handleClose}
          >
            <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
          </Pressable>
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-primary"
            onPress={handleSave}
          >
            <Text className="text-base font-semibold text-primary-foreground">
              {isEditMode ? "Save" : "Create"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </BaseModal>
  );
}
