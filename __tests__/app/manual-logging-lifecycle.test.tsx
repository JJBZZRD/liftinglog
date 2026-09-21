import React from "react";
import renderer, { act } from "react-test-renderer";

const mockAddSet = jest.fn();
const mockAddWorkoutExercise = jest.fn();
const mockGetOpenWorkoutExercise = jest.fn();
const mockListSetsForWorkoutExercise = jest.fn();
const mockUpdateExerciseEntryDate = jest.fn();
const mockGetProgrammedExercisesForExerciseOnDate = jest.fn();
const mockPersistProgramSetToWorkoutHistory = jest.fn();
const mockAppCapabilities = {
  programsExperience: "enabled" as "enabled" | "coming-soon",
  healthMetrics: true,
  videoRecording: true,
  thirdPartyImport: true,
  multipleWorkoutSessions: true,
};
const mockParams = { id: "1", name: "Midnight Bench" };
type TestNode = {
  props: Record<string, unknown>;
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[];
};

jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: "Icon" }));
jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  FlatList: "FlatList",
  Keyboard: { dismiss: jest.fn() },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    router: { back: jest.fn(), push: jest.fn() },
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
    useLocalSearchParams: () => mockParams,
  };
});
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: "AnimatedView" },
  useAnimatedStyle: (value: unknown) => value,
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown) => value,
}));
jest.mock("../../components/lists/SetItem", () => "SetItem");
jest.mock("../../components/modals/BaseModal", () => "AppModal");
jest.mock("../../components/modals/DatePickerModal", () => "DatePickerModal");
jest.mock("../../components/modals/EditSetModal", () => "EditSetModal");
jest.mock("../../components/TimerModal", () => "TimerModal");
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({ useUnitPreference: () => ({ unitPreference: "kg" }) }));
jest.mock("../../lib/config/releaseProfile", () => ({ appCapabilities: mockAppCapabilities }));
jest.mock("../../lib/theme/ThemeContext", () => ({ useTheme: () => ({ rawColors: new Proxy({}, { get: () => "#000" }) }) }));
jest.mock("../../lib/db/exercises", () => ({ getLastRestSeconds: jest.fn().mockResolvedValue(null), setLastRestSeconds: jest.fn() }));
jest.mock("../../lib/db/media", () => ({ listMediaForSet: jest.fn().mockResolvedValue([]), listMediaForSetIds: jest.fn().mockResolvedValue([]) }));
jest.mock("../../lib/db/programCalendar", () => ({
  deleteUserSet: jest.fn(), getCalendarSetById: jest.fn(), getCalendarSetByWorkoutSetId: jest.fn(),
  getProgrammedExercisesForExerciseOnDate: mockGetProgrammedExercisesForExerciseOnDate, listCalendarSetsByWorkoutSetIds: jest.fn().mockResolvedValue([]),
  resolveWorkoutExerciseIdForCalendarExercise: jest.fn(), syncStatusesForCalendarExercise: jest.fn(), updateSetActuals: jest.fn(),
}));
jest.mock("../../lib/db/workouts", () => ({
  addSet: mockAddSet,
  addWorkoutExercise: mockAddWorkoutExercise,
  completeExerciseEntry: jest.fn(), deleteSet: jest.fn(), deleteSetsForWorkoutExercise: jest.fn(),
  getOpenWorkoutExercise: mockGetOpenWorkoutExercise, getOrCreateActiveWorkout: jest.fn().mockResolvedValue(10),
  getWorkoutExerciseById: jest.fn().mockResolvedValue({ id: 20, note: null, currentWeight: null, currentReps: null }),
  listSetsForWorkoutExercise: mockListSetsForWorkoutExercise, updateExerciseEntryDate: mockUpdateExerciseEntryDate, updateSet: jest.fn(),
  updateWorkoutExerciseInputs: jest.fn(), updateWorkoutExerciseNote: jest.fn(),
}));
jest.mock("../../lib/programs/programExerciseHistory", () => ({ ensureProgramExerciseWorkoutSession: jest.fn(), persistCompletedProgramExercise: jest.fn(), persistProgramSetToWorkoutHistory: mockPersistProgramSetToWorkoutHistory }));
jest.mock("../../lib/programs/psl/pslMapper", () => ({ getIntensityDefaultValue: jest.fn(), getIntensityUnit: jest.fn() }));
jest.mock("../../lib/programs/psl/programRuntime", () => ({ refreshUpcomingCalendarForProgram: jest.fn() }));
jest.mock("../../lib/timerStore", () => ({ timerStore: { deleteTimer: jest.fn(), createTimer: jest.fn(), updateTimer: jest.fn(), subscribe: jest.fn(() => jest.fn()) } }));
jest.mock("../../lib/utils/formatters", () => ({ formatRelativeDate: jest.fn(() => "Today"), formatTime: jest.fn(), parseTimerDurationSeconds: jest.fn() }));
jest.mock("../../lib/utils/mediaCleanup", () => ({ deleteAssociatedMediaForSets: jest.fn() }));
jest.mock("../../lib/utils/units", () => ({
  formatEditableWeightFromKg: (value: number) => String(value), formatWeightFromKg: (value: number) => String(value),
  getWeightUnitLabel: () => "kg", parseWeightInputToKg: (value: string) => Number(value),
}));

