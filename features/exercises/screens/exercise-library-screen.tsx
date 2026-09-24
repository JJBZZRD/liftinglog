import { ScrollView, View } from 'react-native';
import { useRef } from 'react';
import { BlurTargetView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AddExerciseModal from '@/components/AddExerciseModal';
import { FrostedModalProvider } from '@/components/modals/frosted-modal-context';
import { LibraryHeader } from '../components/library-header';
import { LibrarySections } from '../components/library-sections';
import { LibrarySortDialog } from '../components/library-sort-dialog';
import { LibraryExerciseDialogs } from '../components/library-exercise-dialogs';
import { LibraryVariationManager } from '../components/library-variation-manager';
import { LibraryVariationDialogs } from '../components/library-variation-dialogs';
import { useLibraryAppearance } from '../hooks/use-library-appearance';
import { useLibraryController } from '../hooks/use-library-controller';
import { useLibraryQuery } from '../hooks/use-library-query';

export default function ExerciseLibraryScreen() {
  const { screenBackground } = useLibraryAppearance();
  const insets = useSafeAreaInsets();
  const controller = useLibraryController();
  const query = useLibraryQuery(controller.items);
  const blurTarget = useRef<View>(null);
  return (
    <FrostedModalProvider blurTarget={blurTarget}>
      <View style={{ flex: 1, backgroundColor: screenBackground }}>
        <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
          <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 144, 164) }}>
            <LibraryHeader query={query} />
            <LibrarySections controller={controller} query={query} />
          </ScrollView>
        </BlurTargetView>
        <AddExerciseModal visible={controller.isAddModalVisible} onDismiss={controller.closeAddExerciseModal} onSaved={controller.reloadExercises} />
        <LibrarySortDialog query={query} />
        <LibraryExerciseDialogs controller={controller} />
        <LibraryVariationManager controller={controller} />
        <LibraryVariationDialogs controller={controller} />
      </View>
    </FrostedModalProvider>
  );
}
