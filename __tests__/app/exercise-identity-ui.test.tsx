/* eslint-disable @typescript-eslint/no-require-imports, import/first, react/display-name */

import React from "react";
import renderer, { act } from "react-test-renderer";

const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
const mockRouterSetParams = jest.fn();
const mockParams: { id?: string; name?: string } = { id: "42", name: "Bench Press" };

jest.mock("react-native", () => {
  const React = require("react");
  const host = (name: string) => name;
  return {
    Alert: { alert: jest.fn() },
    LayoutAnimation: { configureNext: jest.fn(), Presets: { easeInEaseOut: {} } },
    Modal: ({ visible = true, children, ...props }: { visible?: boolean; children?: React.ReactNode }) =>
      visible ? React.createElement("Modal", props, children) : null,
    Pressable: host("Pressable"),
    ScrollView: host("ScrollView"),
    Switch: host("Switch"),
    Text: host("Text"),
    TextInput: host("TextInput"),
    View: host("View"),
    StyleSheet: { create: (styles: unknown) => styles },
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
    Animated: {
      View: host("AnimatedView"),
      Value: jest.fn(() => ({
        interpolate: jest.fn(() => 0),
        stopAnimation: jest.fn(),
      })),
      parallel: jest.fn(() => ({ start: (callback?: (result: { finished: boolean }) => void) => callback?.({ finished: true }) })),
      spring: jest.fn(() => ({ start: jest.fn() })),
      timing: jest.fn(() => ({ start: jest.fn() })),
    },
    Dimensions: { get: () => ({ height: 844 }) },
    Easing: { out: (value: unknown) => value, in: (value: unknown) => value, inOut: (value: unknown) => value, cubic: "cubic" },
  };
});

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    Stack: {
      Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
        options?.headerRight?.() ?? null,
    },
    router: { push: mockRouterPush, back: mockRouterBack, setParams: mockRouterSetParams },
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
    useLocalSearchParams: () => mockParams,
    useNavigation: () => ({ addListener: jest.fn(() => jest.fn()) }),
  };
});

jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("expo-blur", () => ({ BlurView: "BlurView" }));
jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: "MaterialCommunityIcons" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock("react-native-gesture-handler", () => ({ Swipeable: "Swipeable" }));
jest.mock("react-native-tab-view", () => ({
  TabBar: () => null,
  TabView: ({ navigationState, renderScene, renderTabBar }: any) => {
    const React = require("react");
    return React.createElement(
      "View",
      null,
      renderTabBar?.({ navigationState }),
      renderScene({ route: navigationState.routes[navigationState.index] })
    );
  },
}));

jest.mock("../../components/modals/BaseModal", () => ({ visible = true, children }: any) => {
  const React = require("react");
  return visible ? React.createElement("Modal", null, children) : null;
});
jest.mock("../../lib/theme/ThemeContext", () => ({
  useTheme: () => ({ rawColors: new Proxy({}, { get: () => "#123456" }), isDark: false }),
}));
jest.mock("../../lib/utils/layoutAnimation", () => ({ enableLegacyAndroidLayoutAnimationsIfNeeded: jest.fn() }));
jest.mock("../../lib/utils/exerciseVariations", () => ({
  formatVariationCountLabel: (count: number) => `${count} variations`,
  getVariationDisplayParts: (exercise: { name: string }) => ({ baseName: exercise.name, variationSuffix: null }),
}));
jest.mock("../../lib/db/settings", () => ({
  getShowAllTabBodyPartGrouping: () => true,
  setShowAllTabBodyPartGrouping: jest.fn(),
}));
jest.mock("../../lib/db/workouts", () => ({
  getActiveWorkout: jest.fn(async () => null),
  listInProgressExercises: jest.fn(async () => []),
}));
jest.mock("../../lib/db/exercises", () => ({
  MAX_PINNED_EXERCISES: 8,
  createExercise: jest.fn(),
  updateExercise: jest.fn(),
  deleteExercise: jest.fn(),
  createExerciseVariation: jest.fn(),
  deleteExerciseVariation: jest.fn(),
  renameExerciseVariation: jest.fn(),
  lastPerformedAt: jest.fn(async () => null),
  listExerciseLibraryGroups: jest.fn(),
  getPinnedExercises: jest.fn(),
  togglePinExercise: jest.fn(),
  getExerciseWithParentById: jest.fn(async () => ({
    id: 42,
    name: "Bench Press",
    parentName: null,
    isVariation: false,
  })),
  getPinnedExercisesCount: jest.fn(async () => 0),
  isExercisePinned: jest.fn(async () => false),
}));
jest.mock("../../app/exercise/tabs/RecordTab", () => () => null);
jest.mock("../../app/exercise/tabs/HistoryTab", () => () => null);
jest.mock("../../app/exercise/tabs/AnalyticsTab", () => () => null);

