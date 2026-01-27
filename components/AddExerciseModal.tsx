import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { createExercise } from "../lib/db/exercises";
import { useTheme } from "../lib/theme/ThemeContext";

type AddExerciseModalProps = {
  visible: boolean;
  onDismiss: () => void;
  onSaved?: () => void;
};

export default function AddExerciseModal({ visible, onDismiss, onSaved }: AddExerciseModalProps) {
  const { rawColors } = useTheme();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    try {
      if (!name.trim()) {
        setError("Name is required");
        return;
      }
      await createExercise({
        name: name.trim(),
        description: description.trim() || null,
        muscle_group: muscle.trim() || null,
        equipment: equipment.trim() || null,
        is_bodyweight: false,
      });
      setError(null);
      setName("");
      setDescription("");
      setMuscle("");
      setEquipment("");
      onSaved?.();
      onDismiss();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      <Pressable
        onPress={onDismiss}
        className="flex-1 bg-overlay justify-center items-center p-4"
      >
        <Pressable
          onPress={() => {}}
          className="w-full max-w-[520px] bg-surface rounded-xl p-4 gap-3"
        >
          <Text className="text-lg font-semibold text-foreground">Add Exercise</Text>
          {error ? <Text className="text-destructive">{error}</Text> : null}

          <TextInput
            placeholder="Name"
            value={name}
            onChangeText={setName}
            placeholderTextColor={rawColors.foregroundMuted}
            className="border border-border rounded-lg p-2.5 text-foreground bg-surface"
          />
          <TextInput
            placeholder="Description"
            value={description}
            onChangeText={setDescription}
            placeholderTextColor={rawColors.foregroundMuted}
            className="border border-border rounded-lg p-2.5 text-foreground bg-surface"
          />
          <TextInput
            placeholder="Muscle group"
            value={muscle}
            onChangeText={setMuscle}
            placeholderTextColor={rawColors.foregroundMuted}
            className="border border-border rounded-lg p-2.5 text-foreground bg-surface"
          />
          <TextInput
            placeholder="Equipment"
            value={equipment}
            onChangeText={setEquipment}
            placeholderTextColor={rawColors.foregroundMuted}
            className="border border-border rounded-lg p-2.5 text-foreground bg-surface"
          />

          <View className="flex-row justify-end gap-3">
            <Pressable onPress={onDismiss} className="p-2.5">
              <Text className="text-foreground-secondary">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              className="bg-primary p-2.5 rounded-lg"
            >
              <Text className="text-primary-foreground font-semibold">Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
