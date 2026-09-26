import { BlurTargetView } from 'expo-blur';
import { router } from 'expo-router';
import { useRef } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AddExerciseModal from '@/components/AddExerciseModal';
import { DesignSystemProvider } from '@/components/design-system/design-system-provider';
import { FrostedModalProvider } from '@/components/modals/frosted-modal-context';
import { ScrollFade } from '@/components/workouts/scroll-fade';
import { useActiveWorkoutShortcut } from '@/features/workouts/hooks/use-active-workout-shortcut';
import type { WorkoutExercise } from '@/features/workouts/workout-types';
import { space } from '@/lib/design-system/tokens';
import { useResponsiveLayout } from '@/lib/design-system/use-responsive-layout';
import { useScrollEdgeFades } from '@/lib/design-system/use-scroll-edge-fades';
import { useTheme } from '@/lib/theme/ThemeContext';
import { setSelectedWorkoutId } from '@/lib/workouts/selection-store';
import { LibraryHeader } from '../components/library-header';
import { LibrarySections } from '../components/library-sections';
import { LibrarySortDialog } from '../components/library-sort-dialog';
import { LibraryExerciseDialogs } from '../components/library-exercise-dialogs';
import { LibraryVariationManager } from '../components/library-variation-manager';
import { LibraryVariationDialogs } from '../components/library-variation-dialogs';
import { LibraryWorkoutGroup } from '../components/library-workout-group';
import { useLibraryController } from '../hooks/use-library-controller';
import { useLibraryQuery } from '../hooks/use-library-query';

function ExerciseLibraryContent() {
  const { rawColors } = useTheme();
  const insets = useSafeAreaInsets();
  const { pageWidth, pageGutter } = useResponsiveLayout();
  const controller = useLibraryController();
  const query = useLibraryQuery(controller.items);
  const blurTarget = useRef<View>(null);
  const { workout, openWorkout } = useActiveWorkoutShortcut();
  const { topOpacity, bottomOpacity, scrollProps } = useScrollEdgeFades();
  const openEntry = (entry: WorkoutExercise) => {
    if (!workout) return;
    setSelectedWorkoutId(workout.id);
    router.push({ pathname: '/exercise/[id]', params: { id: String(entry.exerciseId), name: entry.exerciseName, weId: String(entry.id), workoutId: String(workout.id) } });
  };
  return (
    <FrostedModalProvider blurTarget={blurTarget}>
      <View style={{ flex: 1, backgroundColor: rawColors.background }}>
        <BlurTargetView ref={blurTarget} style={{ flex: 1, minHeight: 0, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: rawColors.background }}>
          {/* The docked tab bar sits below this screen and handles the bottom safe area. */}
          <View style={{ flex: 1, minHeight: 0, width: '100%', maxWidth: pageWidth, alignSelf: 'center', paddingHorizontal: pageGutter, paddingTop: insets.top + space[4] }}>
            <View style={{ flexShrink: 0, paddingBottom: space[12] }}>
              <LibraryHeader query={query} onAdd={() => controller.setAddModalVisible(true)} />
            </View>
            <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <Animated.ScrollView accessibilityLabel="Exercise library" showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never" style={{ flex: 1, minHeight: 0 }}
                {...scrollProps} contentContainerStyle={{ gap: space[12], paddingBottom: space[16] }}>
                {workout && <LibraryWorkoutGroup workout={workout} onReturn={openWorkout} onOpenEntry={openEntry} />}
                <LibrarySections controller={controller} query={query} />
              </Animated.ScrollView>
              <ScrollFade edge="top" opacity={topOpacity} />
              <ScrollFade edge="bottom" opacity={bottomOpacity} />
            </View>
          </View>
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