const UnifiedRecordTab = require("../../components/exercise/UnifiedRecordTab").default;

describe("manual logging date lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppCapabilities.programsExperience = "enabled";
    mockAppCapabilities.videoRecording = true;
    Object.assign(mockParams, { id: "1", name: "Midnight Bench" });
    delete (mockParams as Record<string, string | undefined>).programExerciseId;
    delete (mockParams as Record<string, string | undefined>).plannedDate;
    delete (mockParams as Record<string, string | undefined>).dateIso;
    mockAddWorkoutExercise.mockResolvedValue(20);
    mockAddSet.mockResolvedValue(30);
    mockGetOpenWorkoutExercise.mockResolvedValue(null);
    mockListSetsForWorkoutExercise.mockResolvedValue([]);
    mockGetProgrammedExercisesForExerciseOnDate.mockResolvedValue([]);
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-20T23:59:00"));
  });

  afterEach(() => jest.useRealTimers());

  it("keeps the original selected date when adding a set after midnight", async () => {
    let tree: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = renderer.create(<UnifiedRecordTab />);
    });

    jest.setSystemTime(new Date("2026-09-21T00:01:00"));
    const inputs = tree!.root.findAllByType(require("react-native").TextInput);
    await act(async () => {
      inputs[0].props.onChangeText("100");
      inputs[1].props.onChangeText("5");
    });
    const addSetButton = (tree!.root as unknown as { findAllByType: (type: string) => TestNode[] })
      .findAllByType("Pressable")
      .find((node) => node.findAll((child) => child.props.children === "Add Set").length > 0);
    await act(async () => {
      await (addSetButton?.props.onPress as undefined | (() => Promise<void>))?.();
    });

    expect(mockAddSet).toHaveBeenCalledWith(
      expect.objectContaining({ performed_at: new Date("2026-09-20T12:00:00").getTime() })
    );
    await act(async () => {
      tree!.unmount();
    });
  });

  it("keeps an already in-progress entry on its stored date after reopening past midnight", async () => {
    const originalPerformedAt = new Date("2026-09-20T12:00:00").getTime();
    mockGetOpenWorkoutExercise.mockResolvedValue({
      id: 20,
      note: null,
      currentWeight: 100,
      currentReps: 5,
      performedAt: originalPerformedAt,
    });
    mockListSetsForWorkoutExercise.mockResolvedValue([
      { id: 21, note: null, weightKg: 100, reps: 5, performedAt: originalPerformedAt },
    ]);
    jest.setSystemTime(new Date("2026-09-21T00:01:00"));

    let tree: ReturnType<typeof renderer.create>;
    try {
      await act(async () => {
        tree = renderer.create(<UnifiedRecordTab />);
      });
      const inputs = tree!.root.findAllByType(require("react-native").TextInput);
      await act(async () => {
        inputs[0].props.onChangeText("102.5");
        inputs[1].props.onChangeText("4");
      });
      const addSetButton = (tree!.root as unknown as { findAllByType: (type: string) => TestNode[] })
        .findAllByType("Pressable")
        .find((node) => node.findAll((child) => child.props.children === "Add Set").length > 0);
      await act(async () => {
        await (addSetButton?.props.onPress as undefined | (() => Promise<void>))?.();
      });

      expect(mockAddSet).toHaveBeenCalledWith(
        expect.objectContaining({ performed_at: originalPerformedAt })
      );
    } finally {
      await act(async () => {
        tree!.unmount();
      });
    }
  });

  it("keeps an explicit date picker selection after resuming an entry", async () => {
    const originalPerformedAt = new Date("2026-09-20T12:00:00").getTime();
    const selectedPerformedAt = new Date("2026-09-19T12:00:00").getTime();
    mockGetOpenWorkoutExercise.mockResolvedValue({
      id: 20,
      note: null,
      currentWeight: 100,
      currentReps: 5,
      performedAt: originalPerformedAt,
    });
    mockListSetsForWorkoutExercise.mockResolvedValue([
      { id: 21, note: null, weightKg: 100, reps: 5, performedAt: originalPerformedAt },
    ]);
    jest.setSystemTime(new Date("2026-09-21T00:01:00"));

    let tree: ReturnType<typeof renderer.create>;
    try {
      await act(async () => {
        tree = renderer.create(<UnifiedRecordTab />);
      });

      const datePicker = tree!.root.findByType("DatePickerModal");
      await act(async () => {
        await datePicker.props.onChange(new Date("2026-09-19T08:30:00"));
      });

      expect(mockUpdateExerciseEntryDate).toHaveBeenCalledWith(20, selectedPerformedAt);

      const inputs = tree!.root.findAllByType(require("react-native").TextInput);
      await act(async () => {
        inputs[0].props.onChangeText("102.5");
        inputs[1].props.onChangeText("4");
      });
      const addSetButton = (tree!.root as unknown as { findAllByType: (type: string) => TestNode[] })
        .findAllByType("Pressable")
        .find((node) => node.findAll((child) => child.props.children === "Add Set").length > 0);
      await act(async () => {
        await (addSetButton?.props.onPress as undefined | (() => Promise<void>))?.();
      });

      expect(mockAddSet).toHaveBeenCalledWith(
        expect.objectContaining({ performed_at: selectedPerformedAt })
      );
    } finally {
      await act(async () => {
        tree!.unmount();
      });
    }
  });

  it("keeps the MVP manual route out of program hydration and hides video recording", async () => {
    mockAppCapabilities.programsExperience = "coming-soon";
    mockAppCapabilities.videoRecording = false;
    Object.assign(mockParams, {
      programExerciseId: "999",
      plannedDate: String(new Date("2026-09-18T12:00:00").getTime()),
      dateIso: "2026-09-18",
    });
    mockGetProgrammedExercisesForExerciseOnDate.mockResolvedValue([
      { calendarExercise: { id: 999, status: "pending" }, sets: [] },
    ]);

    let tree: ReturnType<typeof renderer.create>;
    try {
      await act(async () => {
        tree = renderer.create(<UnifiedRecordTab />);
      });

      expect(mockGetProgrammedExercisesForExerciseOnDate).not.toHaveBeenCalled();
      expect(mockPersistProgramSetToWorkoutHistory).not.toHaveBeenCalled();
      const buttons = (tree!.root as unknown as { findAllByType: (type: string) => TestNode[] })
        .findAllByType("Pressable");
      expect(buttons.some((node) => node.props.accessibilityLabel === "Record video")).toBe(false);

      const datePicker = tree!.root.findByType("DatePickerModal");
      await act(async () => {
        await datePicker.props.onChange(new Date("2026-09-19T08:30:00"));
      });
      expect(mockUpdateExerciseEntryDate).toHaveBeenCalledWith(
        20,
        new Date("2026-09-19T12:00:00").getTime()
      );
      expect(mockGetProgrammedExercisesForExerciseOnDate).not.toHaveBeenCalled();

      const inputs = tree!.root.findAllByType(require("react-native").TextInput);
      await act(async () => {
        inputs[0].props.onChangeText("100");
        inputs[1].props.onChangeText("5");
      });
      const addSetButton = buttons.find((node) =>
        node.findAll((child) => child.props.children === "Add Set").length > 0
      );
      await act(async () => {
        await (addSetButton?.props.onPress as undefined | (() => Promise<void>))?.();
      });

      expect(mockAddSet).toHaveBeenCalled();
      expect(mockGetProgrammedExercisesForExerciseOnDate).not.toHaveBeenCalled();
      expect(mockPersistProgramSetToWorkoutHistory).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        tree!.unmount();
      });
    }
  });

  it("retains program lookup and the record-video control in the full profile", async () => {
    Object.assign(mockParams, {
      programExerciseId: "999",
      dateIso: "2026-09-18",
    });
    mockGetProgrammedExercisesForExerciseOnDate.mockResolvedValue([
      {
        calendar: { programId: 1, sessionName: "Day 1" },
        calendarExercise: { id: 999, status: "pending", exerciseName: "Midnight Bench" },
        programName: "Full Program",
        sets: [],
      },
    ]);

    let tree: ReturnType<typeof renderer.create>;
    try {
      await act(async () => {
        tree = renderer.create(<UnifiedRecordTab />);
      });

      expect(mockGetProgrammedExercisesForExerciseOnDate).toHaveBeenCalledWith(
        expect.objectContaining({ dateIso: "2026-09-18", exerciseId: 1 })
      );
      expect(
        tree!.root.findAll((node: TestNode) => node.props.children === "Programmed Sets")
      ).toHaveLength(1);
      const buttons = (tree!.root as unknown as { findAllByType: (type: string) => TestNode[] })
        .findAllByType("Pressable");
      expect(buttons.some((node) => node.props.accessibilityLabel === "Record video")).toBe(true);
    } finally {
      await act(async () => {
        tree!.unmount();
      });
    }
  });
});