import AddExerciseModal from "../../components/AddExerciseModal";
import PinnedExercisesOverlay from "../../components/PinnedExercisesOverlay";
import ExercisesScreen from "../../app/(tabs)/exercises";
import ExerciseModalScreen from "../../app/exercise/[id]";

const mockExercisesDb = require("../../lib/db/exercises");
const mockCreateExercise = mockExercisesDb.createExercise;
const mockUpdateExercise = mockExercisesDb.updateExercise;
const mockDeleteExercise = mockExercisesDb.deleteExercise;
const mockCreateExerciseVariation = mockExercisesDb.createExerciseVariation;
const mockGetPinnedExercises = mockExercisesDb.getPinnedExercises;
const mockTogglePinExercise = mockExercisesDb.togglePinExercise;

type TestNode = any;
type RenderTree = ReturnType<typeof renderer.create>;

function pressablesWithText(tree: RenderTree, label: string): TestNode[] {
  return tree.root.findAll(
    (node: TestNode) =>
      node.type === "Pressable" &&
      node.findAll((child: TestNode) => child.type === "Text" && child.props.children === label).length > 0
  );
}

function exercise(id: number) {
  return {
    id,
    uid: `exercise-${id}`,
    name: "Bench Press",
    description: null,
    muscleGroup: "Chest",
    equipment: "Barbell",
    isBodyweight: false,
    isPinned: false,
    parentExerciseId: null,
    variationLabel: null,
  };
}

const duplicateGroups = [41, 42].map((id) => ({
  exercise: exercise(id),
  variations: [],
  familyLastPerformedAt: null,
}));

