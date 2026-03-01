import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../../../lib/theme/ThemeContext";

export default function ProgramBasicsScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ pslSource?: string; templateName?: string }>();

  const [name, setName] = useState(params.templateName ?? "");
  const [description, setDescription] = useState("");
  const [units, setUnits] = useState<"kg" | "lb">("kg");
  const [useCalendar, setUseCalendar] = useState(true);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [useEndDate, setUseEndDate] = useState(false);

  const preloadedPsl = params.pslSource ?? null;

  const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const toIsoDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const handleNext = useCallback(() => {
    if (!name.trim()) return;
    Keyboard.dismiss();

    router.push({
      pathname: "/programs/create/schedule",
      params: {
        name: name.trim(),
        description: description.trim(),
        units,
        useCalendar: useCalendar ? "1" : "0",
        startDate: useCalendar ? toIsoDate(startDate) : "",
        endDate: useCalendar && useEndDate && endDate ? toIsoDate(endDate) : "",
        pslSource: preloadedPsl ?? "",
      },
    });
  }, [name, description, units, useCalendar, startDate, endDate, useEndDate, preloadedPsl]);

  return (
    <View style={styles.container} className="bg-background">
      <Stack.Screen
        options={{
          title: "Program Basics",
          headerStyle: { backgroundColor: rawColors.background },
          headerTintColor: rawColors.foreground,
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: rawColors.foregroundSecondary }]}>
            Program Name *
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: rawColors.surfaceSecondary,
                borderColor: rawColors.borderLight,
                color: rawColors.foreground,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder="e.g., My Strength Program"
            placeholderTextColor={rawColors.foregroundMuted}
            autoFocus={!preloadedPsl}
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: rawColors.foregroundSecondary }]}>
            Description
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: rawColors.surfaceSecondary,
                borderColor: rawColors.borderLight,
                color: rawColors.foreground,
              },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your program..."
            placeholderTextColor={rawColors.foregroundMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Units */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: rawColors.foregroundSecondary }]}>
            Units
          </Text>
          <View style={styles.unitRow}>
            <Pressable
              onPress={() => setUnits("kg")}
              style={[
                styles.unitButton,
                {
                  backgroundColor: units === "kg" ? rawColors.primary : rawColors.surfaceSecondary,
                  borderColor: units === "kg" ? rawColors.primary : rawColors.borderLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.unitButtonText,
                  { color: units === "kg" ? rawColors.primaryForeground : rawColors.foreground },
                ]}
              >
                kg
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setUnits("lb")}
              style={[
                styles.unitButton,
                {
                  backgroundColor: units === "lb" ? rawColors.primary : rawColors.surfaceSecondary,
                  borderColor: units === "lb" ? rawColors.primary : rawColors.borderLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.unitButtonText,
                  { color: units === "lb" ? rawColors.primaryForeground : rawColors.foreground },
                ]}
              >
                lb
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Calendar Toggle */}
        <View style={[styles.toggleRow, { borderColor: rawColors.borderLight }]}>
          <View style={styles.toggleInfo}>
            <Text style={[styles.toggleTitle, { color: rawColors.foreground }]}>
              Calendar Schedule
            </Text>
            <Text style={[styles.toggleDesc, { color: rawColors.foregroundSecondary }]}>
              Schedule sessions to specific dates
            </Text>
          </View>
          <Switch
            value={useCalendar}
            onValueChange={setUseCalendar}
            trackColor={{ false: rawColors.borderLight, true: rawColors.primary + "60" }}
            thumbColor={useCalendar ? rawColors.primary : rawColors.foregroundMuted}
          />
        </View>

        {/* Start / End dates */}
        {useCalendar && (
          <View style={[styles.dateSection, { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.borderLight }]}>
            <Pressable
              onPress={() => setShowStartPicker(true)}
              style={styles.dateRow}
            >
              <Text style={[styles.dateLabel, { color: rawColors.foregroundSecondary }]}>
                Start Date
              </Text>
              <Text style={[styles.dateValue, { color: rawColors.foreground }]}>
                {formatDate(startDate)}
              </Text>
            </Pressable>

            {showStartPicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, date) => {
                  setShowStartPicker(Platform.OS === "ios");
                  if (date) setStartDate(date);
                }}
              />
            )}

            <View style={[styles.toggleRow, { borderTopWidth: StyleSheet.hairlineWidth, borderColor: rawColors.borderLight, paddingHorizontal: 0 }]}>
              <Text style={[styles.dateLabel, { color: rawColors.foregroundSecondary }]}>
                End Date
              </Text>
              <Switch
                value={useEndDate}
                onValueChange={setUseEndDate}
                trackColor={{ false: rawColors.borderLight, true: rawColors.primary + "60" }}
                thumbColor={useEndDate ? rawColors.primary : rawColors.foregroundMuted}
              />
            </View>

            {useEndDate && (
              <Pressable
                onPress={() => setShowEndPicker(true)}
                style={styles.dateRow}
              >
                <Text style={[styles.dateLabel, { color: rawColors.foregroundSecondary }]}>
                  End Date
                </Text>
                <Text style={[styles.dateValue, { color: rawColors.foreground }]}>
                  {endDate ? formatDate(endDate) : "Select..."}
                </Text>
              </Pressable>
            )}

            {showEndPicker && (
              <DateTimePicker
                value={endDate ?? new Date()}
                mode="date"
                minimumDate={startDate}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, date) => {
                  setShowEndPicker(Platform.OS === "ios");
                  if (date) setEndDate(date);
                }}
              />
            )}
          </View>
        )}
      </ScrollView>

      {/* Next Button */}
      <View style={[styles.footer, { backgroundColor: rawColors.background }]}>
        <Pressable
          onPress={handleNext}
          disabled={!name.trim()}
          style={({ pressed }) => [
            styles.nextButton,
            {
              backgroundColor: name.trim() ? rawColors.primary : rawColors.surfaceSecondary,
              opacity: pressed && name.trim() ? 0.8 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.nextButtonText,
              { color: name.trim() ? rawColors.primaryForeground : rawColors.foregroundMuted },
            ]}
          >
            Next: Schedule
          </Text>
          <MaterialCommunityIcons
            name="arrow-right"
            size={20}
            color={name.trim() ? rawColors.primaryForeground : rawColors.foregroundMuted}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  unitRow: {
    flexDirection: "row",
    gap: 12,
  },
  unitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  unitButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  toggleDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  dateSection: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  dateValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
