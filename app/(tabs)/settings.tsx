import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    ExportCancelledError as BackupCancelledError,
    FileSystemUnavailableError as BackupFsError,
    exportDatabaseBackup,
} from "../../lib/db/backup";
import ReplacementRestoreDialog from "../../components/settings/ReplacementRestoreDialog";
import { discardPreparedRestore, prepareReplacementRestore } from "../../lib/db/replacementRestore";
import {
  getReplacementRestoreAvailability,
  scheduleReplacementRestoreAndBlock,
} from "../../lib/db/replacementRestoreLifecycle";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import { getGlobalFormula, setGlobalFormula, type E1RMFormulaId, type UnitPreference } from "../../lib/db/index";
import { getColorTheme, getThemePreference, type ThemePreference } from "../../lib/db/settings";
import { COLOR_THEME_OPTIONS, type ColorThemeId } from "../../lib/theme/themes";
import { useTheme } from "../../lib/theme/ThemeContext";
import {
    ExportCancelledError,
    exportTrainingCsvToUserSaveLocation,
    FileSystemUnavailableError,
} from "../../lib/utils/exportCsv";

export default function SettingsScreen() {
  const { rawColors, setThemePreference: updateThemePreference, setColorTheme: updateColorTheme } = useTheme();
  const { unitPreference, setUnitPreference: updateUnitPreference } = useUnitPreference();
  const [selected, setSelected] = useState<E1RMFormulaId>("epley");
  const [selectedTheme, setSelectedTheme] = useState<ThemePreference>("system");
  const [selectedColorTheme, setSelectedColorTheme] = useState<ColorThemeId>("default");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [showReplacementRestore, setShowReplacementRestore] = useState(false);
  const operationOwnerRef = useRef<"csv" | "backup" | "restore" | null>(null);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showFormulaPicker, setShowFormulaPicker] = useState(false);

  useEffect(() => {
    const current = getGlobalFormula();
    setSelected(current);
    const currentTheme = getThemePreference();
    setSelectedTheme(currentTheme);
    const currentColorTheme = getColorTheme();
    setSelectedColorTheme(currentColorTheme);
  }, []);

  const options = useMemo(
    () => [
      { id: "epley", label: "Epley" },
      { id: "brzycki", label: "Brzycki" },
      { id: "oconner", label: "O'Conner" },
      { id: "lombardi", label: "Lombardi" },
      { id: "mayhew", label: "Mayhew" },
      { id: "wathan", label: "Wathan" },
    ] as { id: E1RMFormulaId; label: string }[],
    []
  );

  function onSelect(id: E1RMFormulaId) {
    setSelected(id);
    setGlobalFormula(id);
  }

  function onThemeSelect(preference: ThemePreference) {
    setSelectedTheme(preference);
    updateThemePreference(preference);
  }

  function onColorThemeSelect(theme: ColorThemeId) {
    setSelectedColorTheme(theme);
    updateColorTheme(theme);
  }

  async function onExportCsv() {
    if (isExporting || showReplacementRestore || operationOwnerRef.current) {
      return;
    }
    operationOwnerRef.current = "csv";
    setIsExporting(true);
    console.log("[exportCsv] Export requested from Settings.");
    try {
      const { uri, method } = await exportTrainingCsvToUserSaveLocation();
      console.log("[exportCsv] CSV prepared", { uri, method });

      if (method === "android_saf") {
        Alert.alert("Export complete", "Saved to the selected folder.");
        return;
      }

      let canShare = false;
      try {
        canShare = await Sharing.isAvailableAsync();
      } catch (error) {
        console.warn("[exportCsv] Sharing availability check failed", error);
      }
      if (!canShare) {
        Alert.alert("Export complete", "CSV saved. Sharing is not available on this device.");
        return;
      }
      try {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Save CSV",
          UTI: "public.comma-separated-values-text",
        });
        console.log("[exportCsv] Share sheet opened.");
      } catch (error) {
        console.warn("[exportCsv] Share failed", error);
        throw error;
      }
      Alert.alert("Export complete", 'Choose "Save to Files" to store the CSV.');
    } catch (error) {
      console.warn("[exportCsv] Export failed", error);
      if (error instanceof ExportCancelledError) {
        Alert.alert("Export cancelled", "No file was saved.");
        return;
      }
      if (error instanceof FileSystemUnavailableError) {
        Alert.alert(
          "Export unavailable",
          "CSV export requires a development build or production APK. It is not available in Expo Go or this runtime."
        );
      } else {
        Alert.alert("Export failed", "Unable to export CSV. Please try again.");
      }
    } finally {
      if (operationOwnerRef.current === "csv") operationOwnerRef.current = null;
      setIsExporting(false);
    }
  }

  async function onExportBackup() {
    if (isExportingBackup || showReplacementRestore || operationOwnerRef.current) return;
    operationOwnerRef.current = "backup";
    setIsExportingBackup(true);
    console.log("[backup] Export backup requested from Settings.");
    try {
      const { uri, method } = await exportDatabaseBackup();
      console.log("[backup] Backup prepared", { uri, method });

      if (method === "android_saf") {
        Alert.alert("Backup complete", "Database backup saved to the selected folder.");
        return;
      }

      let canShare = false;
      try {
        canShare = await Sharing.isAvailableAsync();
      } catch (error) {
        console.warn("[backup] Sharing availability check failed", error);
      }
      if (!canShare) {
        Alert.alert("Backup complete", "Backup saved. Sharing is not available on this device.");
        return;
      }
      try {
        await Sharing.shareAsync(uri, {
          mimeType: "application/x-sqlite3",
          dialogTitle: "Save Backup",
        });
        console.log("[backup] Share sheet opened.");
      } catch (error) {
        console.warn("[backup] Share failed", error);
        throw error;
      }
      Alert.alert("Backup complete", 'Choose "Save to Files" to store the backup.');
    } catch (error) {
      console.warn("[backup] Export failed", error);
      if (error instanceof BackupCancelledError) {
        Alert.alert("Backup cancelled", "No backup was saved.");
        return;
      }
      if (error instanceof BackupFsError) {
        Alert.alert(
          "Backup unavailable",
          "Database backup requires a development build or production APK."
        );
      } else {
        Alert.alert("Backup failed", "Unable to create backup. Please try again.");
      }
    } finally {
      if (operationOwnerRef.current === "backup") operationOwnerRef.current = null;
      setIsExportingBackup(false);
    }
  }

  function onImportBackup() {
    if (showReplacementRestore || operationOwnerRef.current) return;
    if (!getReplacementRestoreAvailability().available) return;
    operationOwnerRef.current = "restore";
    setShowReplacementRestore(true);
  }

  const restoreAvailability = getReplacementRestoreAvailability();

  const themeOptions = useMemo(
    () => [
      { id: "system" as ThemePreference, label: "System Default" },
      { id: "light" as ThemePreference, label: "Light" },
      { id: "dark" as ThemePreference, label: "Dark" },
    ],
    []
  );

  const unitOptions = useMemo(
    () =>
      [
        { id: "kg" as UnitPreference, label: "Kilograms (kg)" },
        { id: "lb" as UnitPreference, label: "Pounds (lb)" },
      ] as { id: UnitPreference; label: string }[],
    []
  );

  async function onUnitSelect(unit: UnitPreference) {
    await updateUnitPreference(unit);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        {/* Header */}
        <View className="mb-6 pt-3">
          <Text className="text-[32px] leading-[38px] font-bold text-foreground">Settings</Text>
          <Text className="text-base mt-1 text-foreground-secondary">
            Customize your experience
          </Text>
        </View>

        {/* Appearance Section */}
        <View 
          className="rounded-2xl p-5 mb-4 bg-surface"
          style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
        >
          <Text className="text-[13px] font-semibold tracking-wide mb-4 text-foreground-secondary">APPEARANCE</Text>
          
          {/* Light/Dark Mode */}
          <Text className="text-base font-semibold mb-3 text-foreground">Display Mode</Text>
          <Pressable
            style={[
              styles.pickerButton,
              { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.border },
            ]}
            onPress={() => setShowThemePicker(true)}
          >
            <Text style={[styles.pickerButtonText, { color: rawColors.foreground }]}>
              {themeOptions.find((opt) => opt.id === selectedTheme)?.label || "Select"}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color={rawColors.foregroundSecondary} />
          </Pressable>
          <Text className="text-[13px] mt-3 leading-[18px] text-foreground-muted">
            Choose how the app looks. System Default follows your device settings.
          </Text>

          {/* Color Theme */}
          <Text className="text-base font-semibold mb-3 mt-5 text-foreground">Color Theme</Text>
          <View className="flex-row flex-wrap gap-2.5 mt-1">
            {COLOR_THEME_OPTIONS.map((theme) => (
              <Pressable
                key={theme.id}
                onPress={() => onColorThemeSelect(theme.id)}
                className={`flex-row items-center py-2.5 px-3 rounded-xl min-w-[100px] ${
                  selectedColorTheme === theme.id ? "" : "bg-surface-secondary"
                }`}
                style={[
                  selectedColorTheme === theme.id && { backgroundColor: rawColors.pressed },
                  { 
                    borderWidth: selectedColorTheme === theme.id ? 2 : 1, 
                    borderColor: selectedColorTheme === theme.id ? theme.previewColor : rawColors.border 
                  }
                ]}
              >
                <View 
                  className="w-6 h-6 rounded-full mr-2 items-center justify-center"
                  style={{ backgroundColor: theme.previewColor }}
                >
                  {selectedColorTheme === theme.id && (
                    <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                  )}
                </View>
                <Text 
                  className="text-sm"
                  style={{ 
                    color: selectedColorTheme === theme.id ? theme.previewColor : rawColors.foreground,
                    fontWeight: selectedColorTheme === theme.id ? "600" : "400",
                  }}
                >
                  {theme.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className="text-[13px] mt-3 leading-[18px] text-foreground-muted">
            Choose a color theme for the app. Each theme works in both light and dark modes.
          </Text>
        </View>

        {/* Formula Section */}
        <View 
          className="rounded-2xl p-5 mb-4 bg-surface"
          style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
        >
          <Text className="text-[13px] font-semibold tracking-wide mb-4 text-foreground-secondary">CALCULATIONS</Text>

          <Text className="text-base font-semibold mb-3 text-foreground">Weight Unit</Text>
          <Pressable
            style={[
              styles.pickerButton,
              { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.border },
            ]}
            onPress={() => setShowUnitPicker(true)}
          >
            <Text style={[styles.pickerButtonText, { color: rawColors.foreground }]}>
              {unitOptions.find((opt) => opt.id === unitPreference)?.label || "Select"}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color={rawColors.foregroundSecondary} />
          </Pressable>
          <Text className="text-[13px] mt-3 leading-[18px] text-foreground-muted">
            Choose the unit used for weight and volume across the app.
          </Text>

          <Text className="text-base font-semibold mb-3 mt-5 text-foreground">Estimated 1RM Formula</Text>
          <Pressable
            style={[
              styles.pickerButton,
              { backgroundColor: rawColors.surfaceSecondary, borderColor: rawColors.border },
            ]}
            onPress={() => setShowFormulaPicker(true)}
          >
            <Text style={[styles.pickerButtonText, { color: rawColors.foreground }]}>
              {options.find((opt) => opt.id === selected)?.label || "Select"}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color={rawColors.foregroundSecondary} />
          </Pressable>
          <Text className="text-[13px] mt-3 leading-[18px] text-foreground-muted">
            The formula used to calculate your estimated one-rep max from your workout data.
          </Text>
        </View>

        {/* Data Section */}
        <View 
          className="rounded-2xl p-5 mb-4 bg-surface"
          style={{ shadowColor: rawColors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
        >
          <Text className="text-[13px] font-semibold tracking-wide mb-4 text-foreground-secondary">DATA</Text>

          {/* Export Backup */}
          <Pressable
            onPress={onExportBackup}
            disabled={isExportingBackup || showReplacementRestore}
            className={`border border-border rounded-xl py-3 px-3.5 ${isExportingBackup || showReplacementRestore ? "opacity-70" : ""}`}
            style={({ pressed }) => ({ 
              backgroundColor: pressed && !isExportingBackup ? rawColors.pressed : rawColors.surfaceSecondary 
            })}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-base font-semibold text-foreground">Export backup (.db)</Text>
                <Text className="text-xs mt-1 leading-4 text-foreground-muted">
                  Save a full backup of your workout database.
                </Text>
              </View>
              {isExportingBackup ? (
                <ActivityIndicator size="small" color={rawColors.primary} />
              ) : (
                <Text className="text-sm font-semibold text-primary">Export</Text>
              )}
            </View>
          </Pressable>

          {/* Import Backup */}
          <Pressable
            onPress={onImportBackup}
            disabled={showReplacementRestore || !restoreAvailability.available || Boolean(operationOwnerRef.current && operationOwnerRef.current !== "restore")}
            className={`border border-border rounded-xl py-3 px-3.5 mt-3 ${showReplacementRestore || !restoreAvailability.available ? "opacity-70" : ""}`}
            style={({ pressed }) => ({ 
              backgroundColor: pressed && !showReplacementRestore ? rawColors.pressed : rawColors.surfaceSecondary
            })}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-base font-semibold text-foreground">Replace app data from backup (.db)</Text>
                <Text className="text-xs mt-1 leading-4 text-foreground-muted">
                  Replace the current app data with a previous backup.
                </Text>
              </View>
              <Text className="text-sm font-semibold text-primary">Replace</Text>
            </View>
          </Pressable>

          {/* Export CSV */}
          <Pressable
            onPress={onExportCsv}
            disabled={isExporting || showReplacementRestore}
            className={`border border-border rounded-xl py-3 px-3.5 mt-3 ${isExporting ? "opacity-70" : ""}`}
            style={({ pressed }) => ({ 
              backgroundColor: pressed && !isExporting ? rawColors.pressed : rawColors.surfaceSecondary 
            })}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-base font-semibold text-foreground">Export CSV</Text>
                <Text className="text-xs mt-1 leading-4 text-foreground-muted">
                  Download all recorded sets as a single CSV file.
                </Text>
              </View>
              {isExporting ? (
                <ActivityIndicator size="small" color={rawColors.primary} />
              ) : (
                <Text className="text-sm font-semibold text-primary">Export</Text>
              )}
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <ReplacementRestoreDialog
        visible={showReplacementRestore}
        onDismiss={() => {
          operationOwnerRef.current = null;
          setShowReplacementRestore(false);
        }}
        service={{ prepareReplacementRestore, discardPreparedRestore }}
        lifecycle={{ scheduleReplacementRestoreAndBlock, getReplacementRestoreAvailability }}
      />

      {/* Theme Picker Modal */}
      <Modal visible={showThemePicker} transparent animationType="fade" onRequestClose={() => setShowThemePicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowThemePicker(false)}>
          <View style={[styles.pickerContainer, { backgroundColor: rawColors.surface }]}>
            <Text style={[styles.pickerTitle, { color: rawColors.foreground }]}>Display Mode</Text>
            {themeOptions.map((option) => (
              <Pressable
                key={option.id}
                style={[
                  styles.pickerOption,
                  { borderBottomColor: rawColors.border },
                  selectedTheme === option.id && { backgroundColor: rawColors.primaryLight },
                ]}
                onPress={() => {
                  onThemeSelect(option.id);
                  setShowThemePicker(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    { color: rawColors.foreground },
                    selectedTheme === option.id && { color: rawColors.primary, fontWeight: "600" },
                  ]}
                >
                  {option.label}
                </Text>
                {selectedTheme === option.id && (
                  <MaterialCommunityIcons name="check" size={20} color={rawColors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Unit Picker Modal */}
      <Modal visible={showUnitPicker} transparent animationType="fade" onRequestClose={() => setShowUnitPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowUnitPicker(false)}>
          <View style={[styles.pickerContainer, { backgroundColor: rawColors.surface }]}>
            <Text style={[styles.pickerTitle, { color: rawColors.foreground }]}>Weight Unit</Text>
            {unitOptions.map((option) => (
              <Pressable
                key={option.id}
                style={[
                  styles.pickerOption,
                  { borderBottomColor: rawColors.border },
                  unitPreference === option.id && { backgroundColor: rawColors.primaryLight },
                ]}
                onPress={async () => {
                  await onUnitSelect(option.id);
                  setShowUnitPicker(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    { color: rawColors.foreground },
                    unitPreference === option.id && { color: rawColors.primary, fontWeight: "600" },
                  ]}
                >
                  {option.label}
                </Text>
                {unitPreference === option.id && (
                  <MaterialCommunityIcons name="check" size={20} color={rawColors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Formula Picker Modal */}
      <Modal visible={showFormulaPicker} transparent animationType="fade" onRequestClose={() => setShowFormulaPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowFormulaPicker(false)}>
          <View style={[styles.pickerContainer, { backgroundColor: rawColors.surface }]}>
            <Text style={[styles.pickerTitle, { color: rawColors.foreground }]}>Estimated 1RM Formula</Text>
            {options.map((option) => (
              <Pressable
                key={option.id}
                style={[
                  styles.pickerOption,
                  { borderBottomColor: rawColors.border },
                  selected === option.id && { backgroundColor: rawColors.primaryLight },
                ]}
                onPress={() => {
                  onSelect(option.id);
                  setShowFormulaPicker(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    { color: rawColors.foreground },
                    selected === option.id && { color: rawColors.primary, fontWeight: "600" },
                  ]}
                >
                  {option.label}
                </Text>
                {selected === option.id && (
                  <MaterialCommunityIcons name="check" size={20} color={rawColors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  pickerContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    paddingBottom: 12,
    marginBottom: 8,
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  pickerOptionText: {
    fontSize: 16,
  },
});
