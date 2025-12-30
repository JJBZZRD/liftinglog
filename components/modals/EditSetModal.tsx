/**
 * Edit Set Modal Component
 * 
 * A reusable modal for editing workout sets. This consolidates
 * the edit set modal pattern used in RecordTab.tsx and edit-workout.tsx.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../lib/theme/colors';
import { formatRelativeDate } from '../../lib/utils/formatters';
import BaseModal from './BaseModal';
import DatePickerModal from './DatePickerModal';

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
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);

  // Reset form when set changes
  useEffect(() => {
    if (set) {
      setWeight(set.weightKg !== null ? String(set.weightKg) : '');
      setReps(set.reps !== null ? String(set.reps) : '');
      setNote(set.note || '');
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
        contentStyle={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Edit Set</Text>
          
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Weight (kg)</Text>
              <TextInput
                style={styles.input}
                value={weight}
                onChangeText={setWeight}
                placeholder="0"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Reps</Text>
              <TextInput
                style={styles.input}
                value={reps}
                onChangeText={setReps}
                placeholder="0"
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.noteInputGroup}>
            <Text style={styles.inputLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note..."
              multiline
            />
          </View>

          {showDatePicker && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Date</Text>
              <Pressable
                style={styles.dateButton}
                onPress={() => setShowDatePickerModal(true)}
              >
                <MaterialCommunityIcons name="calendar" size={18} color={colors.primary} />
                <Text style={styles.dateButtonText}>{formatRelativeDate(date)}</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.deleteButton]} onPress={onDelete}>
              <MaterialCommunityIcons name="delete" size={20} color={colors.surface} />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.saveButton]} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
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

const styles = StyleSheet.create({
  container: {
    padding: 0,
    maxHeight: '45%',
  },
  scrollContent: {
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
    color: colors.text,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inputGroup: {
    flex: 1,
  },
  noteInputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  dateButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.primary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  deleteButton: {
    backgroundColor: colors.destructive,
  },
  deleteButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});


