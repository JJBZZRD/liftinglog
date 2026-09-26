import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import {
  ExportCancelledError as BackupCancelledError,
  FileSystemUnavailableError as BackupFsError,
  exportDatabaseBackup,
} from "@/lib/db/backup";
import { getReplacementRestoreAvailability } from "@/lib/db/replacementRestoreLifecycle";
import {
  ExportCancelledError,
  exportTrainingCsvToUserSaveLocation,
  FileSystemUnavailableError,
} from "@/lib/utils/exportCsv";

/**
 * Backup export, CSV export and replacement restore for Settings. One operation runs
 * at a time: `operationOwnerRef` is claimed synchronously, so a second press (or a
 * handler captured before the restore dialog opened) is ignored.
 */
export function useDataTransfer() {
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [showReplacementRestore, setShowReplacementRestore] = useState(false);
  const operationOwnerRef = useRef<"csv" | "backup" | "restore" | null>(null);

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

  function onDismissRestore() {
    operationOwnerRef.current = null;
    setShowReplacementRestore(false);
  }

  const restoreAvailability = getReplacementRestoreAvailability();

  return {
    isExporting,
    isExportingBackup,
    showReplacementRestore,
    restoreAvailability,
    /** Read during render, as before, so the restore row reflects an export already under way. */
    otherOperationRunning: Boolean(operationOwnerRef.current && operationOwnerRef.current !== "restore"),
    onExportCsv,
    onExportBackup,
    onImportBackup,
    onDismissRestore,
  };
}
