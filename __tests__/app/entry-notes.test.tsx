import renderer, { act } from "react-test-renderer";

const mockUpdateWorkoutExerciseNote = jest.fn();
const mockCompleteExerciseEntry = jest.fn();
const mockGetOpenWorkoutExercise = jest.fn();
const mockListSetsForWorkoutExercise = jest.fn();
const mockGetWorkoutExerciseById = jest.fn();
const mockGetProgrammedExercisesForExerciseOnDate = jest.fn();
const mockResolveWorkoutExerciseIdForCalendarExercise = jest.fn();
const mockEnsureProgramExerciseWorkoutSession = jest.fn();
const mockAppCapabilities = {
  programsExperience: "coming-soon" as "enabled" | "coming-soon",
  healthMetrics: false,
  videoRecording: false,
  thirdPartyImport: false,
  multipleWorkoutSessions: false,
};
const mockParams = { id: "1", name: "Bench Press" };

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
    useFocusEffect: (callback: () => void | (() => void)) =>
      React.useEffect(callback, [callback]),
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
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "kg" }),
}));
jest.mock("../../lib/config/releaseProfile", () => ({
  appCapabilities: mockAppCapabilities,
}));
jest.mock("../../lib/theme/ThemeContext", () => ({
  useTheme: () => ({ rawColors: new Proxy({}, { get: () => "#000" }) }),
}));
jest.mock("../../lib/db/exercises", () => ({
  getLastRestSeconds: jest.fn().mockResolvedValue(null),
  setLastRestSeconds: jest.fn(),
}));
jest.mock("../../lib/db/media", () => ({
  listMediaForSet: jest.fn().mockResolvedValue([]),
  listMediaForSetIds: jest.fn().mockResolvedValue([]),
}));
jest.mock("../../lib/db/programCalendar", () => ({
  deleteUserSet: jest.fn(), getCalendarSetById: jest.fn(),
  getCalendarSetByWorkoutSetId: jest.fn(), getProgrammedExercisesForExerciseOnDate: mockGetProgrammedExercisesForExerciseOnDate,
  listCalendarSetsByWorkoutSetIds: jest.fn().mockResolvedValue([]),
  resolveWorkoutExerciseIdForCalendarExercise: mockResolveWorkoutExerciseIdForCalendarExercise, syncStatusesForCalendarExercise: jest.fn(),
  updateSetActuals: jest.fn(),
}));
jest.mock("../../lib/db/workouts", () => ({
  addSet: jest.fn(), addWorkoutExercise: jest.fn().mockResolvedValue(20),
  completeExerciseEntry: mockCompleteExerciseEntry, deleteSet: jest.fn(), deleteSetsForWorkoutExercise: jest.fn(),
  getOpenWorkoutExercise: mockGetOpenWorkoutExercise,
  getOrCreateActiveWorkout: jest.fn().mockResolvedValue(10),
  getWorkoutExerciseById: mockGetWorkoutExerciseById,
  listSetsForWorkoutExercise: mockListSetsForWorkoutExercise,
  updateExerciseEntryDate: jest.fn(), updateSet: jest.fn(), updateWorkoutExerciseInputs: jest.fn(),
  updateWorkoutExerciseNote: mockUpdateWorkoutExerciseNote,
}));
jest.mock("../../lib/programs/programExerciseHistory", () => ({
  ensureProgramExerciseWorkoutSession: mockEnsureProgramExerciseWorkoutSession, persistCompletedProgramExercise: jest.fn(),
  persistProgramSetToWorkoutHistory: jest.fn(),
}));
jest.mock("../../lib/programs/psl/pslMapper", () => ({
  getIntensityDefaultValue: jest.fn(), getIntensityUnit: jest.fn(),
}));
jest.mock("../../lib/programs/psl/programRuntime", () => ({ refreshUpcomingCalendarForProgram: jest.fn() }));
jest.mock("../../lib/timerStore", () => ({ timerStore: { deleteTimer: jest.fn(), createTimer: jest.fn(), updateTimer: jest.fn(), subscribe: jest.fn(() => jest.fn()) } }));
jest.mock("../../lib/utils/formatters", () => ({ formatRelativeDate: jest.fn(() => "Today"), formatTime: jest.fn(), parseTimerDurationSeconds: jest.fn() }));
jest.mock("../../lib/utils/mediaCleanup", () => ({ deleteAssociatedMediaForSets: jest.fn() }));
jest.mock("../../lib/utils/units", () => ({
  formatEditableWeightFromKg: (value: number) => String(value), formatWeightFromKg: (value: number) => String(value),
  getWeightUnitLabel: () => "kg", parseWeightInputToKg: (value: string) => Number(value),
}));

