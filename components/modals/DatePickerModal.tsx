/**
 * Date Picker Modal Component
 * 
 * A reusable date picker modal that consolidates the date picker
 * pattern used in RecordTab.tsx and edit-workout.tsx.
 */
import DateTimePicker from "@react-native-community/datetimepicker";
import { Platform, Pressable, Text, View } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";
import BaseModal from "./BaseModal";

interface DatePickerModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** Current selected date */
  value: Date;
  /** Called when the date changes */
  onChange: (date: Date) => void;
  /** Picker mode (date or time) */
  mode?: "date" | "time";
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
  mode = "date",
  maximumDate,
  minimumDate,
  title,
}: DatePickerModalProps) {
  const { rawColors } = useTheme();
  const resolvedTitle = title ?? (mode === "time" ? "Select Time" : "Select Date");
  const resolvedMaximumDate = mode === "date" ? (maximumDate ?? new Date()) : maximumDate;
  const resolvedMinimumDate = mode === "date" ? minimumDate : undefined;

  const handleChange = (_event: any, selectedDate?: Date) => {
    // On Android, the native picker handles its own dismissal
    // Just update the value if a date was selected
    if (selectedDate) {
      onChange(selectedDate);
    }
    // On Android, close modal after selection (native picker auto-closes)
    if (Platform.OS === "android") {
      onClose();
    }
  };

  const handleDone = () => {
    onClose();
  };

  // On Android, render DateTimePicker directly without modal wrapper
  // since it shows its own native dialog
  if (Platform.OS === "android") {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display="default"
        onChange={handleChange}
        maximumDate={resolvedMaximumDate}
        minimumDate={resolvedMinimumDate}
      />
    );
  }

  // On iOS, use the modal wrapper with spinner picker
  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      maxWidth={360}
      contentStyle={{ padding: 0, overflow: "hidden" }}
    >
      <View className="flex-row justify-between items-center px-5 py-4 border-b border-border">
        <Text className="text-[17px] font-semibold text-foreground">{resolvedTitle}</Text>
        <Pressable onPress={handleDone}>
          <Text className="text-[17px] font-semibold text-primary">Done</Text>
        </Pressable>
      </View>
      <DateTimePicker
        value={value}
        mode={mode}
        display="spinner"
        onChange={handleChange}
        maximumDate={resolvedMaximumDate}
        minimumDate={resolvedMinimumDate}
        style={{ height: 200, backgroundColor: rawColors.surface }}
      />
    </BaseModal>
  );
}
