import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import AddExerciseModal from '@/components/AddExerciseModal';
import AppModal from '@/components/modals/BaseModal';
import { useLibraryAppearance } from '../hooks/use-library-appearance';
import type { LibraryController } from '../hooks/use-library-controller';

export function LibraryExerciseDialogs({ controller }: { controller: LibraryController }) {
  const { rawColors } = useLibraryAppearance();
  const { isActionModalVisible, closeActionModal, selectedExercise, setEditModalVisible, setVariationsModalVisible,
    setDeleteConfirmVisible, isEditModalVisible, reloadExercises, isDeleteConfirmVisible, handleDelete } = controller;
  return (<>
    <AppModal visible={isActionModalVisible} onClose={closeActionModal} maxWidth={400}>
      {selectedExercise ? (
        <>
          <Text className="text-xl font-bold mb-5 text-foreground">
            {selectedExercise.name}
          </Text>
          <Pressable
            onPress={() => {
              closeActionModal();
              setEditModalVisible(true);
            }}
            className="flex-row items-center p-3.5 rounded-xl mb-2 gap-3 bg-surface-secondary active:opacity-80"

          >
            <MaterialCommunityIcons name="pencil-outline" size={22} color={rawColors.primary} />
            <Text className="text-[15px] font-medium text-foreground">Edit Details</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              closeActionModal();
              setVariationsModalVisible(true);
            }}
            className="flex-row items-center p-3.5 rounded-xl mb-2 gap-3 bg-surface-secondary active:opacity-80"

          >
            <MaterialCommunityIcons name="swap-vertical" size={22} color={rawColors.primary} />
            <Text className="text-[15px] font-medium text-foreground">Variations</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              closeActionModal();
              setDeleteConfirmVisible(true);
            }}
            className="flex-row items-center p-3.5 rounded-xl mb-2 gap-3 bg-surface-secondary active:opacity-80"

          >
            <MaterialCommunityIcons name="delete-outline" size={22} color={rawColors.destructive} />
            <Text className="text-[15px] font-medium text-destructive">Delete</Text>
          </Pressable>
        </>
      ) : null}
    </AppModal>
    <AddExerciseModal
      visible={isEditModalVisible}
      exercise={selectedExercise}
      onDismiss={() => {
        setEditModalVisible(false);
      }}
      onSaved={reloadExercises}
    />
    <AppModal
      visible={isDeleteConfirmVisible}
      onClose={() => {
        setDeleteConfirmVisible(false);
      }}
      maxWidth={380}
    >
      <Text
        style={{
          color: rawColors.foreground,
          fontSize: 22,
          fontWeight: "700",
        }}
      >
        Delete Exercise?
      </Text>
      <Text
        style={{
          marginTop: 8,
          color: rawColors.foregroundSecondary,
          fontSize: 14,
          lineHeight: 20,
        }}
      >
        This will permanently delete{" "}
        <Text style={{ color: rawColors.foreground, fontWeight: "700" }}>
          {selectedExercise?.name}
        </Text>
        . This action cannot be undone.
      </Text>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
        <Pressable
          onPress={() => {
            setDeleteConfirmVisible(false);
          }}
          className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary active:opacity-80"
        >
          <Text className="text-base font-semibold text-foreground-secondary">
            Cancel
          </Text>
        </Pressable>

        <Pressable
          onPress={handleDelete}
          className="flex-1 flex-row gap-2 items-center justify-center p-3.5 rounded-lg bg-destructive active:opacity-80"
        >
          <MaterialCommunityIcons name="delete" size={18} color={rawColors.primaryForeground} />
          <Text className="text-base font-semibold text-primary-foreground">
            Delete
          </Text>
        </Pressable>
      </View>
    </AppModal>
  </>);
}