const UnifiedRecordTab = require("../../components/exercise/UnifiedRecordTab").default;

function sessionNoteInput(tree: ReturnType<typeof renderer.create>) {
  return tree.root
    .findAllByType(require("react-native").TextInput)
    .find((node: TestNode) => node.props.accessibilityLabel === "Exercise note")!;
}

function completeButton(tree: ReturnType<typeof renderer.create>) {
  return (tree.root as unknown as { findAllByType: (type: string) => TestNode[] })
    .findAllByType("Pressable")
    .find((node) => node.findAll((child) => child.props.children === "Complete Exercise").length > 0)!;
}

async function renderRecordTab() {
  let tree: ReturnType<typeof renderer.create>;
  await act(async () => {
    tree = renderer.create(<UnifiedRecordTab />);
  });
  return tree!;
}

describe("exercise-entry note lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppCapabilities.programsExperience = "coming-soon";
    delete (mockParams as Record<string, string | undefined>).weId;
    delete (mockParams as Record<string, string | undefined>).programExerciseId;
    delete (mockParams as Record<string, string | undefined>).dateIso;
    mockGetOpenWorkoutExercise.mockResolvedValue({
      id: 20, workoutId: 10, note: null, currentWeight: null, currentReps: null,
    });
    mockListSetsForWorkoutExercise.mockResolvedValue([]);
    mockGetProgrammedExercisesForExerciseOnDate.mockResolvedValue([]);
    mockResolveWorkoutExerciseIdForCalendarExercise.mockResolvedValue(null);
    mockGetWorkoutExerciseById.mockImplementation((id: number) =>
      Promise.resolve({ id, workoutId: 10, note: null, currentWeight: null, currentReps: null })
    );
    mockUpdateWorkoutExerciseNote.mockResolvedValue(undefined);
    mockCompleteExerciseEntry.mockResolvedValue(undefined);
  });

  it("serializes a newer draft after an older deferred write instead of letting the older write win", async () => {
    const writes: Array<{ note: string | null; resolve: () => void }> = [];
    mockUpdateWorkoutExerciseNote.mockImplementation((_id: number, note: string | null) =>
      new Promise<void>((resolve) => writes.push({ note, resolve }))
    );
    const tree = await renderRecordTab();
    const input = sessionNoteInput(tree);

    await act(async () => {
      input.props.onChangeText("first draft");
      input.props.onBlur();
    });
    await act(async () => {
      input.props.onChangeText("newer draft");
      input.props.onBlur();
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].note).toBe("first draft");

    await act(async () => {
      writes[0].resolve();
    });
    expect(writes).toHaveLength(2);
    expect(writes[1].note).toBe("newer draft");

    await act(async () => {
      writes[1].resolve();
      await Promise.resolve();
    });
    await act(async () => tree.unmount());
  });

  it("trims entry notes and persists an empty edit as null", async () => {
    const tree = await renderRecordTab();
    const input = sessionNoteInput(tree);

    await act(async () => {
      input.props.onChangeText("  first note  ");
      input.props.onBlur();
      await Promise.resolve();
    });
    await act(async () => {
      input.props.onChangeText("  edited note  ");
      input.props.onBlur();
      await Promise.resolve();
    });
    await act(async () => {
      input.props.onChangeText("   ");
      input.props.onBlur();
      await Promise.resolve();
    });

    expect(mockUpdateWorkoutExerciseNote).toHaveBeenNthCalledWith(1, 20, "first note");
    expect(mockUpdateWorkoutExerciseNote).toHaveBeenNthCalledWith(2, 20, "edited note");
    expect(mockUpdateWorkoutExerciseNote).toHaveBeenNthCalledWith(3, 20, null);
    await act(async () => tree.unmount());
  });

  it("creates at most one entry when concurrent flushes begin before an entry exists", async () => {
    const writes: Array<{ resolve: () => void }> = [];
    mockGetOpenWorkoutExercise.mockResolvedValue(null);
    mockUpdateWorkoutExerciseNote.mockImplementation(() =>
      new Promise<void>((resolve) => writes.push({ resolve }))
    );
    const tree = await renderRecordTab();
    const input = sessionNoteInput(tree);

    await act(async () => {
      input.props.onChangeText("draft");
      input.props.onBlur();
      input.props.onBlur();
      await Promise.resolve();
    });

    expect(require("../../lib/db/workouts").addWorkoutExercise).toHaveBeenCalledTimes(1);
    await act(async () => {
      writes[0].resolve();
      await Promise.resolve();
    });
    await act(async () => tree.unmount());
  });

  it("keeps pending writes attached to their original entry when the route changes", async () => {
    const writes: Array<{ id: number; note: string | null; resolve: () => void }> = [];
    mockUpdateWorkoutExerciseNote.mockImplementation((id: number, note: string | null) =>
      new Promise<void>((resolve) => writes.push({ id, note, resolve }))
    );
    const tree = await renderRecordTab();
    const input = sessionNoteInput(tree);

    await act(async () => {
      input.props.onChangeText("entry twenty");
      input.props.onBlur();
      await Promise.resolve();
    });
    Object.assign(mockParams, { weId: "30" });
    await act(async () => {
      tree.update(<UnifiedRecordTab />);
      await Promise.resolve();
    });
    const nextInput = sessionNoteInput(tree);
    await act(async () => {
      nextInput.props.onChangeText("entry thirty");
      nextInput.props.onBlur();
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(expect.objectContaining({ id: 20, note: "entry twenty" }));
    await act(async () => {
      writes[0].resolve();
      await Promise.resolve();
    });
    expect(writes[1]).toEqual(expect.objectContaining({ id: 30, note: "entry thirty" }));
    await act(async () => {
      writes[1].resolve();
      await Promise.resolve();
      tree.unmount();
    });
    delete (mockParams as Record<string, string | undefined>).weId;
  });

  it("keeps a failed draft visible, offers retry, and prevents completion from claiming success", async () => {
    mockListSetsForWorkoutExercise.mockResolvedValue([
      { id: 30, note: null, weightKg: 100, reps: 5, performedAt: Date.now() },
    ]);
    mockUpdateWorkoutExerciseNote
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const tree = await renderRecordTab();
    const input = sessionNoteInput(tree);

    await act(async () => {
      input.props.onChangeText("keep me");
      await (completeButton(tree).props.onPress as () => Promise<void>)();
    });

    expect(mockCompleteExerciseEntry).not.toHaveBeenCalled();
    expect(
      tree.root.findAll((node: TestNode) => node.props.children === "Retry save")
    ).toHaveLength(1);
    const retry = (tree.root as unknown as { findAllByType: (type: string) => TestNode[] })
      .findAllByType("Pressable")
      .find((node) => node.props.accessibilityLabel === "Retry saving exercise note")!;
    await act(async () => {
      (retry.props.onPress as () => void)();
      await Promise.resolve();
    });

    expect(mockUpdateWorkoutExerciseNote).toHaveBeenLastCalledWith(20, "keep me");
    await act(async () => tree.unmount());
  });

  it("waits for the latest note write before completing the current entry", async () => {
    const writes: Array<{ resolve: () => void }> = [];
    mockListSetsForWorkoutExercise.mockResolvedValue([
      { id: 30, note: null, weightKg: 100, reps: 5, performedAt: Date.now() },
    ]);
    mockUpdateWorkoutExerciseNote.mockImplementation(() =>
      new Promise<void>((resolve) => writes.push({ resolve }))
    );
    const tree = await renderRecordTab();
    const input = sessionNoteInput(tree);
    let completion: Promise<void>;

    await act(async () => {
      input.props.onChangeText("finish with this");
      completion = (completeButton(tree).props.onPress as () => Promise<void>)();
      await Promise.resolve();
    });

    expect(mockCompleteExerciseEntry).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
    await act(async () => {
      writes[0].resolve();
      await completion!;
    });

    expect(mockUpdateWorkoutExerciseNote).toHaveBeenCalledWith(20, "finish with this");
    expect(mockCompleteExerciseEntry).toHaveBeenCalledWith(20, expect.any(Number));
    await act(async () => tree.unmount());
  });

  it("persists a draft typed during a pending completion write before closing", async () => {
    const writes: Array<{ note: string | null; resolve: () => void }> = [];
    mockListSetsForWorkoutExercise.mockResolvedValue([
      { id: 30, note: null, weightKg: 100, reps: 5, performedAt: Date.now() },
    ]);
    mockUpdateWorkoutExerciseNote.mockImplementation((_id: number, note: string | null) =>
      new Promise<void>((resolve) => writes.push({ note, resolve }))
    );
    const tree = await renderRecordTab();
    const input = sessionNoteInput(tree);
    let completion: Promise<void>;

    await act(async () => {
      input.props.onChangeText("note A");
      completion = (completeButton(tree).props.onPress as () => Promise<void>)();
      await Promise.resolve();
    });
    expect(writes).toHaveLength(1);
    await act(async () => {
      input.props.onChangeText("note B");
      writes[0].resolve();
      await Promise.resolve();
    });

    expect(mockCompleteExerciseEntry).not.toHaveBeenCalled();
    expect(writes).toHaveLength(2);
    expect(writes[1].note).toBe("note B");
    await act(async () => {
      writes[1].resolve();
      await completion!;
    });

    expect(mockCompleteExerciseEntry).toHaveBeenCalledWith(20, expect.any(Number));
    await act(async () => tree.unmount());
  });

  it("skips an older queued snapshot after a newer unblurred draft is saved", async () => {
    const writes: Array<{ note: string | null; resolve: () => void }> = [];
    mockUpdateWorkoutExerciseNote.mockImplementation((_id: number, note: string | null) =>
      new Promise<void>((resolve) => writes.push({ note, resolve }))
    );
    const tree = await renderRecordTab();
    const input = sessionNoteInput(tree);

    await act(async () => {
      input.props.onChangeText("note A");
      input.props.onBlur();
      await Promise.resolve();
      input.props.onChangeText("note B");
      input.props.onBlur();
      input.props.onChangeText("note C");
      writes[0].resolve();
      await Promise.resolve();
    });

    expect(writes).toHaveLength(2);
    expect(writes[1].note).toBe("note C");
    await act(async () => {
      writes[1].resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(writes).toHaveLength(2);
    await act(async () => tree.unmount());
  });

  it("does not let an old queued snapshot overwrite a newer old-context save after navigation", async () => {
    let persistedNote: string | null = null;
    const writes: Array<{ note: string | null; resolve: () => void }> = [];
    mockUpdateWorkoutExerciseNote.mockImplementation((_id: number, note: string | null) =>
      new Promise<void>((resolve) =>
        writes.push({
          note,
          resolve: () => {
            persistedNote = note;
            resolve();
          },
        })
      )
    );
    const tree = await renderRecordTab();
    const input = sessionNoteInput(tree);

    await act(async () => {
      input.props.onChangeText("note A");
      input.props.onBlur();
      await Promise.resolve();
      input.props.onChangeText("note B");
      input.props.onBlur();
      input.props.onChangeText("note C");
      writes[0].resolve();
      await Promise.resolve();
    });
    expect(writes[1].note).toBe("note C");

    Object.assign(mockParams, { weId: "30" });
    await act(async () => {
      tree.update(<UnifiedRecordTab />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      writes[1].resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    if (writes[2]) {
      await act(async () => {
        writes[2].resolve();
        await Promise.resolve();
      });
    }
    expect(writes).toHaveLength(2);
    expect(persistedNote).toBe("note C");
    await act(async () => tree.unmount());
  });

  it("reuses one created entry for queued no-entry note flushes", async () => {
    let resolveFirstCreation: (session: {
      workoutId: number;
      workoutExerciseId: number;
      exerciseId: number;
    }) => void;
    mockAppCapabilities.programsExperience = "enabled";
    Object.assign(mockParams, { programExerciseId: "900", dateIso: "2026-09-20" });
    mockGetProgrammedExercisesForExerciseOnDate.mockResolvedValue([
      {
        calendar: { programId: 1, sessionName: "Day 1" },
        calendarExercise: { id: 900, status: "pending", exerciseName: "Bench Press" },
        programName: "Program",
        sets: [],
      },
    ]);
    mockEnsureProgramExerciseWorkoutSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstCreation = resolve;
        })
    );
    const tree = await renderRecordTab();
    const input = sessionNoteInput(tree);
    await act(async () => {
      input.props.onChangeText("first");
      input.props.onBlur();
      await Promise.resolve();
      input.props.onChangeText("second");
      input.props.onBlur();
      resolveFirstCreation!({ workoutId: 10, workoutExerciseId: 20, exerciseId: 1 });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockEnsureProgramExerciseWorkoutSession).toHaveBeenCalledTimes(1);
    expect(mockUpdateWorkoutExerciseNote).toHaveBeenNthCalledWith(1, 20, "first");
    expect(mockUpdateWorkoutExerciseNote).toHaveBeenLastCalledWith(20, "second");
    await act(async () => tree.unmount());
  });

  it("does not let a stale created entry consume the next route's note draft", async () => {
    let resolveOldProgramEntry: (session: {
      workoutId: number;
      workoutExerciseId: number;
      exerciseId: number;
    }) => void;
    mockAppCapabilities.programsExperience = "enabled";
    Object.assign(mockParams, { programExerciseId: "900", dateIso: "2026-09-20" });
    mockGetProgrammedExercisesForExerciseOnDate.mockResolvedValue([
      {
        calendar: { programId: 1, sessionName: "Day 1" },
        calendarExercise: { id: 900, status: "pending", exerciseName: "Bench Press" },
        programName: "Program",
        sets: [],
      },
    ]);
    mockEnsureProgramExerciseWorkoutSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOldProgramEntry = resolve;
        })
    );
    const tree = await renderRecordTab();
    const oldInput = sessionNoteInput(tree);
    await act(async () => {
      oldInput.props.onChangeText("entry twenty");
      oldInput.props.onBlur();
      await Promise.resolve();
    });

    mockAppCapabilities.programsExperience = "coming-soon";
    delete (mockParams as Record<string, string | undefined>).programExerciseId;
    delete (mockParams as Record<string, string | undefined>).dateIso;
    Object.assign(mockParams, { weId: "30" });
    await act(async () => {
      tree.update(<UnifiedRecordTab />);
      await Promise.resolve();
    });
    const newInput = sessionNoteInput(tree);
    await act(async () => {
      newInput.props.onChangeText("entry thirty");
      newInput.props.onBlur();
      resolveOldProgramEntry!({ workoutId: 10, workoutExerciseId: 20, exerciseId: 1 });
      await Promise.resolve();
    });

    expect(mockUpdateWorkoutExerciseNote).toHaveBeenNthCalledWith(1, 20, "entry twenty");
    expect(mockUpdateWorkoutExerciseNote).toHaveBeenLastCalledWith(30, "entry thirty");
    await act(async () => tree.unmount());
  });

  it("blocks a pending completion when its entry is no longer the current route", async () => {
    let resolveWrite: () => void;
    let resolveNewRouteEntry: (entry: {
      id: number;
      workoutId: number;
      note: null;
      currentWeight: null;
      currentReps: null;
    }) => void;
    mockListSetsForWorkoutExercise.mockResolvedValue([
      { id: 30, note: null, weightKg: 100, reps: 5, performedAt: Date.now() },
    ]);
    mockUpdateWorkoutExerciseNote.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        })
    );
    const tree = await renderRecordTab();
    const input = sessionNoteInput(tree);
    let completion: Promise<void>;
    await act(async () => {
      input.props.onChangeText("entry twenty");
      completion = (completeButton(tree).props.onPress as () => Promise<void>)();
      await Promise.resolve();
    });

    Object.assign(mockParams, { weId: "30" });
    mockGetWorkoutExerciseById.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveNewRouteEntry = resolve;
        })
    );
    await act(async () => {
      tree.update(<UnifiedRecordTab />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      resolveWrite!();
      await completion!;
    });

    expect(mockCompleteExerciseEntry).not.toHaveBeenCalled();
    await act(async () => {
      resolveNewRouteEntry!({
        id: 30,
        workoutId: 10,
        note: null,
        currentWeight: null,
        currentReps: null,
      });
      await Promise.resolve();
    });
    await act(async () => tree.unmount());
  });
});
