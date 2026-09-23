import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FlatList, Pressable, Text, View } from "react-native";
import SetItem from "../../lists/SetItem";
import { type SetRow } from "../../../lib/db/workouts";
import ProgrammedSetsPanel from "./programmed-sets-panel";
import type { RecordingController } from "./use-recording-controller";

type Props = Pick<RecordingController, "workout" | "rawColors" | "sets" | "reps" | "note" | "setIdsWithMedia" | "programEntries" | "selectedProgramExerciseId" | "programWeightInputs" | "programRepsInputs" | "activeProgramEntry" | "inProgramMode" | "prescribedSets" | "userSets" | "displayedRecordedSets" | "handleProgramWeightChange" | "handleProgramRepsChange" | "handleProgramSetAutofill" | "handleProgramSetFocus" | "handleProgramSetBlur" | "handleSelectProgramExercise" | "handleOpenProgramSetInfo" | "handleEditSetPress" | "handleSetPress" | "handleDeleteSetPress" | "handleOpenClearConfirm" | "handleConfirmPlannedSet">;
export default function RecordedSetsPanel(props: Props) {
  const {
    rawColors,
    sets,
    setIdsWithMedia,
    programEntries,
    selectedProgramExerciseId,
    programWeightInputs,
    programRepsInputs,
    activeProgramEntry,
    inProgramMode,
    prescribedSets,
    userSets,
    displayedRecordedSets,
    handleProgramWeightChange,
    handleProgramRepsChange,
    handleProgramSetAutofill,
    handleProgramSetFocus,
    handleProgramSetBlur,
    handleSelectProgramExercise,
    handleOpenProgramSetInfo,
    handleEditSetPress,
    handleSetPress,
    handleDeleteSetPress,
    handleOpenClearConfirm,
    handleConfirmPlannedSet,
  } = props;
  const renderSetItem = ({ item, index }: { item: SetRow; index: number }) => {
    const isPlanned = (item.note ?? "").startsWith("[PLANNED]");
    const displayNote = isPlanned
      ? (item.note ?? "").replace(/^\[PLANNED\]\s*/, "").trim() || null
      : item.note;

    return (
      <View style={isPlanned ? { opacity: 0.55 } : undefined}>
        <SetItem
          index={index + 1}
          weightKg={item.weightKg}
          reps={item.reps}
          note={isPlanned ? `${displayNote ? displayNote + " " : ""}(Planned)` : displayNote}
          onPress={() => handleSetPress(item.id)}
          rightActions={
            <View className="flex-row items-center gap-2 ml-2">
              {!inProgramMode && isPlanned && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm set ${index + 1}`}
                  hitSlop={8}
                  className="w-7 h-7 rounded-full items-center justify-center"
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    backgroundColor: rawColors.success + "20",
                    borderWidth: 1.5,
                    borderColor: rawColors.success,
                  })}
                  onPress={() => handleConfirmPlannedSet(item)}
                >
                  <MaterialCommunityIcons
                    name="check"
                    size={16}
                    color={rawColors.success}
                  />
                </Pressable>
              )}
              {setIdsWithMedia.has(item.id) && (
                <View className="w-7 h-7 rounded-full items-center justify-center bg-background">
                  <MaterialCommunityIcons
                    name="video-outline"
                    size={16}
                    color={rawColors.primary}
                  />
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit set ${index + 1}`}
                hitSlop={8}
                className="w-7 h-7 rounded-full items-center justify-center bg-background"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                onPress={() => handleEditSetPress(item)}
              >
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={16}
                  color={rawColors.primary}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete set ${index + 1}`}
                hitSlop={8}
                className="w-7 h-7 rounded-full items-center justify-center bg-background"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                onPress={() => handleDeleteSetPress(item, index + 1)}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={16}
                  color={rawColors.destructive}
                />
              </Pressable>
            </View>
          }
        />
      </View>
    );
  };
  return (<View
    className="rounded-2xl p-5 bg-surface"
    style={{
      borderRadius: 18,
      borderWidth: 1,
      borderColor: rawColors.border,
    }}
  >
    <View className="flex-row items-center justify-between mb-4">
      <Text className="text-lg font-semibold text-foreground" selectable>
        Recorded Sets
      </Text>
      {sets.length > 0 && (
        <View className="flex-row items-center px-3 py-1.5 rounded-full bg-surface-secondary">
          <MaterialCommunityIcons
            name="dumbbell"
            size={14}
            color={rawColors.foregroundSecondary}
          />
          <Text className="text-sm font-medium ml-1.5 text-foreground-secondary" selectable>
            {sets.length} {sets.length === 1 ? "set" : "sets"}
          </Text>
        </View>
      )}
    </View>

    {inProgramMode && activeProgramEntry && (
      <ProgrammedSetsPanel
        programEntries={programEntries}
        selectedProgramExerciseId={selectedProgramExerciseId}
        onSelectProgramExercise={handleSelectProgramExercise}
        prescribedSets={prescribedSets}
        userSets={userSets}
        weightInputs={programWeightInputs}
        repsInputs={programRepsInputs}
        onWeightChange={handleProgramWeightChange}
        onRepsChange={handleProgramRepsChange}
        onAutofillSet={handleProgramSetAutofill}
        onSetFocus={handleProgramSetFocus}
        onSetBlur={handleProgramSetBlur}
        onOpenSetInfo={handleOpenProgramSetInfo}
        setIdsWithMedia={setIdsWithMedia}
      />
    )}

    {displayedRecordedSets.length === 0 ? (
      <View className="items-center py-8">
        <View className="w-16 h-16 rounded-full items-center justify-center mb-4 bg-surface-secondary">
          <MaterialCommunityIcons
            name="clipboard-outline"
            size={28}
            color={rawColors.foregroundMuted}
          />
        </View>
        <Text className="text-base font-medium text-foreground-secondary" selectable>
          {inProgramMode ? "No additional sets recorded yet" : "No sets recorded yet"}
        </Text>
        <Text className="text-sm text-center mt-1 text-foreground-muted" selectable>
          {inProgramMode
            ? "Programmed rows are tracked above. Manual and off-program sets will appear below."
            : "Add your first set using the form above."}
        </Text>
      </View>
    ) : (
      <FlatList
        data={displayedRecordedSets}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderSetItem}
        scrollEnabled={false}
        nestedScrollEnabled
      />
    )}

    {sets.length > 0 && (
      <View className="flex-row justify-end mt-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear all recorded sets"
          className="flex-row items-center px-3 py-2 rounded-full bg-surface-secondary"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          onPress={handleOpenClearConfirm}
        >
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={16}
            color={rawColors.destructive}
          />
          <Text className="text-sm font-semibold ml-1.5 text-destructive" selectable>
            Clear
          </Text>
        </Pressable>
      </View>
    )}
  </View>);
}
