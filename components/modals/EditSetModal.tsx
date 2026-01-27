/**
 * Edit Set Modal Component
 * 
 * A reusable modal for editing workout sets. This consolidates
 * the edit set modal pattern used in RecordTab.tsx and edit-workout.tsx.
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";
import { formatRelativeDate } from "../../lib/utils/formatters";
import BaseModal from "./BaseModal";
import DatePickerModal from "./DatePickerModal";

interface SetData {
  id: number;
  weightKg: number | null;
  reps: number | null;
  note: string | null;
  performedAt: number | null;
}

interface EditSetModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** The set data to edit */
  set: SetData | null;
  /** Called when the set is saved */
  onSave: (updates: { weight_kg: number; reps: number; note: string | null; performed_at?: number }) => void;
  /** Called when the set is deleted */
  onDelete: () => void;
  /** Whether to show the date picker (default: true for edit-workout, false for RecordTab) */
  showDatePicker?: boolean;
}

/**
 * EditSetModal provides a form for editing set data:
 * - Weight (kg) input
 * - Reps input
 * - Optional note
 * - Optional date picker (for editing historical sets)
 * - Delete button
 */
export default function EditSetModal({
  visible,
  onClose,
  set,
  onSave,
  onDelete,
  showDatePicker = false,
}: EditSetModalProps) {
  const { rawColors } = useTheme();
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date());
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);

  // Reset form when set changes
  useEffect(() => {
    if (set) {
      setWeight(set.weightKg !== null ? String(set.weightKg) : "");
      setReps(set.reps !== null ? String(set.reps) : "");
      setNote(set.note || "");
      setDate(set.performedAt ? new Date(set.performedAt) : new Date());
    }
  }, [set]);

  const handleSave = useCallback(() => {
    const weightValue = weight.trim() ? parseFloat(weight) : null;
    const repsValue = reps.trim() ? parseInt(reps, 10) : null;
    const noteValue = note.trim() || null;

    // Validate: weight and reps cannot be zero or null
    if (!weightValue || weightValue === 0 || !repsValue || repsValue === 0) {
      return;
    }

    const updates: { weight_kg: number; reps: number; note: string | null; performed_at?: number } = {
      weight_kg: weightValue,
      reps: repsValue,
      note: noteValue,
    };

    if (showDatePicker) {
      updates.performed_at = date.getTime();
    }

    onSave(updates);
  }, [weight, reps, note, date, showDatePicker, onSave]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!set) return null;

  return (
    <>
      <BaseModal
        visible={visible}
        onClose={handleClose}
        maxWidth={400}
        contentStyle={{ padding: 0, maxHeight: "45%" }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-xl font-bold mb-5 text-foreground">Edit Set</Text>
          
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-sm font-medium mb-2 text-foreground-secondary">Weight (kg)</Text>
              <TextInput
                className="border border-border rounded-lg p-3 text-base bg-surface-secondary text-foreground"
                value={weight}
                onChangeText={setWeight}
                placeholder="0"
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium mb-2 text-foreground-secondary">Reps</Text>
              <TextInput
                className="border border-border rounded-lg p-3 text-base bg-surface-secondary text-foreground"
                value={reps}
                onChangeText={setReps}
                placeholder="0"
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium mb-2 text-foreground-secondary">Note (optional)</Text>
            <TextInput
              className="border border-border rounded-lg p-3 text-base bg-surface-secondary text-foreground min-h-[80px]"
              style={{ textAlignVertical: "top" }}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note..."
              placeholderTextColor={rawColors.foregroundMuted}
              multiline
            />
          </View>

          {showDatePicker && (
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium mb-2 text-foreground-secondary">Date</Text>
              <Pressable
                className="flex-row items-center border border-border bg-primary-light px-3 py-3 rounded-lg gap-2"
                onPress={() => setShowDatePickerModal(true)}
              >
                <MaterialCommunityIcons name="calendar" size={18} color={rawColors.primary} />
                <Text className="text-base font-medium text-primary">{formatRelativeDate(date)}</Text>
              </Pressable>
            </View>
          )}

          <View className="flex-row gap-3 mt-5">
            <Pressable 
              className="flex-1 flex-row items-center justify-center p-3.5 rounded-lg gap-1.5 bg-destructive"
              onPress={onDelete}
            >
              <MaterialCommunityIcons name="delete" size={20} color={rawColors.surface} />
              <Text className="text-base font-semibold text-primary-foreground">Delete</Text>
            </Pressable>
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
              <Text className="text-base font-semibold text-primary-foreground">Save</Text>
            </Pressable>
          </View>
        </ScrollView>
      </BaseModal>

      {showDatePicker && (
        <DatePickerModal
          visible={showDatePickerModal}
          onClose={() => setShowDatePickerModal(false)}
          value={date}
          onChange={setDate}
        />
      )}
    </>
  );
}
