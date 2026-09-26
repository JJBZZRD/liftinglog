import React from "react";
import renderer, { act } from "react-test-renderer";

import SettingsScreen from "../../app/(tabs)/settings";

const mockPrepare = jest.fn();
const mockDiscard = jest.fn();
const mockSchedule = jest.fn();
const mockAvailability = jest.fn();
const mockExportBackup = jest.fn();
const mockExportCsv = jest.fn();
const mockLegacyImport = jest.fn();
const mockAlert = jest.fn();
const mockSetGlobalFormula = jest.fn();
const mockSetUnit = jest.fn();
const mockSetThemePreference = jest.fn();

jest.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  Platform: { OS: "android" }, Pressable: "Pressable", StyleSheet: { absoluteFill: {} },
  Text: "Text", View: "View", useWindowDimensions: () => ({ width: 448, height: 998, scale: 3, fontScale: 1 }),
}));
jest.mock("react-native-reanimated", () => ({ __esModule: true, default: { ScrollView: "ScrollView" } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
jest.mock("expo-blur", () => ({ BlurTargetView: "BlurTargetView" }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.0.0" } } }));
jest.mock("../../components/design-system/design-system-provider", () => ({ DesignSystemProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("../../components/modals/frosted-modal-context", () => ({ FrostedModalProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("../../components/workouts/scroll-fade", () => ({ ScrollFade: "ScrollFade" }));
jest.mock("../../lib/design-system/use-scroll-edge-fades", () => ({
  useScrollEdgeFades: () => ({ topOpacity: { value: 0 }, bottomOpacity: { value: 0 }, scrollProps: {} }),
}));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn().mockResolvedValue(false), shareAsync: jest.fn() }));
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "kg", setUnitPreference: (...args: unknown[]) => mockSetUnit(...args) }),
}));
jest.mock("../../lib/theme/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    rawColors: jest.requireActual("../../lib/design-system/tokens").designColors.light,
    themePreference: "system",
    setThemePreference: (...args: unknown[]) => mockSetThemePreference(...args),
  }),
}));
jest.mock("../../lib/db/index", () => ({ getGlobalFormula: () => "epley", setGlobalFormula: (...args: unknown[]) => mockSetGlobalFormula(...args) }));
jest.mock("../../lib/utils/exportCsv", () => ({
  ExportCancelledError: class ExportCancelledError extends Error {},
  FileSystemUnavailableError: class FileSystemUnavailableError extends Error {},
  exportTrainingCsvToUserSaveLocation: (...args: unknown[]) => mockExportCsv(...args),
}));
jest.mock("../../lib/db/backup", () => ({
  ExportCancelledError: class ExportCancelledError extends Error {},
  FileSystemUnavailableError: class FileSystemUnavailableError extends Error {},
  exportDatabaseBackup: (...args: unknown[]) => mockExportBackup(...args),
  importDatabaseBackup: (...args: unknown[]) => mockLegacyImport(...args),
}));
jest.mock("../../lib/db/replacementRestore", () => ({
  prepareReplacementRestore: (...args: unknown[]) => mockPrepare(...args),
  discardPreparedRestore: (...args: unknown[]) => mockDiscard(...args),
}));
jest.mock("../../lib/db/replacementRestoreLifecycle", () => ({
  scheduleReplacementRestoreAndBlock: (...args: unknown[]) => mockSchedule(...args),
  getReplacementRestoreAvailability: (...args: unknown[]) => mockAvailability(...args),
}));
jest.mock("../../components/modals/BaseModal", () => ({
  BaseModal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? children : null,
}));

const textContent = (children: unknown): string => Array.isArray(children)
  ? children.map(textContent).join("")
  : React.isValidElement(children)
    ? textContent((children as React.ReactElement<{ children?: unknown }>).props.children)
    : String(children ?? "");

const flush = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
};

const ready = {
  status: "ready" as const,
  token: "prepared-token",
  sourceDisplayName: "restore.db",
  candidateSha256: "candidate-hash",
  rowsByTable: { exercises: 2, workouts: 1, workout_exercises: 1, sets: 3 } as never,
  pbEventsInSource: 1,
  mediaRows: 0,
};

type TestNode = {
  type: unknown;
  props: { children?: unknown; onPress: () => void; disabled?: boolean; [key: string]: unknown };
};

beforeEach(() => {
  mockPrepare.mockReset().mockResolvedValue({ status: "cancelled", liveDatabaseChanged: false });
  mockDiscard.mockReset().mockResolvedValue(undefined);
  mockSchedule.mockReset().mockResolvedValue({ status: "restart_required", restoreId: "restore-1", liveDatabaseChanged: false, restartRequired: true });
  mockAvailability.mockReset().mockReturnValue({ available: true });
  mockExportBackup.mockReset().mockResolvedValue({ uri: "backup.db", method: "android_saf" });
  mockExportCsv.mockReset().mockResolvedValue({ uri: "training.csv", method: "android_saf" });
  mockLegacyImport.mockReset();
  mockAlert.mockReset();
  mockSetGlobalFormula.mockReset();
  mockSetUnit.mockReset();
  mockSetThemePreference.mockReset();
});

function renderSettings() {
  let tree!: ReturnType<typeof renderer.create>;
  act(() => { tree = renderer.create(<SettingsScreen />); });
  return tree;
}

function action(tree: ReturnType<typeof renderSettings>, label: string) {
  return tree.root.findAll((node: TestNode) => node.type === "Pressable" && textContent(node.props.children).includes(label))[0] as unknown as TestNode;
}

