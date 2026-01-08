/**
 * Date Range Selector Component
 * 
 * Provides preset date range buttons and a proper custom date picker
 * with separate start/end date selection.
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";
import DatePickerModal from "../modals/DatePickerModal";

export type DateRangePreset = "1w" | "1m" | "3m" | "6m" | "1y" | "all" | "custom";

export interface DateRange {
  startDate: Date | null;
  endDate: Date;
  preset: DateRangePreset;
}

interface DateRangeSelectorProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const presets: { id: DateRangePreset; label: string; days: number | null }[] = [
  { id: "1w", label: "1W", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "6m", label: "6M", days: 180 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "All", days: null },
];

export function getDateRangeFromPreset(preset: DateRangePreset, customStart?: Date | null, customEnd?: Date): DateRange {
  const now = new Date();
  const endDate = customEnd ?? now;
  
  if (preset === "custom" && customStart) {
    return { startDate: customStart, endDate, preset };
  }
  
  if (preset === "all") {
    return { startDate: null, endDate, preset };
  }
  
  const presetConfig = presets.find(p => p.id === preset);
  if (!presetConfig || presetConfig.days === null) {
    return { startDate: null, endDate, preset };
  }
  
  const startDate = new Date(now.getTime() - presetConfig.days * 24 * 60 * 60 * 1000);
  return { startDate, endDate, preset };
}

export function getDefaultDateRange(): DateRange {
  return getDateRangeFromPreset("3m");
}

export default function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const { themeColors } = useTheme();
  
  // Custom range picker state
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  
  // Temp values for custom range editing
  const [tempStartDate, setTempStartDate] = useState<Date>(
    value.startDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  );
  const [tempEndDate, setTempEndDate] = useState<Date>(value.endDate);

  const handlePresetPress = (preset: DateRangePreset) => {
    if (preset === "custom") {
      // Initialize temp values from current range
      setTempStartDate(value.startDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
      setTempEndDate(value.endDate);
      setShowCustomModal(true);
      return;
    }
    onChange(getDateRangeFromPreset(preset));
  };

  const handleCustomRangeSave = () => {
    // Auto-correct if start > end
    let start = tempStartDate;
    let end = tempEndDate;
    
    if (start.getTime() > end.getTime()) {
      // Swap dates if start is after end
      const temp = start;
      start = end;
      end = temp;
    }
    
    onChange({
      startDate: start,
      endDate: end,
      preset: "custom",
    });
    setShowCustomModal(false);
  };

  const formatDateShort = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatDateDisplay = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <View style={styles.container}>
      {/* Preset Buttons */}
      <View style={styles.presetsRow}>
        {presets.map((preset) => (
          <Pressable
            key={preset.id}
            style={[
              styles.presetButton,
              { borderColor: themeColors.border },
              value.preset === preset.id && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
            ]}
            onPress={() => handlePresetPress(preset.id)}
          >
            <Text
              style={[
                styles.presetText,
                { color: themeColors.text },
                value.preset === preset.id && { color: themeColors.surface },
              ]}
            >
              {preset.label}
            </Text>
          </Pressable>
        ))}
        
        {/* Custom Button */}
        <Pressable
          style={[
            styles.presetButton,
            styles.customButton,
            { borderColor: themeColors.border },
            value.preset === "custom" && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
          ]}
          onPress={() => handlePresetPress("custom")}
        >
          <MaterialCommunityIcons
            name="calendar-range"
            size={16}
            color={value.preset === "custom" ? themeColors.surface : themeColors.textSecondary}
          />
        </Pressable>
      </View>

      {/* Custom Range Display */}
      {value.preset === "custom" && value.startDate && (
        <Pressable
          style={[styles.customRangeDisplay, { backgroundColor: themeColors.surfaceSecondary }]}
          onPress={() => {
            setTempStartDate(value.startDate ?? new Date());
            setTempEndDate(value.endDate);
            setShowCustomModal(true);
          }}
        >
          <Text style={[styles.customRangeText, { color: themeColors.text }]}>
            {formatDateDisplay(value.startDate)} - {formatDateDisplay(value.endDate)}
          </Text>
          <MaterialCommunityIcons name="pencil" size={14} color={themeColors.textSecondary} />
        </Pressable>
      )}

      {/* Custom Date Range Modal */}
      <Modal
        visible={showCustomModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowCustomModal(false)}
        >
          <View 
            style={[styles.customPickerContainer, { backgroundColor: themeColors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.customPickerTitle, { color: themeColors.text }]}>
              Select Date Range
            </Text>
            
            {/* Start Date Row */}
            <View style={styles.dateInputRow}>
              <Text style={[styles.dateInputLabel, { color: themeColors.textSecondary }]}>
                Start
              </Text>
              <Pressable
                style={[styles.dateInputButton, { 
                  backgroundColor: themeColors.surfaceSecondary, 
                  borderColor: themeColors.border 
                }]}
                onPress={() => setShowStartPicker(true)}
              >
                <MaterialCommunityIcons name="calendar" size={18} color={themeColors.primary} />
                <Text style={[styles.dateInputText, { color: themeColors.text }]}>
                  {formatDateShort(tempStartDate)}
                </Text>
              </Pressable>
            </View>

            {/* Arrow */}
            <View style={styles.arrowContainer}>
              <MaterialCommunityIcons name="arrow-down" size={20} color={themeColors.textSecondary} />
            </View>

            {/* End Date Row */}
            <View style={styles.dateInputRow}>
              <Text style={[styles.dateInputLabel, { color: themeColors.textSecondary }]}>
                End
              </Text>
              <Pressable
                style={[styles.dateInputButton, { 
                  backgroundColor: themeColors.surfaceSecondary, 
                  borderColor: themeColors.border 
                }]}
                onPress={() => setShowEndPicker(true)}
              >
                <MaterialCommunityIcons name="calendar" size={18} color={themeColors.primary} />
                <Text style={[styles.dateInputText, { color: themeColors.text }]}>
                  {formatDateShort(tempEndDate)}
                </Text>
              </Pressable>
            </View>

            {/* Validation Warning */}
            {tempStartDate.getTime() > tempEndDate.getTime() && (
              <View style={[styles.warningContainer, { backgroundColor: themeColors.warning + '20' }]}>
                <MaterialCommunityIcons name="alert-circle" size={16} color={themeColors.warning} />
                <Text style={[styles.warningText, { color: themeColors.warning }]}>
                  Dates will be swapped (start &gt; end)
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <Pressable
                style={[styles.cancelButton, { backgroundColor: themeColors.surfaceSecondary }]}
                onPress={() => setShowCustomModal(false)}
              >
                <Text style={[styles.cancelButtonText, { color: themeColors.textSecondary }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, { backgroundColor: themeColors.primary }]}
                onPress={handleCustomRangeSave}
              >
                <Text style={[styles.saveButtonText, { color: themeColors.surface }]}>
                  Apply Range
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Start Date Picker */}
      <DatePickerModal
        visible={showStartPicker}
        onClose={() => setShowStartPicker(false)}
        value={tempStartDate}
        onChange={(date) => {
          setTempStartDate(date);
          setShowStartPicker(false);
        }}
      />

      {/* End Date Picker */}
      <DatePickerModal
        visible={showEndPicker}
        onClose={() => setShowEndPicker(false)}
        value={tempEndDate}
        onChange={(date) => {
          setTempEndDate(date);
          setShowEndPicker(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  presetsRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  presetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetText: {
    fontSize: 13,
    fontWeight: "600",
  },
  customButton: {
    paddingHorizontal: 10,
  },
  customRangeDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  customRangeText: {
    fontSize: 13,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  customPickerContainer: {
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 320,
  },
  customPickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 20,
  },
  dateInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dateInputLabel: {
    fontSize: 14,
    fontWeight: "500",
    width: 40,
  },
  dateInputButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  dateInputText: {
    fontSize: 15,
    fontWeight: "500",
  },
  arrowContainer: {
    alignItems: "center",
    paddingVertical: 8,
    marginLeft: 52,
  },
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  warningText: {
    fontSize: 13,
    fontWeight: "500",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
