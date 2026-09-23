import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useUnitPreference } from "../../../lib/contexts/UnitPreferenceContext";
import { type ProgramCalendarSetRow, type ProgrammedExerciseForDate } from "../../../lib/db/programCalendar";
import { useTheme } from "../../../lib/theme/ThemeContext";
import { getWeightUnitLabel } from "../../../lib/utils/units";
import { getProgramEntryLabel, hasLoggedProgramSet, getProgramSetInputPresentation } from "./recording-utils";

type ProgrammedSetsPanelProps = {
  disabled?: boolean;
  programEntries: ProgrammedExerciseForDate[];
  selectedProgramExerciseId: number | null;
  onSelectProgramExercise: (id: number) => void;
  prescribedSets: ProgramCalendarSetRow[];
  userSets: ProgramCalendarSetRow[];
  weightInputs: Record<number, string>;
  repsInputs: Record<number, string>;
  onWeightChange: (setId: number, value: string) => void;
  onRepsChange: (setId: number, value: string) => void;
  onAutofillSet: (
    setId: number,
    values: {
      weight: string;
      reps: string;
    }
  ) => void | Promise<void>;
  onSetFocus: (setId: number) => void;
  onSetBlur: (setId: number) => void;
  onOpenSetInfo: (setId: number, calendarSetId: number) => void;
  setIdsWithMedia: Set<number>;
};
export default function ProgrammedSetsPanel({
  disabled = false,
  programEntries,
  selectedProgramExerciseId,
  onSelectProgramExercise,
  prescribedSets,
  userSets,
  weightInputs,
  repsInputs,
  onWeightChange,
  onRepsChange,
  onAutofillSet,
  onSetFocus,
  onSetBlur,
  onOpenSetInfo,
  setIdsWithMedia,
}: ProgrammedSetsPanelProps) {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const weightUnitLabel = getWeightUnitLabel(unitPreference);
  const loggedSetCount = useMemo(
    () => prescribedSets.filter((set) => hasLoggedProgramSet(set)).length,
    [prescribedSets]
  );

  const renderProgramSet = useCallback(
    (
      set: ProgramCalendarSetRow,
      index: number,
      options?: {
        isExtra?: boolean;
      }
    ) => {
      const weightValue = weightInputs[set.id] ?? "";
      const repsValue = repsInputs[set.id] ?? "";
      const isComplete = hasLoggedProgramSet(set);
      const isExtra = options?.isExtra ?? false;
      const canOpenSetInfo = !!set.setId;
      const {
        autofillWeight,
        autofillReps,
        intensityPlaceholder,
        intensityUnitLabel,
        repsPlaceholder,
      } = getProgramSetInputPresentation(
        set,
        weightUnitLabel,
        unitPreference
      );
      const canAutofill = !disabled && !isComplete && !!autofillWeight && !!autofillReps;
      const roleLabel =
        isExtra
          ? "Extra"
          : set.prescribedRole && set.prescribedRole !== "work"
            ? set.prescribedRole.charAt(0).toUpperCase() +
            set.prescribedRole.slice(1)
            : null;

      return (
        <View
          key={set.id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 10,
            paddingHorizontal: 10,
            borderRadius: 12,
            borderWidth: 1,
            marginBottom: 8,
            backgroundColor: isComplete
              ? rawColors.success + "18"
              : rawColors.surfaceSecondary,
            borderColor: isComplete
              ? rawColors.success + "40"
              : rawColors.borderLight,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isComplete
                ? `Set ${index + 1} completed`
                : canAutofill
                  ? `Autofill set ${index + 1} with prescribed values`
                  : `Set ${index + 1}`
            }
            accessibilityState={{
              disabled: !canAutofill,
            }}
            hitSlop={6}
            disabled={!canAutofill}
            onPress={() => {
              if (!canAutofill) {
                return;
              }
              void onAutofillSet(set.id, {
                weight: autofillWeight,
                reps: autofillReps,
              });
            }}
            style={({ pressed }) => ({
              paddingRight: 12,
              marginRight: 4,
              opacity: canAutofill && pressed ? 0.8 : 1,
            })}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isComplete
                  ? rawColors.success
                  : rawColors.foregroundSecondary,
              }}
            >
              {isComplete ? (
                <MaterialCommunityIcons
                  name="check"
                  size={14}
                  color={rawColors.primaryForeground}
                />
              ) : (
                <Text
                  className="text-xs font-bold text-primary-foreground"
                  selectable
                >
                  {index + 1}
                </Text>
              )}
            </View>
          </Pressable>

          <View style={{ flex: 1, flexDirection: "row", gap: 4, marginLeft: 8 }}>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 2,
              }}
            >
              <TextInput
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 8,
                  fontSize: 15,
                  fontWeight: "600",
                  textAlign: "center",
                  backgroundColor: rawColors.surface,
                  borderColor: isComplete
                    ? rawColors.success + "45"
                    : rawColors.borderLight,
                  color: rawColors.foreground,
                }}
                value={weightValue}
                onChangeText={(value) => onWeightChange(set.id, value)}
                onFocus={() => onSetFocus(set.id)}
                onBlur={() => onSetBlur(set.id)}
                placeholder={intensityPlaceholder}
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="decimal-pad"
              />
              <Text
                className="text-[11px] font-medium"
                style={{ width: 24, color: rawColors.foregroundSecondary }}
                selectable
              >
                {intensityUnitLabel}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 2,
              }}
            >
              <TextInput
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 8,
                  fontSize: 15,
                  fontWeight: "600",
                  textAlign: "center",
                  backgroundColor: rawColors.surface,
                  borderColor: isComplete
                    ? rawColors.success + "45"
                    : rawColors.borderLight,
                  color: rawColors.foreground,
                }}
                value={repsValue}
                onChangeText={(value) => onRepsChange(set.id, value)}
                onFocus={() => onSetFocus(set.id)}
                onBlur={() => onSetBlur(set.id)}
                placeholder={repsPlaceholder}
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="number-pad"
              />
              <Text
                className="text-[11px] font-medium"
                style={{ width: 30, color: rawColors.foregroundSecondary }}
                selectable
              >
                reps
              </Text>
            </View>
          </View>

          <View className="ml-2 flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open set ${index + 1} details`}
              accessibilityState={{ disabled: !canOpenSetInfo }}
              hitSlop={8}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={({ pressed }) => ({
                opacity: !canOpenSetInfo ? 0.45 : pressed ? 0.7 : 1,
                backgroundColor:
                  canOpenSetInfo && setIdsWithMedia.has(set.setId!)
                    ? rawColors.primary + "18"
                    : rawColors.surface,
                borderWidth: 1,
                borderColor:
                  canOpenSetInfo && setIdsWithMedia.has(set.setId!)
                    ? rawColors.primary + "30"
                    : rawColors.borderLight,
              })}
              onPress={() => {
                if (!set.setId) {
                  return;
                }
                onOpenSetInfo(set.setId, set.id);
              }}
              disabled={!canOpenSetInfo}
            >
              <MaterialCommunityIcons
                name="information-outline"
                size={18}
                color={
                  canOpenSetInfo && setIdsWithMedia.has(set.setId!)
                    ? rawColors.primary
                    : rawColors.foregroundMuted
                }
              />
            </Pressable>

            {roleLabel && (
              <View
                className="rounded-md px-2 py-1"
                style={{ backgroundColor: rawColors.primary + "20" }}
              >
                <Text
                  className="text-[10px] font-bold uppercase"
                  style={{ color: rawColors.primary }}
                  selectable
                >
                  {roleLabel}
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    },
    [
      disabled,
      weightInputs,
      repsInputs,
      weightUnitLabel,
      unitPreference,
      rawColors.success,
      rawColors.surfaceSecondary,
      rawColors.borderLight,
      rawColors.foregroundSecondary,
      rawColors.primaryForeground,
      rawColors.surface,
      rawColors.foreground,
      rawColors.foregroundMuted,
      rawColors.primary,
      setIdsWithMedia,
      onAutofillSet,
      onWeightChange,
      onSetFocus,
      onSetBlur,
      onRepsChange,
      onOpenSetInfo,
    ]
  );

  return (
    <View
      className="rounded-2xl border p-4 mb-4"
      style={{
        borderColor: rawColors.borderLight,
        backgroundColor: rawColors.surfaceSecondary,
      }}
    >
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-base font-semibold text-foreground" selectable>
          Programmed Sets
        </Text>
        <View className="rounded-full px-3 py-1.5 bg-primary-light">
          <Text className="text-sm font-medium text-primary" selectable>
            {loggedSetCount}/{prescribedSets.length} logged
          </Text>
        </View>
      </View>

      {programEntries.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
        >
          {programEntries.map((entry, index) => {
            const isSelected =
              entry.calendarExercise.id === selectedProgramExerciseId;
            const label = getProgramEntryLabel(
              entry,
              index,
              programEntries.length
            );

            return (
              <Pressable
                key={entry.calendarExercise.id}
                className="rounded-full px-3 py-2"
                style={{
                  backgroundColor: isSelected
                    ? rawColors.primary
                    : rawColors.surfaceSecondary,
                }}
                onPress={() => onSelectProgramExercise(entry.calendarExercise.id)}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{
                    color: isSelected
                      ? rawColors.primaryForeground
                      : rawColors.foreground,
                  }}
                  selectable
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View className="mt-1">
        {prescribedSets.map((set, index) => renderProgramSet(set, index))}
        {userSets.length > 0 && (
          <View className="mt-2">
            <Text
              className="text-xs font-semibold uppercase mb-2 text-foreground-secondary"
              selectable
            >
              Legacy Program Extra Sets
            </Text>
            {userSets.map((set, index) =>
              renderProgramSet(set, index, { isExtra: true })
            )}
          </View>
        )}
      </View>
    </View>
  );
}