describe("Settings replacement restore hookup", () => {
  it("confirms through the real dialog and schedules the prepared token", async () => {
    const tree = renderSettings();
    mockPrepare.mockResolvedValue(ready);
    await act(async () => { action(tree, "Restore from backup").props.onPress(); });
    const choose = tree.root.findByProps({ accessibilityLabel: "Choose backup for replacement restore" });
    await act(async () => { choose.props.onPress(); });
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    await flush();
    await act(async () => { tree.root.findByProps({ accessibilityLabel: "Schedule replacement restore" }).props.onPress(); });
    expect(mockSchedule).toHaveBeenCalledWith(expect.objectContaining({ token: "prepared-token" }));
    expect(mockLegacyImport).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalledWith(expect.stringContaining("restored"), expect.anything(), expect.anything());
    expect(tree.root.findAll((node: TestNode) => textContent(node.props.children).includes("Restore is scheduled"))).not.toHaveLength(0);
    await act(async () => { tree.unmount(); });
  });

  it("disables unavailable restore without opening the dialog and leaves export available", async () => {
    mockAvailability.mockReturnValue({ available: false, reason: "unsupported_platform" });
    const tree = renderSettings();
    const restoreAction = action(tree, "Restore from backup");
    expect(restoreAction.props.disabled).toBe(true);
    await act(async () => { restoreAction.props.onPress(); });
    expect(tree.root.findAllByProps({ accessibilityLabel: "Choose backup for replacement restore" })).toHaveLength(0);
    expect(mockPrepare).not.toHaveBeenCalled();
    await act(async () => { action(tree, "Export backup").props.onPress(); });
    expect(mockExportBackup).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });

  it("serializes an active export and an open restore dialog", async () => {
    for (const [label, exportMock] of [["Export backup", mockExportBackup], ["Export CSV", mockExportCsv]] as const) {
      const pendingExport = deferred<{ uri: string; method: "android_saf" }>();
      exportMock.mockReturnValue(pendingExport.promise);
      const tree = renderSettings();
      const exportAction = action(tree, label);
      const restoreAction = action(tree, "Restore from backup");
      await act(async () => {
        exportAction.props.onPress();
        restoreAction.props.onPress();
      });
      expect(tree.root.findAllByProps({ accessibilityLabel: "Choose backup for replacement restore" })).toHaveLength(0);
      expect(mockPrepare).not.toHaveBeenCalled();
      pendingExport.resolve({ uri: "export", method: "android_saf" });
      await flush();
      await act(async () => { tree.unmount(); });
    }
  });

  it("blocks captured backup and CSV handlers after restore opens", async () => {
    const tree = renderSettings();
    const restoreAction = action(tree, "Restore from backup");
    const backupAction = action(tree, "Export backup");
    const csvAction = action(tree, "Export CSV");
    await act(async () => {
      restoreAction.props.onPress();
      backupAction.props.onPress();
      csvAction.props.onPress();
    });
    expect(tree.root.findAllByProps({ accessibilityLabel: "Choose backup for replacement restore" })).not.toHaveLength(0);
    expect(mockExportBackup).not.toHaveBeenCalled();
    expect(mockExportCsv).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it("cancels through the real dialog, cleans the token, then allows both exports", async () => {
    mockPrepare.mockResolvedValue(ready);
    const tree = renderSettings();
    await act(async () => { action(tree, "Restore from backup").props.onPress(); });
    await act(async () => { tree.root.findByProps({ accessibilityLabel: "Choose backup for replacement restore" }).props.onPress(); });
    await flush();
    await act(async () => { tree.root.findByProps({ accessibilityLabel: "Dismiss restore confirmation" }).props.onPress(); });
    await flush();
    expect(mockDiscard).toHaveBeenCalledWith("prepared-token");
    await act(async () => { action(tree, "Export backup").props.onPress(); });
    await act(async () => { action(tree, "Export CSV").props.onPress(); });
    expect(mockExportBackup).toHaveBeenCalled();
    expect(mockExportCsv).toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});

describe("Settings preferences", () => {
  const pressLabel = (tree: ReturnType<typeof renderSettings>, label: string) =>
    tree.root.findAll((node: TestNode) => node.type === "Pressable" && node.props.accessibilityLabel === label)[0];

  it("applies a formula only when the sheet is confirmed", async () => {
    const tree = renderSettings();
    await act(async () => { pressLabel(tree, "Estimated 1RM formula, Epley").props.onPress(); });
    await act(async () => { pressLabel(tree, "Brzycki").props.onPress(); });
    await act(async () => { pressLabel(tree, "Cancel").props.onPress(); });
    expect(mockSetGlobalFormula).not.toHaveBeenCalled();

    await act(async () => { pressLabel(tree, "Estimated 1RM formula, Epley").props.onPress(); });
    await act(async () => { pressLabel(tree, "Wathan").props.onPress(); });
    await act(async () => { pressLabel(tree, "Use Wathan").props.onPress(); });
    expect(mockSetGlobalFormula).toHaveBeenCalledWith("wathan");
    expect(pressLabel(tree, "Estimated 1RM formula, Wathan")).toBeDefined();
    await act(async () => { tree.unmount(); });
  });

  it("changes display mode and weight unit inline", async () => {
    const tree = renderSettings();
    await act(async () => { pressLabel(tree, "Dark").props.onPress(); });
    await act(async () => { pressLabel(tree, "lb").props.onPress(); });
    expect(mockSetThemePreference).toHaveBeenCalledWith("dark");
    expect(mockSetUnit).toHaveBeenCalledWith("lb");
    expect(tree.root.findAll((node: TestNode) => node.type === "Text" && textContent(node.props.children) === "Version 1.0.0")).toHaveLength(1);
    await act(async () => { tree.unmount(); });
  });
});
