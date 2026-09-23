import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, LayoutAnimation } from 'react-native';
import {
  createExerciseVariation, deleteExercise, deleteExerciseVariation, lastPerformedAt,
  listExerciseLibraryGroups, renameExerciseVariation, type Exercise, type ExerciseLibraryGroup,
} from '@/lib/db/exercises';
import { getSelectedWorkoutId } from '@/lib/workouts/selection-store';
import { enableLegacyAndroidLayoutAnimationsIfNeeded } from '@/lib/utils/layoutAnimation';
import { formatCompactDate } from '../library-model';

enableLegacyAndroidLayoutAnimationsIfNeeded();

export function useLibraryController() {
  const { addExerciseRequest } = useLocalSearchParams<{ addExerciseRequest?: string | string[] }>();
  const [items, setItems] = useState<ExerciseLibraryGroup[]>([]);
  const [lastPerformedAtByExerciseId, setLastPerformedAtByExerciseId] = useState<
    Record<number, number | null>
  >({});
  const [expandedExerciseId, setExpandedExerciseId] = useState<number | null>(null);
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [isActionModalVisible, setActionModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [isDeleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [isVariationsModalVisible, setVariationsModalVisible] = useState(false);
  const [isVariationEditorVisible, setVariationEditorVisible] = useState(false);
  const [isVariationDeleteConfirmVisible, setVariationDeleteConfirmVisible] = useState(false);
  const [selectedParentExerciseId, setSelectedParentExerciseId] = useState<number | null>(null);
  const [variationEditorMode, setVariationEditorMode] = useState<"create" | "rename">("create");
  const [variationDraft, setVariationDraft] = useState("");
  const [variationError, setVariationError] = useState<string | null>(null);
  const [variationTarget, setVariationTarget] = useState<Exercise | null>(null);
  const selectedGroup = useMemo(
    () => items.find((item) => item.exercise.id === selectedParentExerciseId) ?? null,
    [items, selectedParentExerciseId]
  );
  const selectedExercise = selectedGroup?.exercise ?? null;

  const addExerciseRequestToken = Array.isArray(addExerciseRequest) ? addExerciseRequest[0] : addExerciseRequest;
  const reloadExercises = useCallback(async () => {
    const rows = await listExerciseLibraryGroups();
    setItems(rows);

    if (
      selectedParentExerciseId !== null &&
      !rows.some((item) => item.exercise.id === selectedParentExerciseId)
    ) {
      setSelectedParentExerciseId(null);
      setActionModalVisible(false);
      setEditModalVisible(false);
      setDeleteConfirmVisible(false);
      setVariationsModalVisible(false);
      setVariationEditorVisible(false);
      setVariationDeleteConfirmVisible(false);
      setVariationTarget(null);
    }

    if (
      expandedExerciseId !== null &&
      !rows.some((item) => item.exercise.id === expandedExerciseId)
    ) {
      setExpandedExerciseId(null);
    }

    const concreteExercises = rows.flatMap((group) => [group.exercise, ...group.variations]);
    const entries = await Promise.all(
      concreteExercises.map(
        async (exercise) => [exercise.id, await lastPerformedAt(exercise.id)] as const
      )
    );
    setLastPerformedAtByExerciseId(Object.fromEntries(entries));
  }, [expandedExerciseId, selectedParentExerciseId]);

  useFocusEffect(
    useCallback(() => {
      reloadExercises();
    }, [reloadExercises])
  );

  useEffect(() => {
    if (addExerciseRequestToken) {
      setAddModalVisible(true);
    }
  }, [addExerciseRequestToken]);

  const closeAddExerciseModal = useCallback(() => {
    setAddModalVisible(false);
    if (addExerciseRequestToken) {
      router.setParams({ addExerciseRequest: undefined });
    }
  }, [addExerciseRequestToken]);

  const formatLastCompletedLabel = useCallback((timestamp: number | null | undefined) => {
    return timestamp ? `Last completed ${formatCompactDate(timestamp)}` : "Never logged";
  }, []);

  const closeActionModal = useCallback(() => {
    setActionModalVisible(false);
  }, []);

  const closeVariationEditor = useCallback(() => {
    setVariationEditorVisible(false);
    setVariationDraft("");
    setVariationError(null);
    setVariationTarget(null);
  }, []);

  const closeVariationDeleteConfirm = useCallback(() => {
    setVariationDeleteConfirmVisible(false);
    setVariationTarget(null);
  }, []);

  const handleToggleExpanded = useCallback((exerciseId: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedExerciseId((prev) => (prev === exerciseId ? null : exerciseId));
  }, []);

  const handleNavigateToExercise = useCallback((exercise: Exercise) => {
    const selectedWorkoutId = getSelectedWorkoutId();
    router.push({
      pathname: "/exercise/[id]",
      params: {
        id: String(exercise.id),
        name: exercise.name,
        ...(selectedWorkoutId != null ? { workoutId: String(selectedWorkoutId) } : {}),
      },
    });
  }, []);

  const handleOpenActions = useCallback((group: ExerciseLibraryGroup) => {
    setSelectedParentExerciseId(group.exercise.id);
    setActionModalVisible(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedExercise) {
      setDeleteConfirmVisible(false);
      return;
    }
    try {
      await deleteExercise(selectedExercise.id);
      setDeleteConfirmVisible(false);
      setSelectedParentExerciseId(null);
      await reloadExercises();
    } catch (error: any) {
      Alert.alert("Unable to delete", error?.message ?? "Please resolve the exercise variations first.");
      setDeleteConfirmVisible(false);
    }
  }, [selectedExercise, reloadExercises]);

  const handleOpenVariationEditor = useCallback(
    (mode: "create" | "rename", variation?: Exercise | null) => {
      setVariationEditorMode(mode);
      setVariationTarget(variation ?? null);
      setVariationDraft(mode === "rename" ? variation?.variationLabel ?? "" : "");
      setVariationError(null);
      setVariationEditorVisible(true);
    },
    []
  );

  const handleSaveVariation = useCallback(async () => {
    if (!selectedGroup) {
      closeVariationEditor();
      return;
    }

    try {
      if (variationEditorMode === "create") {
        await createExerciseVariation(selectedGroup.exercise.id, variationDraft);
      } else if (variationTarget) {
        await renameExerciseVariation(variationTarget.id, variationDraft);
      }

      closeVariationEditor();
      await reloadExercises();
    } catch (error: any) {
      setVariationError(error?.message ?? "Unable to save variation.");
    }
  }, [
    closeVariationEditor,
    reloadExercises,
    selectedGroup,
    variationDraft,
    variationEditorMode,
    variationTarget,
  ]);

  const handleDeleteVariation = useCallback(
    async (mode: "keep_data" | "delete_data") => {
      if (!variationTarget) {
        closeVariationDeleteConfirm();
        return;
      }

      try {
        await deleteExerciseVariation(variationTarget.id, mode);
        closeVariationDeleteConfirm();
        await reloadExercises();
      } catch (error: any) {
        Alert.alert("Unable to delete variation", error?.message ?? "Please try again.");
      }
    },
    [closeVariationDeleteConfirm, reloadExercises, variationTarget]
  );

  return {
    items,
    lastPerformedAtByExerciseId,
    expandedExerciseId,
    isAddModalVisible,
    setAddModalVisible,
    isActionModalVisible,
    isEditModalVisible,
    setEditModalVisible,
    isDeleteConfirmVisible,
    setDeleteConfirmVisible,
    isVariationsModalVisible,
    setVariationsModalVisible,
    isVariationEditorVisible,
    isVariationDeleteConfirmVisible,
    setVariationDeleteConfirmVisible,
    variationEditorMode,
    variationDraft,
    setVariationDraft,
    variationError,
    setVariationError,
    variationTarget,
    setVariationTarget,
    selectedGroup,
    selectedExercise,
    reloadExercises,
    closeAddExerciseModal,
    formatLastCompletedLabel,
    closeActionModal,
    closeVariationEditor,
    closeVariationDeleteConfirm,
    handleToggleExpanded,
    handleNavigateToExercise,
    handleOpenActions,
    handleDelete,
    handleOpenVariationEditor,
    handleSaveVariation,
    handleDeleteVariation
  };
}
export type LibraryController = ReturnType<typeof useLibraryController>;
