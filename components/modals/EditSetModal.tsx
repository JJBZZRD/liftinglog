/**
 * Edit Set Modal Component
 * 
 * A reusable modal for editing workout sets. This consolidates
 * the edit set modal pattern used in RecordTab.tsx and edit-workout.tsx.
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import { useTheme } from "../../lib/theme/ThemeContext";
import { formatHistoryTime } from "../../lib/utils/formatters";
import { formatEditableWeightFromKg, getWeightUnitLabel, parseWeightInputToKg } from "../../lib/utils/units";
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
  /** Whether to show the time picker */
  showTimePicker: boolean;
}

/**
 * EditSetModal provides a form for editing set data:
 * - Weight (kg) input
 * - Reps input
 * - Optional note
 * - Optional date picker (for editing historical sets)
 */
export default function EditSetModal({
  visible,
  onClose,
  set,
  onSave,
  showTimePicker = false,
}: EditSetModalProps) {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date());
  const [showTimePickerModal, setShowTimePickerModal] = useState(false);

  const mergeTime = useCallback((base: Date, time: Date) => {
    const merged = new Date(base);
    merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
    return merged;
  }, []);

  // Reset form when set changes
  useEffect(() => {
    if (set) {
      setWeight(formatEditableWeightFromKg(set.weightKg, unitPreference));
      setReps(set.reps !== null ? String(set.reps) : "");
      setNote(set.note || "");
      setDate(set.performedAt ? new Date(set.performedAt) : new Date());
    }
  }, [set, unitPreference]);

  const handleSave = useCallback(() => {
    const weightValueKg = parseWeightInputToKg(weight, unitPreference);
    const repsValue = reps.trim() ? parseInt(reps, 10) : null;
    const noteValue = note.trim() || null;

    // Validate: weight and reps cannot be zero or null
    if (!weightValueKg || weightValueKg === 0 || !repsValue || repsValue === 0) {
      return;
    }

    const updates: { weight_kg: number; reps: number; note: string | null; performed_at?: number } = {
      weight_kg: weightValueKg,
      reps: repsValue,
      note: noteValue,
    };

    if (showTimePicker) {
      updates.performed_at = date.getTime();
    }

    onSave(updates);
  }, [weight, reps, note, date, showTimePicker, onSave, unitPreference]);

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
        contentStyle={{ padding: 0, maxHeight: "60%" }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-xl font-bold mb-5 text-foreground">Edit Set</Text>
          
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-sm font-medium mb-2 text-foreground-secondary">
                Weight ({getWeightUnitLabel(unitPreference)})
              </Text>
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

          {showTimePicker && (
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium mb-2 text-foreground-secondary">Time</Text>
              <Pressable
                className="flex-row items-center border border-border bg-primary-light px-3 py-3 rounded-lg gap-2"
                onPress={() => setShowTimePickerModal(true)}
              >
                <MaterialCommunityIcons name="clock-outline" size={18} color={rawColors.primary} />
                <Text className="text-base font-medium text-primary">
                  {formatHistoryTime(date.getTime())}
                </Text>
              </Pressable>
            </View>
          )}

          <View className="flex-row gap-3 mt-5">
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

      {showTimePicker && (
        <DatePickerModal
          visible={showTimePickerModal}
          onClose={() => setShowTimePickerModal(false)}
          value={date}
          mode="time"
          onChange={(next) => setDate((current) => mergeTime(current, next))}
        />
      )}
    </>
  );
}
