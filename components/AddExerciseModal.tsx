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
  const { themeColors } = useTheme();
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
        style={{
          flex: 1,
          backgroundColor: themeColors.overlay,
          justifyContent: "center",
          alignItems: "center",
          padding: 16,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 520,
            backgroundColor: themeColors.surface,
            borderRadius: 12,
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "600", color: themeColors.text }}>Add Exercise</Text>
          {error ? <Text style={{ color: themeColors.error }}>{error}</Text> : null}

          <TextInput
            placeholder="Name"
            value={name}
            onChangeText={setName}
            placeholderTextColor={themeColors.textPlaceholder}
            style={{ borderWidth: 1, borderColor: themeColors.border, borderRadius: 8, padding: 10, color: themeColors.text, backgroundColor: themeColors.surface }}
          />
          <TextInput
            placeholder="Description"
            value={description}
            onChangeText={setDescription}
            placeholderTextColor={themeColors.textPlaceholder}
            style={{ borderWidth: 1, borderColor: themeColors.border, borderRadius: 8, padding: 10, color: themeColors.text, backgroundColor: themeColors.surface }}
          />
          <TextInput
            placeholder="Muscle group"
            value={muscle}
            onChangeText={setMuscle}
            placeholderTextColor={themeColors.textPlaceholder}
            style={{ borderWidth: 1, borderColor: themeColors.border, borderRadius: 8, padding: 10, color: themeColors.text, backgroundColor: themeColors.surface }}
          />
          <TextInput
            placeholder="Equipment"
            value={equipment}
            onChangeText={setEquipment}
            placeholderTextColor={themeColors.textPlaceholder}
            style={{ borderWidth: 1, borderColor: themeColors.border, borderRadius: 8, padding: 10, color: themeColors.text, backgroundColor: themeColors.surface }}
          />

          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
            <Pressable onPress={onDismiss} style={{ padding: 10 }}>
              <Text style={{ color: themeColors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              style={{ backgroundColor: themeColors.primary, padding: 10, borderRadius: 8 }}
            >
              <Text style={{ color: themeColors.surface, fontWeight: "600" }}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}