describe("duplicate exercise identity UI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.id = "42";
    mockParams.name = "Bench Press";
    const exercisesDb = require("../../lib/db/exercises");
    Object.assign(require("expo-router").router, {
      push: mockRouterPush,
      back: mockRouterBack,
      setParams: mockRouterSetParams,
    });
    exercisesDb.listExerciseLibraryGroups.mockResolvedValue(duplicateGroups);
    exercisesDb.lastPerformedAt.mockResolvedValue(null);
    mockCreateExercise.mockResolvedValue(99);
    mockUpdateExercise.mockResolvedValue(undefined);
    mockDeleteExercise.mockResolvedValue(undefined);
    mockCreateExerciseVariation.mockRejectedValue(new Error("Variation label already exists."));
    mockGetPinnedExercises.mockResolvedValue([exercise(41), exercise(42)]);
    mockTogglePinExercise.mockResolvedValue(true);
  });

  it("creates a same-name exercise as a new ID and reports that ID to the caller", async () => {
    const onSaved = jest.fn();
    let tree: RenderTree;
    await act(async () => {
      tree = renderer.create(<AddExerciseModal visible onDismiss={jest.fn()} onSaved={onSaved} />);
    });

    const nameInput = tree!.root.findAllByType("TextInput")[0];
    await act(async () => {
      nameInput.props.onChangeText("Bench Press");
    });
    await act(async () => {
      await pressablesWithText(tree!, "Create")[0].props.onPress();
    });

    expect(mockCreateExercise).toHaveBeenCalledWith(expect.objectContaining({ name: "Bench Press" }));
    expect(onSaved).toHaveBeenCalledWith(99);
  });

  it("keeps same-name library rows independently searchable and routes, edits, deletes, and guards variations by selected ID", async () => {
    const originalError = console.error;
    const consoleError = jest.fn();
    console.error = consoleError;
    let tree: RenderTree;

    try {
      await act(async () => {
        tree = renderer.create(<ExercisesScreen />);
      });

      expect(tree!.root.findAll((node: TestNode) => node.type === "Text" && node.props.children === "Bench Press")).toHaveLength(2);
      const search = tree!.root.findAllByType("TextInput")[0];
      await act(async () => {
        search.props.onChangeText("bench");
      });
      expect(tree!.root.findAll((node: TestNode) => node.type === "Text" && node.props.children === "Bench Press")).toHaveLength(2);
      expect(consoleError.mock.calls.some((call) => String(call[0]).includes("same key"))).toBe(false);

      await act(async () => {
        await pressablesWithText(tree!, "Bench Press")[1].props.onPress();
      });
      expect(mockRouterPush).toHaveBeenLastCalledWith({
        pathname: "/exercise/[id]",
        params: { id: "42", name: "Bench Press" },
      });

      const actionButtons = tree!.root.findAll(
        (node: TestNode) => node.type === "Pressable" && node.props.accessibilityLabel === "Open actions for Bench Press"
      );
      await act(async () => {
        actionButtons[1].props.onPress();
      });
      await act(async () => {
        pressablesWithText(tree!, "Edit Details")[0].props.onPress();
      });
      const editName = tree!.root.findAllByType("TextInput").find((node: TestNode) => node.props.value === "Bench Press");
      await act(async () => {
        editName.props.onChangeText("Bench Press Updated");
      });
      await act(async () => {
        await pressablesWithText(tree!, "Save")[0].props.onPress();
      });
      expect(mockUpdateExercise).toHaveBeenCalledWith(42, expect.objectContaining({ name: "Bench Press Updated" }));

      await act(async () => {
        tree!.root.findAll(
          (node: TestNode) => node.type === "Pressable" && node.props.accessibilityLabel === "Open actions for Bench Press"
        )[1].props.onPress();
      });
      await act(async () => {
        pressablesWithText(tree!, "Delete")[0].props.onPress();
      });
      await act(async () => {
        await pressablesWithText(tree!, "Delete")[0].props.onPress();
      });
      expect(mockDeleteExercise).toHaveBeenCalledWith(42);

      await act(async () => {
        tree!.root.findAll(
          (node: TestNode) => node.type === "Pressable" && node.props.accessibilityLabel === "Open actions for Bench Press"
        )[1].props.onPress();
      });
      await act(async () => {
        pressablesWithText(tree!, "Variations")[0].props.onPress();
      });
      await act(async () => {
        pressablesWithText(tree!, "+ Add")[0].props.onPress();
      });
      const variationInput = tree!.root.findAllByType("TextInput").find((node: TestNode) => node.props.placeholder === "e.g. Larson");
      await act(async () => {
        variationInput.props.onChangeText("Close Grip");
      });
      await act(async () => {
        await pressablesWithText(tree!, "Add")[0].props.onPress();
      });
      expect(mockCreateExerciseVariation).toHaveBeenCalledWith(42, "Close Grip");
      expect(tree!.root.findAll((node: TestNode) => node.type === "Text" && node.props.children === "Variation label already exists.")).toHaveLength(1);
    } finally {
      console.error = originalError;
      await act(async () => {
        tree!.unmount();
      });
    }
  });

  it("pins, unpins, and opens same-name exercises using the concrete ID", async () => {
    let detailTree: RenderTree;
    await act(async () => {
      detailTree = renderer.create(<ExerciseModalScreen />);
    });
    await act(async () => {
      await detailTree!.root.findByProps({ accessibilityLabel: "Pin exercise" }).props.onPress();
    });
    await act(async () => {
      await detailTree!.root.findByProps({ accessibilityLabel: "Unpin exercise" }).props.onPress();
    });
    expect(mockTogglePinExercise).toHaveBeenNthCalledWith(1, 42);
    expect(mockTogglePinExercise).toHaveBeenNthCalledWith(2, 42);

    let overlayTree: RenderTree;
    await act(async () => {
      overlayTree = renderer.create(<PinnedExercisesOverlay />);
    });
    await act(async () => {
      const buttons = overlayTree!.root.findAllByType("Pressable");
      buttons[buttons.length - 1].props.onPress();
    });

    const pinnedRows = pressablesWithText(overlayTree!, "Bench Press");
    expect(pinnedRows).toHaveLength(2);
    await act(async () => {
      pinnedRows[1].props.onPress();
    });
    expect(mockRouterPush).toHaveBeenLastCalledWith({
      pathname: "/exercise/[id]",
      params: { id: "42", name: "Bench Press" },
    });

    const swipeables = overlayTree!.root.findAllByType("Swipeable");
    await act(async () => {
      await swipeables[1].props.onSwipeableOpen();
    });
    expect(mockTogglePinExercise).toHaveBeenLastCalledWith(42);
    expect(pressablesWithText(overlayTree!, "Bench Press")).toHaveLength(1);
  });
});
