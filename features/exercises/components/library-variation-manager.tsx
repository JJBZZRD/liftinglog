import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import VariationExerciseLabel from '@/components/exercise/VariationExerciseLabel';
import AppModal from '@/components/modals/BaseModal';
import { useLibraryAppearance } from '../hooks/use-library-appearance';
import type { LibraryController } from '../hooks/use-library-controller';

export function LibraryVariationManager({ controller }: { controller: LibraryController }) {
  const { rawColors } = useLibraryAppearance();
  const { isVariationsModalVisible, setVariationsModalVisible, setVariationTarget, selectedGroup,
    handleOpenVariationEditor, formatLastCompletedLabel, lastPerformedAtByExerciseId, setVariationDeleteConfirmVisible } = controller;
  return (
    <AppModal
      visible={isVariationsModalVisible}
      onClose={() => {
        setVariationsModalVisible(false);
        setVariationTarget(null);
      }}
      maxWidth={420}
    >
      {selectedGroup ? (
        <>
          <View
            style={{
              position: "relative",
              marginBottom: 18,
              paddingRight: 118,
            }}
          >
            <Text
              style={{
                color: rawColors.foreground,
                fontSize: 22,
                fontWeight: "700",
              }}
            >
              Manage Variations
            </Text>
            <Text
              style={{
                marginTop: 6,
                color: rawColors.foregroundSecondary,
                fontSize: 14,
              }}
            >
              {selectedGroup.exercise.name}
            </Text>

            <View
              style={{
                position: "absolute",
                top: 8,
                right: 0,
                width: 104,
                height: 48,
              }}
            >
              <Pressable
                onPress={() => handleOpenVariationEditor("create")}
                className="flex-1 items-center justify-center p-3.5 rounded-lg bg-primary active:opacity-80"

              >
                <Text className="text-base font-semibold text-primary-foreground">+ Add</Text>
              </Pressable>
            </View>
          </View>

          {selectedGroup.variations.length === 0 ? (
            <View
              style={{
                marginTop: 16,
                borderRadius: 18,
                padding: 16,
                backgroundColor: rawColors.surfaceSecondary,
              }}
            >
              <Text style={{ color: rawColors.foreground, fontSize: 15, fontWeight: "700" }}>
                No variations yet
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  color: rawColors.foregroundSecondary,
                  fontSize: 13,
                  lineHeight: 18,
                }}
              >
                Create a variation to log and analyze a concrete version of this exercise.
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 16, gap: 10 }}>
              {selectedGroup.variations.map((variation) => (
                <View
                  key={variation.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    borderRadius: 18,
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    backgroundColor: rawColors.surfaceSecondary,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <VariationExerciseLabel
                      exercise={{
                        name: variation.name,
                        parentExerciseId: variation.parentExerciseId,
                        variationLabel: variation.variationLabel,
                        parentName: selectedGroup.exercise.name,
                      }}
                      numberOfLines={1}
                      style={{ color: rawColors.foreground, fontSize: 15, fontWeight: "600" }}
                      suffixStyle={{ color: rawColors.foregroundSecondary, fontWeight: "600" }}
                    />
                    <Text
                      style={{
                        marginTop: 4,
                        color: rawColors.foregroundSecondary,
                        fontSize: 12,
                      }}
                    >
                      {formatLastCompletedLabel(lastPerformedAtByExerciseId[variation.id])}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => handleOpenVariationEditor("rename", variation)}
                    hitSlop={10}
                    className="active:opacity-80"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <MaterialCommunityIcons
                      name="pencil-outline"
                      size={18}
                      color={rawColors.primary}
                    />
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setVariationTarget(variation);
                      setVariationDeleteConfirmVisible(true);
                    }}
                    hitSlop={10}
                    className="active:opacity-80"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <MaterialCommunityIcons
                      name="delete-outline"
                      size={18}
                      color={rawColors.destructive}
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}
    </AppModal>
  );
}
