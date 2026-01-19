import { Picker } from "@react-native-picker/picker";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getGlobalFormula, setGlobalFormula, type E1RMFormulaId } from "../../lib/db/index";
import { getThemePreference, type ThemePreference } from "../../lib/db/settings";
import { useTheme } from "../../lib/theme/ThemeContext";
import {
  ExportCancelledError,
  exportTrainingCsvToUserSaveLocation,
  FileSystemUnavailableError,
} from "../../lib/utils/exportCsv";

export default function SettingsScreen() {
  const { themeColors, setThemePreference: updateThemePreference } = useTheme();
  const [selected, setSelected] = useState<E1RMFormulaId>("epley");
  const [selectedTheme, setSelectedTheme] = useState<ThemePreference>("system");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const current = getGlobalFormula();
    setSelected(current);
    const currentTheme = getThemePreference();
    setSelectedTheme(currentTheme);
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

  async function onExportCsv() {
    if (isExporting) {
      return;
    }
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
      setIsExporting(false);
    }
  }

  const themeOptions = useMemo(
    () => [
      { id: "system" as ThemePreference, label: "System Default" },
      { id: "light" as ThemePreference, label: "Light" },
      { id: "dark" as ThemePreference, label: "Dark" },
    ],
    []
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Settings</Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
            Customize your experience
          </Text>
        </View>

        {/* Appearance Section */}
        <View style={[styles.section, { backgroundColor: themeColors.surface, shadowColor: themeColors.shadow }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>APPEARANCE</Text>
          <View style={[styles.pickerContainer, { borderColor: themeColors.border, backgroundColor: themeColors.surfaceSecondary }]}>
            <Picker
              selectedValue={selectedTheme}
              onValueChange={(value) => onThemeSelect(value as ThemePreference)}
              style={{ color: themeColors.text }}
              itemStyle={{ color: themeColors.text }}
              dropdownIconColor={themeColors.textSecondary}
            >
              {themeOptions.map((opt) => (
                <Picker.Item 
                  key={opt.id} 
                  label={opt.label} 
                  value={opt.id}
                  color={themeColors.text}
                />
              ))}
            </Picker>
          </View>
          <Text style={[styles.settingDescription, { color: themeColors.textTertiary }]}>
            Choose how the app looks. System Default follows your device settings.
          </Text>
        </View>

        {/* Formula Section */}
        <View style={[styles.section, { backgroundColor: themeColors.surface, shadowColor: themeColors.shadow }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>CALCULATIONS</Text>
          <Text style={[styles.settingLabel, { color: themeColors.text }]}>Estimated 1RM Formula</Text>
          <View style={[styles.pickerContainer, { borderColor: themeColors.border, backgroundColor: themeColors.surfaceSecondary }]}>
            <Picker
              selectedValue={selected}
              onValueChange={(value) => onSelect(value as E1RMFormulaId)}
              style={{ color: themeColors.text }}
              itemStyle={{ color: themeColors.text }}
              dropdownIconColor={themeColors.textSecondary}
            >
              {options.map((opt) => (
                <Picker.Item 
                  key={opt.id} 
                  label={opt.label} 
                  value={opt.id}
                  color={themeColors.text}
                />
              ))}
            </Picker>
          </View>
          <Text style={[styles.settingDescription, { color: themeColors.textTertiary }]}>
            The formula used to calculate your estimated one-rep max from your workout data.
          </Text>
        </View>

        {/* Data Export Section */}
        <View style={[styles.section, { backgroundColor: themeColors.surface, shadowColor: themeColors.shadow }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>DATA</Text>
          <Pressable
            onPress={onExportCsv}
            disabled={isExporting}
            style={({ pressed }) => [
              styles.exportButton,
              {
                backgroundColor: pressed && !isExporting ? themeColors.pressed : themeColors.surfaceSecondary,
                borderColor: themeColors.border,
                opacity: isExporting ? 0.7 : 1,
              },
            ]}
          >
            <View style={styles.exportButtonContent}>
              <View style={styles.exportButtonText}>
                <Text style={[styles.exportButtonTitle, { color: themeColors.text }]}>Export CSV</Text>
                <Text style={[styles.exportButtonSubtitle, { color: themeColors.textTertiary }]}>
                  Download all recorded sets as a single CSV file.
                </Text>
              </View>
              {isExporting ? (
                <ActivityIndicator size="small" color={themeColors.primary} />
              ) : (
                <Text style={[styles.exportButtonAction, { color: themeColors.primary }]}>Export</Text>
              )}
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
    marginTop: 32,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  section: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  settingDescription: {
    fontSize: 13,
    marginTop: 12,
    lineHeight: 18,
  },
  exportButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  exportButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  exportButtonText: {
    flex: 1,
    marginRight: 12,
  },
  exportButtonTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  exportButtonSubtitle: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  exportButtonAction: {
    fontSize: 14,
    fontWeight: "600",
  },
});



