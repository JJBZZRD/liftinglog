import React from "react";
import renderer, { act } from "react-test-renderer";

type RenderedTree = ReturnType<typeof renderer.create>;
type TestNode = { type: unknown; props: Record<string, unknown> };

let mockParams: Record<string, string> = { workoutExerciseId: "101", workoutId: "999" };
const mockGetWorkoutById = jest.fn();
const mockGetWorkoutExerciseById = jest.fn();
const mockListSetsForWorkoutExercise = jest.fn();
const mockListSetsForExercise = jest.fn();
const mockListWorkoutExercises = jest.fn();
const mockUpdateWorkoutNote = jest.fn();
const mockUpdateWorkoutExerciseNote = jest.fn();
const mockUpdateSet = jest.fn();
const mockUpdateWorkoutExercisePerformedAt = jest.fn();
const mockNavigationDispatch = jest.fn();
const mockUsePreventRemove = jest.fn();
const mockRouterBack = jest.fn();

jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: "Icon" }));
jest.mock("expo-router", () => {
  const MockReact = require("react");
  return {
    Stack: { Screen: ({ options }: { options?: { headerLeft?: () => React.ReactNode } }) => options?.headerLeft?.() ?? MockReact.createElement("StackScreen") },
    router: { back: mockRouterBack, canDismiss: jest.fn(() => false), dismiss: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
    useLocalSearchParams: () => mockParams,
    useNavigation: () => ({ dispatch: mockNavigationDispatch }),
  };
});
jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: mockUsePreventRemove }));
jest.mock("react-native", () => ({
  FlatList: ({ data, renderItem, ...props }: any) => {
    const MockReact = require("react");
    return MockReact.createElement(
      "FlatList",
      props,
      data.map((item: unknown, index: number) =>
        MockReact.createElement(MockReact.Fragment, { key: index }, renderItem({ item, index }))
      )
    );
  },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
jest.mock("../../components/lists/SetItem", () => {
  const MockReact = require("react");
  return (props: { rightActions?: React.ReactNode }) => MockReact.createElement("SetItem", props, props.rightActions);
});
jest.mock("../../components/modals/BaseModal", () => "BaseModal");
jest.mock("../../components/modals/DatePickerModal", () => "DatePickerModal");
jest.mock("../../components/modals/EditSetModal", () => "EditSetModal");
jest.mock("../../lib/contexts/UnitPreferenceContext", () => ({ useUnitPreference: () => ({ unitPreference: "kg" }) }));
jest.mock("../../lib/theme/ThemeContext", () => ({ useTheme: () => ({ rawColors: new Proxy({}, { get: () => "#000" }) }) }));
jest.mock("../../lib/utils/formatters", () => ({ formatRelativeDate: () => "Today" }));
jest.mock("../../lib/utils/units", () => ({
  formatWeightFromKg: (value: number | null) => String(value ?? 0),
  getWeightUnitLabel: () => "kg",
  parseWeightInputToKg: (value: string) => Number(value),
}));
jest.mock("../../lib/db/workouts", () => ({
  addSet: jest.fn(),
  addWorkoutExercise: jest.fn(),
  deleteSet: jest.fn(),
  getWorkoutById: mockGetWorkoutById,
  getWorkoutExerciseById: mockGetWorkoutExerciseById,
  listSetsForExercise: mockListSetsForExercise,
  listSetsForWorkoutExercise: mockListSetsForWorkoutExercise,
  listWorkoutExercises: mockListWorkoutExercises,
  updateSet: mockUpdateSet,
  updateWorkoutExerciseNote: mockUpdateWorkoutExerciseNote,
  updateWorkoutExercisePerformedAt: mockUpdateWorkoutExercisePerformedAt,
  updateWorkoutNote: mockUpdateWorkoutNote,
}));

const EditWorkoutScreen = require("../../app/edit-workout").default;

const completedEntry = {
  id: 101,
  workoutId: 11,
  exerciseId: 7,
  performedAt: 1_700_000_000_000,
  completedAt: 1_700_000_100_000,
  note: "entry note",
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const inputByLabel = (tree: RenderedTree, label: string) =>
  tree.root.findAll((node: TestNode) => node.type === "TextInput" && node.props.accessibilityLabel === label)[0];

const buttonByLabel = (tree: RenderedTree, label: string) =>
  tree.root.findAll((node: TestNode) => node.type === "Pressable" && node.props.accessibilityLabel === label)[0];

const textContent = (children: unknown): string =>
  Array.isArray(children)
    ? children.map(textContent).join("")
    : React.isValidElement(children)
      ? textContent((children as React.ReactElement<{ children?: unknown }>).props.children)
      : String(children ?? "");

const buttonByText = (tree: RenderedTree, text: string) =>
  tree.root.findAll((node: TestNode) =>
    node.type === "Pressable" && textContent(node.props.children) === text
  )[0];

const latestPreventRemoveCallback = () =>
  mockUsePreventRemove.mock.calls[mockUsePreventRemove.mock.calls.length - 1]?.[1] as
    | ((event: { data: { action: unknown } }) => void)
    | undefined;

const loadDirect = () => {
  mockGetWorkoutExerciseById.mockResolvedValue(completedEntry);
  mockGetWorkoutById.mockResolvedValue({ id: 11, note: "workout note", completedAt: 1_700_000_200_000 });
  mockListSetsForWorkoutExercise.mockResolvedValue([
    { id: 44, setIndex: 1, weightKg: 100, reps: 5, note: "set note", performedAt: 1_700_000_000_000 },
  ]);
};

describe("workout and entry note editor", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockParams = { workoutExerciseId: "101", workoutId: "999" };
    loadDirect();
    mockListSetsForExercise.mockResolvedValue([]);
    mockListWorkoutExercises.mockResolvedValue([]);
    mockUpdateWorkoutNote.mockResolvedValue(undefined);
    mockUpdateWorkoutExerciseNote.mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("loads canonical notes from a direct entry route and saves each level independently", async () => {
    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    await flush();

    expect(mockGetWorkoutById).toHaveBeenCalledWith(11);
    expect(inputByLabel(tree, "Workout note").props.value).toBe("workout note");
    expect(inputByLabel(tree, "Exercise entry note").props.value).toBe("entry note");
    expect(tree.root.findByType("SetItem").props.note).toBe("set note");

    await act(async () => { inputByLabel(tree, "Workout note").props.onChangeText("  edited workout  "); });
    await act(async () => { buttonByLabel(tree, "Save workout note").props.onPress(); });
    expect(mockUpdateWorkoutNote).toHaveBeenCalledWith(11, "edited workout");
    expect(mockUpdateWorkoutExerciseNote).not.toHaveBeenCalled();
    expect(mockUpdateSet).not.toHaveBeenCalled();
    expect(mockUpdateWorkoutExercisePerformedAt).not.toHaveBeenCalled();

    await act(async () => { inputByLabel(tree, "Exercise entry note").props.onChangeText("   "); });
    await act(async () => { buttonByLabel(tree, "Save exercise entry note").props.onPress(); });
    expect(mockUpdateWorkoutExerciseNote).toHaveBeenCalledWith(101, null);
    await act(async () => { tree.unmount(); });
  });

  it("cancels drafts without a write and retains a failed draft for retry", async () => {
    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    await flush();

    await act(async () => { inputByLabel(tree, "Workout note").props.onChangeText("discard me"); });
    await act(async () => { buttonByLabel(tree, "Cancel workout note").props.onPress(); });
    expect(inputByLabel(tree, "Workout note").props.value).toBe("workout note");
    expect(mockUpdateWorkoutNote).not.toHaveBeenCalled();

    mockUpdateWorkoutExerciseNote.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { inputByLabel(tree, "Exercise entry note").props.onChangeText("retry me"); });
    await act(async () => { await buttonByLabel(tree, "Save exercise entry note").props.onPress(); });
    expect(inputByLabel(tree, "Exercise entry note").props.value).toBe("retry me");
    expect(tree.root.findAll((node: TestNode) => node.type === "Text" && node.props.children === "Could not save exercise note. Please try again.")).toHaveLength(1);

    await act(async () => { await buttonByLabel(tree, "Save exercise entry note").props.onPress(); });
    expect(mockUpdateWorkoutExerciseNote).toHaveBeenLastCalledWith(101, "retry me");
    await act(async () => { tree.unmount(); });
  });

  it("does not expose an entry note for ambiguous legacy exercise routes, but keeps the workout note available", async () => {
    mockParams = { workoutId: "11", exerciseId: "7", exerciseName: "Bench Press" };
    mockGetWorkoutById.mockResolvedValue({ id: 11, note: "workout note" });
    mockListWorkoutExercises.mockResolvedValue([{ ...completedEntry, id: 101 }, { ...completedEntry, id: 102 }]);
    mockListSetsForWorkoutExercise.mockResolvedValue([]);

    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    await flush();

    expect(inputByLabel(tree, "Workout note").props.value).toBe("workout note");
    expect(tree.root.findAll((node: TestNode) => node.type === "TextInput" && node.props.accessibilityLabel === "Exercise entry note")).toHaveLength(0);
    await act(async () => { tree.unmount(); });
  });

  it("pins deferred loads and saves to their route so stale work cannot overwrite a new entry", async () => {
    const firstEntry = deferred<typeof completedEntry | null>();
    mockGetWorkoutExerciseById.mockImplementation((id: number) => id === 101 ? firstEntry.promise : Promise.resolve({ ...completedEntry, id: 202, workoutId: 22, note: "new entry" }));
    mockGetWorkoutById.mockImplementation((id: number) => Promise.resolve({ id, note: id === 22 ? "new workout" : "old workout" }));
    mockListSetsForWorkoutExercise.mockResolvedValue([]);

    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    expect(tree.root.findAll((node: TestNode) => node.type === "TextInput" && node.props.accessibilityLabel === "Workout note")).toHaveLength(0);

    mockParams = { workoutExerciseId: "202" };
    await act(async () => { tree.update(<EditWorkoutScreen />); });
    await flush();
    expect(inputByLabel(tree, "Workout note").props.value).toBe("new workout");

    await act(async () => { firstEntry.resolve(completedEntry); });
    await flush();
    expect(inputByLabel(tree, "Workout note").props.value).toBe("new workout");

    const pendingSave = deferred<void>();
    mockUpdateWorkoutNote.mockReturnValueOnce(pendingSave.promise);
    await act(async () => { inputByLabel(tree, "Workout note").props.onChangeText("new draft"); });
    await act(async () => {
      buttonByLabel(tree, "Save workout note").props.onPress();
      buttonByLabel(tree, "Save workout note").props.onPress();
    });
    expect(mockUpdateWorkoutNote).toHaveBeenCalledTimes(1);
    expect(mockUpdateWorkoutNote).toHaveBeenCalledWith(22, "new draft");
    await act(async () => { pendingSave.resolve(); });
    await flush();
    await act(async () => { tree.unmount(); });
  });

  it("keeps newer workout and exercise drafts when earlier deferred saves complete", async () => {
    const pendingWorkoutSave = deferred<void>();
    const pendingExerciseSave = deferred<void>();
    mockUpdateWorkoutNote.mockReturnValueOnce(pendingWorkoutSave.promise);
    mockUpdateWorkoutExerciseNote.mockReturnValueOnce(pendingExerciseSave.promise);

    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    await flush();

    await act(async () => { inputByLabel(tree, "Workout note").props.onChangeText("workout A"); });
    await act(async () => { buttonByLabel(tree, "Save workout note").props.onPress(); });
    await act(async () => { inputByLabel(tree, "Workout note").props.onChangeText("workout B"); });

    await act(async () => { inputByLabel(tree, "Exercise entry note").props.onChangeText("entry A"); });
    await act(async () => { buttonByLabel(tree, "Save exercise entry note").props.onPress(); });
    await act(async () => { inputByLabel(tree, "Exercise entry note").props.onChangeText("entry B"); });

    await act(async () => { pendingWorkoutSave.resolve(); pendingExerciseSave.resolve(); });
    await flush();

    expect(mockUpdateWorkoutNote).toHaveBeenLastCalledWith(11, "workout A");
    expect(mockUpdateWorkoutExerciseNote).toHaveBeenLastCalledWith(101, "entry A");
    expect(inputByLabel(tree, "Workout note").props.value).toBe("workout B");
    expect(inputByLabel(tree, "Exercise entry note").props.value).toBe("entry B");
    await act(async () => { tree.unmount(); });
  });

  it("shows a retryable friendly load failure without enabling note writes", async () => {
    mockGetWorkoutExerciseById.mockRejectedValueOnce(new Error("database unavailable"));
    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    await flush();

    expect(tree.root.findAll((node: TestNode) => node.type === "Text" && node.props.children === "Could not load workout details. Please try again.")).toHaveLength(1);
    expect(tree.root.findAll((node: TestNode) => node.type === "TextInput" && /note/i.test(String(node.props.accessibilityLabel ?? "")))).toHaveLength(0);
    expect(mockUpdateWorkoutNote).not.toHaveBeenCalled();

    await act(async () => { buttonByLabel(tree, "Retry loading workout details").props.onPress(); });
    await flush();
    expect(inputByLabel(tree, "Workout note").props.value).toBe("workout note");
    await act(async () => { tree.unmount(); });
  });

  it("keeps a failed note draft when close or Save Edits would otherwise navigate away", async () => {
    mockUpdateWorkoutNote.mockRejectedValueOnce(new Error("database unavailable"));
    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    await flush();

    await act(async () => { inputByLabel(tree, "Workout note").props.onChangeText("failed draft"); });
    await act(async () => { await buttonByLabel(tree, "Save workout note").props.onPress(); });
    expect(inputByLabel(tree, "Workout note").props.value).toBe("failed draft");

    await act(async () => { buttonByLabel(tree, "Go back").props.onPress(); });
    expect(tree.root.findAll((node: TestNode) => node.type === "BaseModal" && node.props.visible === true)).toHaveLength(1);
    await act(async () => { buttonByLabel(tree, "Keep editing notes").props.onPress(); });
    expect(inputByLabel(tree, "Workout note").props.value).toBe("failed draft");

    await act(async () => { buttonByLabel(tree, "Edit set 1").props.onPress(); });
    const editSetModal = tree.root.findByType("EditSetModal");
    await act(async () => {
      editSetModal.props.onSave({ weight_kg: 110, reps: 5, note: "set note", performed_at: 1_700_000_000_000 });
    });
    await act(async () => { buttonByText(tree, "Save Edits").props.onPress(); });
    expect(mockUpdateSet).not.toHaveBeenCalled();
    await act(async () => { buttonByLabel(tree, "Keep editing notes").props.onPress(); });
    expect(inputByLabel(tree, "Workout note").props.value).toBe("failed draft");
    await act(async () => { tree.unmount(); });
  });

  it.each(["workout", "exercise"] as const)("waits for a pending %s note save before closing", async (kind) => {
    const pendingSave = deferred<void>();
    const inputLabel = kind === "workout" ? "Workout note" : "Exercise entry note";
    const saveLabel = kind === "workout" ? "Save workout note" : "Save exercise entry note";
    if (kind === "workout") {
      mockUpdateWorkoutNote.mockReturnValueOnce(pendingSave.promise);
    } else {
      mockUpdateWorkoutExerciseNote.mockReturnValueOnce(pendingSave.promise);
    }

    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    await flush();

    await act(async () => { inputByLabel(tree, inputLabel).props.onChangeText(`${kind} A`); });
    await act(async () => { buttonByLabel(tree, saveLabel).props.onPress(); });
    await act(async () => { buttonByLabel(tree, "Go back").props.onPress(); });
    expect(tree.root.findAll((node: TestNode) => node.type === "Text" && node.props.children === "Saving note…")).toHaveLength(1);
    expect(buttonByLabel(tree, "Discard note changes")).toBeUndefined();
    expect(mockRouterBack).not.toHaveBeenCalled();

    await act(async () => { pendingSave.resolve(); });
    await flush();
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });

  it.each(["workout", "exercise"] as const)("keeps a newer %s draft after a pending save fails before removal", async (kind) => {
    const pendingSave = deferred<void>();
    const inputLabel = kind === "workout" ? "Workout note" : "Exercise entry note";
    const saveLabel = kind === "workout" ? "Save workout note" : "Save exercise entry note";
    if (kind === "workout") {
      mockUpdateWorkoutNote.mockReturnValueOnce(pendingSave.promise);
    } else {
      mockUpdateWorkoutExerciseNote.mockReturnValueOnce(pendingSave.promise);
    }

    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    await flush();

    await act(async () => { inputByLabel(tree, inputLabel).props.onChangeText(`${kind} A`); });
    await act(async () => { buttonByLabel(tree, saveLabel).props.onPress(); });
    await act(async () => { inputByLabel(tree, inputLabel).props.onChangeText(`${kind} B`); });
    const action = { type: "GO_BACK", source: kind };
    await act(async () => { latestPreventRemoveCallback()?.({ data: { action } }); });
    expect(mockNavigationDispatch).not.toHaveBeenCalled();
    expect(buttonByLabel(tree, "Discard note changes")).toBeUndefined();

    await act(async () => { pendingSave.reject(new Error("offline")); });
    await flush();
    expect(inputByLabel(tree, inputLabel).props.value).toBe(`${kind} B`);
    expect(buttonByLabel(tree, "Discard note changes")).toBeDefined();
    expect(mockNavigationDispatch).not.toHaveBeenCalled();
    await act(async () => { buttonByLabel(tree, "Keep editing notes").props.onPress(); });
    expect(inputByLabel(tree, inputLabel).props.value).toBe(`${kind} B`);
    expect(mockNavigationDispatch).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it("waits for a pending note save before global Save Edits mutates sets", async () => {
    const pendingSave = deferred<void>();
    mockUpdateWorkoutNote.mockReturnValueOnce(pendingSave.promise);
    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    await flush();

    await act(async () => { buttonByLabel(tree, "Edit set 1").props.onPress(); });
    await act(async () => {
      tree.root.findByType("EditSetModal").props.onSave({ weight_kg: 110, reps: 5, note: "set note", performed_at: 1_700_000_000_000 });
    });
    await act(async () => { inputByLabel(tree, "Workout note").props.onChangeText("workout A"); });
    await act(async () => { buttonByLabel(tree, "Save workout note").props.onPress(); });
    await act(async () => { buttonByText(tree, "Save Edits").props.onPress(); });
    expect(mockUpdateSet).not.toHaveBeenCalled();
    expect(buttonByLabel(tree, "Discard note changes")).toBeUndefined();

    await act(async () => { pendingSave.resolve(); });
    await flush();
    expect(mockUpdateSet).toHaveBeenCalledWith(44, { weight_kg: 110 });
    await act(async () => { tree.unmount(); });
  });

  it("continues an approved prevented removal without writing notes", async () => {
    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    await flush();
    await act(async () => { inputByLabel(tree, "Workout note").props.onChangeText("discarded"); });

    const action = { type: "GO_BACK", source: "hardware" };
    await act(async () => { latestPreventRemoveCallback()?.({ data: { action } }); });
    expect(mockNavigationDispatch).not.toHaveBeenCalled();
    await act(async () => { buttonByLabel(tree, "Discard note changes").props.onPress(); });
    await flush();
    expect(mockNavigationDispatch).toHaveBeenCalledWith(action);
    expect(mockUpdateWorkoutNote).not.toHaveBeenCalled();
    expect(mockUpdateWorkoutExerciseNote).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it("discards only note drafts before Save Edits and keeps set drafts intact", async () => {
    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    await flush();
    await act(async () => { buttonByLabel(tree, "Edit set 1").props.onPress(); });
    await act(async () => {
      tree.root.findByType("EditSetModal").props.onSave({ weight_kg: 110, reps: 5, note: "set note", performed_at: 1_700_000_000_000 });
    });
    await act(async () => { inputByLabel(tree, "Workout note").props.onChangeText("discarded note"); });
    await act(async () => { buttonByText(tree, "Save Edits").props.onPress(); });
    await act(async () => { buttonByLabel(tree, "Discard note changes").props.onPress(); });
    await flush();

    expect(mockUpdateSet).toHaveBeenCalledWith(44, { weight_kg: 110 });
    expect(mockUpdateWorkoutNote).not.toHaveBeenCalled();
    expect(mockUpdateWorkoutExerciseNote).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it("does not let an old A context save alter a newly loaded A context", async () => {
    const oldSave = deferred<void>();
    const newSave = deferred<void>();
    mockGetWorkoutExerciseById.mockImplementation((id: number) =>
      Promise.resolve(id === 202 ? { ...completedEntry, id: 202, workoutId: 22, note: "B entry" } : completedEntry)
    );
    mockGetWorkoutById
      .mockResolvedValueOnce({ id: 11, note: "old A" })
      .mockResolvedValueOnce({ id: 22, note: "B workout" })
      .mockResolvedValueOnce({ id: 11, note: "fresh A" });
    mockListSetsForWorkoutExercise.mockResolvedValue([]);
    mockUpdateWorkoutNote.mockReturnValueOnce(oldSave.promise).mockReturnValueOnce(newSave.promise);

    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    await flush();
    await act(async () => { inputByLabel(tree, "Workout note").props.onChangeText("old save"); });
    await act(async () => { buttonByLabel(tree, "Save workout note").props.onPress(); });

    mockParams = { workoutExerciseId: "202" };
    await act(async () => { tree.update(<EditWorkoutScreen />); });
    await flush();
    mockParams = { workoutExerciseId: "101" };
    await act(async () => { tree.update(<EditWorkoutScreen />); });
    await flush();
    expect(inputByLabel(tree, "Workout note").props.value).toBe("fresh A");

    await act(async () => { inputByLabel(tree, "Workout note").props.onChangeText("fresh dirty"); });
    await act(async () => { buttonByLabel(tree, "Save workout note").props.onPress(); });
    expect(buttonByLabel(tree, "Save workout note").props.disabled).toBe(true);
    await act(async () => { oldSave.resolve(); });
    await flush();
    expect(inputByLabel(tree, "Workout note").props.value).toBe("fresh dirty");
    expect(buttonByLabel(tree, "Save workout note").props.disabled).toBe(true);
    await act(async () => { newSave.resolve(); });
    await flush();
    await act(async () => { tree.unmount(); });
  });

  it("rejects invalid or missing identities before showing note save controls", async () => {
    mockParams = { workoutExerciseId: "not-an-id", workoutId: "11", exerciseId: "7" };
    let tree!: RenderedTree;
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    expect(tree.root.findAll((node: TestNode) => node.type === "Pressable" && /Save (workout|exercise entry) note/.test(String(node.props.accessibilityLabel ?? "")))).toHaveLength(0);
    expect(mockGetWorkoutById).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });

    mockParams = { workoutExerciseId: "404" };
    mockGetWorkoutExerciseById.mockResolvedValue(null);
    await act(async () => { tree = renderer.create(<EditWorkoutScreen />); });
    await flush();
    expect(tree.root.findAll((node: TestNode) => node.type === "Pressable" && /Save (workout|exercise entry) note/.test(String(node.props.accessibilityLabel ?? "")))).toHaveLength(0);
    expect(mockUpdateWorkoutNote).not.toHaveBeenCalled();
    expect(mockUpdateWorkoutExerciseNote).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});
