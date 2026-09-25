import { Keyboard, ScrollView, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { BlurTargetView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AddExerciseModal from '@/components/AddExerciseModal';
import { DesignSystemProvider } from '@/components/design-system/design-system-provider';
import { FrostedModalProvider } from '@/components/modals/frosted-modal-context';
import { ActiveWorkoutShortcut } from '@/features/workouts/components/active-workout-shortcut';
import { useActiveWorkoutShortcut } from '@/features/workouts/hooks/use-active-workout-shortcut';
import { sizes, space } from '@/lib/design-system/tokens';
import { LibraryHeader } from '../components/library-header';
import { LibrarySections } from '../components/library-sections';
import { LibrarySortDialog } from '../components/library-sort-dialog';
import { LibraryExerciseDialogs } from '../components/library-exercise-dialogs';
import { LibraryVariationManager } from '../components/library-variation-manager';
import { LibraryVariationDialogs } from '../components/library-variation-dialogs';
import { useLibraryAppearance } from '../hooks/use-library-appearance';
import { useLibraryController } from '../hooks/use-library-controller';
import { useLibraryQuery } from '../hooks/use-library-query';

function ExerciseLibraryContent() {
  const { screenBackground } = useLibraryAppearance();
  const insets = useSafeAreaInsets();
  const controller = useLibraryController();
  const query = useLibraryQuery(controller.items);
  const blurTarget = useRef<View>(null);
  const listTarget = useRef<View>(null);
  const { workout, openWorkout } = useActiveWorkoutShortcut();
  const [shortcutHeight, setShortcutHeight] = useState(72);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  // Keep the shortcut above the existing 64 dp floating tab bar and safe area.
  const shortcutBottom = space[24] + 64 + Math.max(insets.bottom, space[16]);
  const listBottom = shortcutBottom + (workout ? shortcutHeight + space[16] : space[16]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return (
    <FrostedModalProvider blurTarget={blurTarget}>
      <View style={{ flex: 1, backgroundColor: screenBackground }}>
        <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
          <BlurTargetView ref={listTarget} style={{ flex: 1 }}>
            <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: listBottom }}>
              <LibraryHeader query={query} onAdd={() => controller.setAddModalVisible(true)} />
              <LibrarySections controller={controller} query={query} />
            </ScrollView>
          </BlurTargetView>
          {workout && !keyboardVisible && <View pointerEvents="box-none" style={{
            position: 'absolute', left: 0, right: 0, bottom: shortcutBottom, alignItems: 'center', paddingHorizontal: space[20],
          }}>
            <View style={{ width: '100%', maxWidth: sizes.pageMaxWidth }}>
              <ActiveWorkoutShortcut workout={workout} blurTarget={listTarget} onPress={openWorkout}
                onLayout={(event) => setShortcutHeight(event.nativeEvent.layout.height)} />
            </View>
          </View>}
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

export default function ExerciseLibraryScreen() {
  return <DesignSystemProvider><ExerciseLibraryContent /></DesignSystemProvider>;
}
