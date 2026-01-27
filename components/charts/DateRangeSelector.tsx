/**
 * Date Range Selector Component
 * 
 * Provides preset date range buttons and a proper custom date picker
 * with separate start/end date selection.
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
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
  const { rawColors } = useTheme();
  
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
    <View className="mb-4">
      {/* Preset Buttons */}
      <View className="flex-row gap-1.5 items-center">
        {presets.map((preset) => (
          <Pressable
            key={preset.id}
            className={`px-3 py-2 rounded-lg border ${
              value.preset === preset.id
                ? "bg-primary border-primary"
                : "border-border"
            }`}
            onPress={() => handlePresetPress(preset.id)}
          >
            <Text
              className={`text-[13px] font-semibold ${
                value.preset === preset.id ? "text-primary-foreground" : "text-foreground"
              }`}
            >
              {preset.label}
            </Text>
          </Pressable>
        ))}
        
        {/* Custom Button */}
        <Pressable
          className={`px-2.5 py-2 rounded-lg border ${
            value.preset === "custom"
              ? "bg-primary border-primary"
              : "border-border"
          }`}
          onPress={() => handlePresetPress("custom")}
        >
          <MaterialCommunityIcons
            name="calendar-range"
            size={16}
            color={value.preset === "custom" ? rawColors.surface : rawColors.foregroundSecondary}
          />
        </Pressable>
      </View>

      {/* Custom Range Display */}
      {value.preset === "custom" && value.startDate && (
        <Pressable
          className="flex-row items-center justify-center gap-2 py-2 px-3 rounded-lg mt-2 bg-surface-secondary"
          onPress={() => {
            setTempStartDate(value.startDate ?? new Date());
            setTempEndDate(value.endDate);
            setShowCustomModal(true);
          }}
        >
          <Text className="text-[13px] font-medium text-foreground">
            {formatDateDisplay(value.startDate)} - {formatDateDisplay(value.endDate)}
          </Text>
          <MaterialCommunityIcons name="pencil" size={14} color={rawColors.foregroundSecondary} />
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
          className="flex-1 justify-center items-center p-5 bg-overlay-dark"
          onPress={() => setShowCustomModal(false)}
        >
          <View 
            className="rounded-2xl p-5 w-full max-w-[320px] bg-surface"
            onStartShouldSetResponder={() => true}
          >
            <Text className="text-lg font-semibold text-center mb-5 text-foreground">
              Select Date Range
            </Text>
            
            {/* Start Date Row */}
            <View className="flex-row items-center gap-3">
              <Text className="text-sm font-medium w-10 text-foreground-secondary">
                Start
              </Text>
              <Pressable
                className="flex-1 flex-row items-center gap-2.5 py-3 px-3.5 rounded-xl border border-border bg-surface-secondary"
                onPress={() => setShowStartPicker(true)}
              >
                <MaterialCommunityIcons name="calendar" size={18} color={rawColors.primary} />
                <Text className="text-[15px] font-medium text-foreground">
                  {formatDateShort(tempStartDate)}
                </Text>
              </Pressable>
            </View>

            {/* Arrow */}
            <View className="items-center py-2 ml-[52px]">
              <MaterialCommunityIcons name="arrow-down" size={20} color={rawColors.foregroundSecondary} />
            </View>

            {/* End Date Row */}
            <View className="flex-row items-center gap-3">
              <Text className="text-sm font-medium w-10 text-foreground-secondary">
                End
              </Text>
              <Pressable
                className="flex-1 flex-row items-center gap-2.5 py-3 px-3.5 rounded-xl border border-border bg-surface-secondary"
                onPress={() => setShowEndPicker(true)}
              >
                <MaterialCommunityIcons name="calendar" size={18} color={rawColors.primary} />
                <Text className="text-[15px] font-medium text-foreground">
                  {formatDateShort(tempEndDate)}
                </Text>
              </Pressable>
            </View>

            {/* Validation Warning */}
            {tempStartDate.getTime() > tempEndDate.getTime() && (
              <View 
                className="flex-row items-center gap-2 py-2.5 px-3 rounded-lg mt-3"
                style={{ backgroundColor: rawColors.warning + "20" }}
              >
                <MaterialCommunityIcons name="alert-circle" size={16} color={rawColors.warning} />
                <Text style={{ color: rawColors.warning }} className="text-[13px] font-medium">
                  Dates will be swapped (start &gt; end)
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View className="flex-row gap-3 mt-5">
              <Pressable
                className="flex-1 py-3.5 rounded-xl items-center bg-surface-secondary"
                onPress={() => setShowCustomModal(false)}
              >
                <Text className="text-base font-semibold text-foreground-secondary">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                className="flex-1 py-3.5 rounded-xl items-center bg-primary"
                onPress={handleCustomRangeSave}
              >
                <Text className="text-base font-semibold text-primary-foreground">
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
