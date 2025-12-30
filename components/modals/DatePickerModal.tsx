/**
 * Date Picker Modal Component
 * 
 * A reusable date picker modal that consolidates the date picker
 * pattern used in RecordTab.tsx and edit-workout.tsx.
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../lib/theme/colors';
import BaseModal from './BaseModal';

interface DatePickerModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** Current selected date */
  value: Date;
  /** Called when the date changes */
  onChange: (date: Date) => void;
  /** Maximum selectable date (default: today) */
  maximumDate?: Date;
  /** Minimum selectable date */
  minimumDate?: Date;
  /** Title for the modal header */
  title?: string;
}

/**
 * DatePickerModal provides a consistent date selection experience:
 * - iOS: Spinner-style picker in modal
 * - Android: Native date picker dialog
 * - Consistent header with title and Done button
 */
export default function DatePickerModal({
  visible,
  onClose,
  value,
  onChange,
  maximumDate = new Date(),
  minimumDate,
  title = 'Select Date',
}: DatePickerModalProps) {
  const handleChange = (_event: any, selectedDate?: Date) => {
    // On Android, the native picker handles its own dismissal
    // Just update the value if a date was selected
    if (selectedDate) {
      onChange(selectedDate);
    }
    // On Android, close modal after selection (native picker auto-closes)
    if (Platform.OS === 'android') {
      onClose();
    }
  };

  const handleDone = () => {
    onClose();
  };

  // On Android, render DateTimePicker directly without modal wrapper
  // since it shows its own native dialog
  if (Platform.OS === 'android') {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="default"
        onChange={handleChange}
        maximumDate={maximumDate}
        minimumDate={minimumDate}
      />
    );
  }

  // On iOS, use the modal wrapper with spinner picker
  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      maxWidth={360}
      contentStyle={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={handleDone}>
          <Text style={styles.doneButton}>Done</Text>
        </Pressable>
      </View>
      <DateTimePicker
        value={value}
        mode="date"
        display="spinner"
        onChange={handleChange}
        maximumDate={maximumDate}
        minimumDate={minimumDate}
        style={styles.picker}
      />
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 0,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  doneButton: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.primary,
  },
  picker: {
    height: 200,
    backgroundColor: colors.surface,
  },
});


