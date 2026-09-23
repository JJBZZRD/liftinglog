import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import AppModal from "../../modals/BaseModal";
import EditSetModal from "../../modals/EditSetModal";
import TimerModal from "../../TimerModal";
import { formatWeightFromKg } from "../../../lib/utils/units";
import type { RecordingController } from "./use-recording-controller";

type Props = Pick<RecordingController, "rawColors" | "unitPreference" | "exerciseId" | "sets" | "reps" | "note" | "editModalVisible" | "setEditModalVisible" | "selectedSet" | "setSelectedSet" | "deleteConfirmVisible" | "deleteTarget" | "deleteMediaChecked" | "setDeleteMediaChecked" | "deleteMediaAvailable" | "clearConfirmVisible" | "clearMediaChecked" | "setClearMediaChecked" | "clearMediaAvailable" | "timerModalVisible" | "setTimerModalVisible" | "currentTimer" | "timerMinutes" | "setTimerMinutes" | "timerSeconds" | "setTimerSeconds" | "programCompleteModalVisible" | "setProgramCompleteModalVisible" | "displayExerciseName" | "finalizeProgramExercise" | "handleUpdateSet" | "closeDeleteConfirm" | "handleConfirmDeleteSet" | "closeClearConfirm" | "handleConfirmClearSets" | "handleSaveRestTime">;
export default function RecordingModals(props: Props) {
  const {
    rawColors,
    unitPreference,
    exerciseId,
    sets,
    editModalVisible,
    setEditModalVisible,
    selectedSet,
    setSelectedSet,
    deleteConfirmVisible,
    deleteTarget,
    deleteMediaChecked,
    setDeleteMediaChecked,
    deleteMediaAvailable,
    clearConfirmVisible,
    clearMediaChecked,
    setClearMediaChecked,
    clearMediaAvailable,
    timerModalVisible,
    setTimerModalVisible,
    currentTimer,
    timerMinutes,
    setTimerMinutes,
    timerSeconds,
    setTimerSeconds,
    programCompleteModalVisible,
    setProgramCompleteModalVisible,
    displayExerciseName,
    finalizeProgramExercise,
    handleUpdateSet,
    closeDeleteConfirm,
    handleConfirmDeleteSet,
    closeClearConfirm,
    handleConfirmClearSets,
    handleSaveRestTime,
  } = props;
  return (<><EditSetModal
    visible={editModalVisible}
    onClose={() => {
      setEditModalVisible(false);
      setSelectedSet(null);
    }}
    set={selectedSet}
    onSave={handleUpdateSet}
    showTimePicker={true}
  />
    <AppModal
      visible={deleteConfirmVisible}
      onClose={closeDeleteConfirm}
      maxWidth={380}
    >
      <Text className="text-xl font-bold mb-2 text-foreground" selectable>
        Delete set?
      </Text>
      <Text className="text-base mb-4 text-foreground-secondary" selectable>
        This action cannot be undone.
      </Text>

      {deleteTarget && (
        <View className="rounded-lg p-3 mb-5 bg-surface-secondary border border-border">
          <Text className="text-sm font-semibold text-foreground" selectable>
            Set #{deleteTarget.displayIndex}:{" "}
            {formatWeightFromKg(deleteTarget.set.weightKg, unitPreference)} x{" "}
            {deleteTarget.set.reps !== null
              ? String(deleteTarget.set.reps) + " reps"
              : "--"}
          </Text>
          {!!deleteTarget.set.note && (
            <Text
              className="text-sm mt-1 italic text-foreground-secondary"
              numberOfLines={2}
              selectable
            >
              {deleteTarget.set.note}
            </Text>
          )}
        </View>
      )}

      {deleteMediaAvailable && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: deleteMediaChecked }}
          className="flex-row items-center mb-5"
          onPress={() => setDeleteMediaChecked((current) => !current)}
        >
          <MaterialCommunityIcons
            name={
              deleteMediaChecked
                ? "checkbox-marked"
                : "checkbox-blank-outline"
            }
            size={20}
            color={
              deleteMediaChecked
                ? rawColors.primary
                : rawColors.foregroundSecondary
            }
          />
          <Text className="text-sm font-medium ml-2 text-foreground" selectable>
            Delete associated media
          </Text>
        </Pressable>
      )}

      <View className="flex-row gap-3">
        <Pressable
          className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
          onPress={closeDeleteConfirm}
        >
          <Text className="text-base font-semibold text-foreground-secondary" selectable>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          className="flex-1 flex-row items-center justify-center p-3.5 rounded-lg gap-1.5 bg-destructive"
          onPress={handleConfirmDeleteSet}
        >
          <MaterialCommunityIcons
            name="delete"
            size={20}
            color={rawColors.surface}
          />
          <Text className="text-base font-semibold text-primary-foreground" selectable>
            Delete
          </Text>
        </Pressable>
      </View>
    </AppModal>
    <AppModal
      visible={clearConfirmVisible}
      onClose={closeClearConfirm}
      maxWidth={380}
    >
      <Text className="text-xl font-bold mb-2 text-foreground" selectable>
        Clear sets?
      </Text>
      <Text className="text-base mb-4 text-foreground-secondary" selectable>
        This will remove all recorded sets. This action cannot be undone.
      </Text>

      <View className="rounded-lg p-3 mb-5 bg-surface-secondary border border-border">
        <Text className="text-sm font-semibold text-foreground" selectable>
          {sets.length} set{sets.length !== 1 ? "s" : ""} will be deleted
        </Text>
      </View>

      {clearMediaAvailable && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: clearMediaChecked }}
          className="flex-row items-center mb-5"
          onPress={() => setClearMediaChecked((current) => !current)}
        >
          <MaterialCommunityIcons
            name={
              clearMediaChecked
                ? "checkbox-marked"
                : "checkbox-blank-outline"
            }
            size={20}
            color={
              clearMediaChecked
                ? rawColors.primary
                : rawColors.foregroundSecondary
            }
          />
          <Text className="text-sm font-medium ml-2 text-foreground" selectable>
            Delete associated media
          </Text>
        </Pressable>
      )}

      <View className="flex-row gap-3">
        <Pressable
          className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
          onPress={closeClearConfirm}
        >
          <Text className="text-base font-semibold text-foreground-secondary" selectable>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          className="flex-1 flex-row items-center justify-center p-3.5 rounded-lg gap-1.5 bg-destructive"
          onPress={handleConfirmClearSets}
        >
          <MaterialCommunityIcons
            name="delete-sweep"
            size={20}
            color={rawColors.surface}
          />
          <Text className="text-base font-semibold text-primary-foreground" selectable>
            Clear
          </Text>
        </Pressable>
      </View>
    </AppModal>
    <AppModal
      visible={programCompleteModalVisible}
      onClose={() => setProgramCompleteModalVisible(false)}
    >
      <Text className="text-xl font-bold mb-3 text-foreground" selectable>
        Complete Exercise?
      </Text>
      <Text className="text-base mb-6 text-foreground-secondary" selectable>
        Some programmed sets are still incomplete. The completed sets will be
        saved to history and the remaining prescription will stay open.
      </Text>
      <View className="flex-row gap-3">
        <Pressable
          className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
          onPress={() => setProgramCompleteModalVisible(false)}
        >
          <Text className="text-base font-semibold text-foreground-secondary" selectable>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center justify-center p-3.5 rounded-lg bg-primary"
          onPress={finalizeProgramExercise}
        >
          <Text className="text-base font-semibold text-primary-foreground" selectable>
            Complete
          </Text>
        </Pressable>
      </View>
    </AppModal>
    <TimerModal
      visible={timerModalVisible}
      onClose={() => setTimerModalVisible(false)}
      exerciseId={exerciseId!}
      exerciseName={displayExerciseName}
      currentTimer={currentTimer}
      minutes={timerMinutes}
      seconds={timerSeconds}
      onMinutesChange={setTimerMinutes}
      onSecondsChange={setTimerSeconds}
      onSaveRestTime={handleSaveRestTime}
    /></>);
}
