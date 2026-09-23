import { Pressable, Text, TextInput, View } from 'react-native';
import VariationExerciseLabel from '@/components/exercise/VariationExerciseLabel';
import AppModal from '@/components/modals/BaseModal';
import { useLibraryAppearance } from '../hooks/use-library-appearance';
import type { LibraryController } from '../hooks/use-library-controller';

export function LibraryVariationDialogs({ controller }: { controller: LibraryController }) {
  const { rawColors, isDark, subtleBorder } = useLibraryAppearance();
  const { isVariationEditorVisible, closeVariationEditor, variationEditorMode, selectedGroup, variationError,
    variationDraft, setVariationDraft, setVariationError, handleSaveVariation, isVariationDeleteConfirmVisible,
    closeVariationDeleteConfirm, variationTarget, handleDeleteVariation } = controller;
  return (<>
    <AppModal visible={isVariationEditorVisible} onClose={closeVariationEditor} maxWidth={380}>
      <Text
        style={{
          color: rawColors.foreground,
          fontSize: 22,
          fontWeight: "700",
        }}
      >
        {variationEditorMode === "create" ? "New Variation" : "Rename Variation"}
      </Text>
      <Text
        style={{
          marginTop: 6,
          marginBottom: 16,
          color: rawColors.foregroundSecondary,
          fontSize: 14,
        }}
      >
        {selectedGroup?.exercise.name ?? "Exercise"}
      </Text>

      {variationError ? (
        <View
          style={{
            marginBottom: 14,
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: isDark ? `${rawColors.destructive}20` : "#FFF1F0",
          }}
        >
          <Text style={{ color: rawColors.destructive, fontSize: 13, fontWeight: "600" }}>
            {variationError}
          </Text>
        </View>
      ) : null}

      <Text
        style={{
          color: rawColors.foregroundSecondary,
          fontSize: 13,
          fontWeight: "600",
          marginBottom: 8,
        }}
      >
        Variation Label
      </Text>
      <TextInput
        value={variationDraft}
        onChangeText={(text) => {
          setVariationDraft(text);
          setVariationError(null);
        }}
        placeholder="e.g. Larson"
        placeholderTextColor={rawColors.foregroundMuted}
        autoFocus
        style={{
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 14,
          backgroundColor: rawColors.surfaceSecondary,
          color: rawColors.foreground,
          fontSize: 15,
          borderWidth: 1,
          borderColor: subtleBorder,
        }}
      />

      <View className="flex-row gap-3 mt-2">
        <Pressable
          className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
          onPress={closeVariationEditor}
        >
          <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center justify-center p-3.5 rounded-lg bg-primary"
          onPress={handleSaveVariation}
        >
          <Text className="text-base font-semibold text-primary-foreground">
            {variationEditorMode === "create" ? "Add" : "Save"}
          </Text>
        </Pressable>
      </View>
    </AppModal>
    <AppModal
      visible={isVariationDeleteConfirmVisible}
      onClose={closeVariationDeleteConfirm}
      maxWidth={420}
    >
      <Text
        style={{
          color: rawColors.foreground,
          fontSize: 22,
          fontWeight: "700",
        }}
      >
        Delete Variation?
      </Text>
      {variationTarget ? (
        <>
          <View style={{ marginTop: 12 }}>
            <VariationExerciseLabel
              exercise={{
                name: variationTarget.name,
                parentExerciseId: variationTarget.parentExerciseId,
                variationLabel: variationTarget.variationLabel,
                parentName: selectedGroup?.exercise.name ?? null,
              }}
              style={{ color: rawColors.foreground, fontSize: 16, fontWeight: "700" }}
              suffixStyle={{ color: rawColors.foregroundSecondary, fontWeight: "700" }}
            />
          </View>

          <Text
            style={{
              marginTop: 10,
              marginBottom: 14,
              color: rawColors.foregroundSecondary,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            Choose what should happen to the variation data that has already been logged.
          </Text>

          <Pressable
            onPress={() => handleDeleteVariation("keep_data")}
            className="active:opacity-80"
            style={{
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 14,
              backgroundColor: rawColors.surfaceSecondary
            }}
          >
            <Text style={{ color: rawColors.foreground, fontSize: 15, fontWeight: "700" }}>
              Keep data under parent
            </Text>
            <Text
              style={{
                marginTop: 6,
                color: rawColors.foregroundSecondary,
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              Logged sessions stay in history and move back under the parent exercise.
            </Text>
          </Pressable>

          <Pressable
            onPress={() => handleDeleteVariation("delete_data")}
            className="active:opacity-80"
            style={{
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 14,
              backgroundColor: isDark ? `${rawColors.destructive}22` : "#FFF1F0",
              marginTop: 10
            }}
          >
            <Text
              style={{
                color: rawColors.destructive,
                fontSize: 15,
                fontWeight: "700",
              }}
            >
              Delete data entirely
            </Text>
            <Text
              style={{
                marginTop: 6,
                color: rawColors.foregroundSecondary,
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              Logged sessions for this variation are removed along with the variation row.
            </Text>
          </Pressable>

          <Pressable
            onPress={closeVariationDeleteConfirm}
            className="active:opacity-80"
            style={{
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              paddingVertical: 14,
              backgroundColor: rawColors.surfaceSecondary,
              marginTop: 14
            }}
          >
            <Text style={{ color: rawColors.foregroundSecondary, fontSize: 15, fontWeight: "700" }}>
              Cancel
            </Text>
          </Pressable>
        </>
      ) : null}
    </AppModal>
  </>);
}
