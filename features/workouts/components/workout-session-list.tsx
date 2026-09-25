import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurTargetView } from 'expo-blur';
import { useRef } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { ScrollFade } from '@/components/workouts/scroll-fade';
import { radius, sizes, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { dateLabel, workoutTitle, type WorkoutSummary } from '../workout-types';
import { WorkoutEmpty, WorkoutError } from './workout-feedback';
import { WorkoutSessionRow } from './workout-session-row';

type WorkoutSessionListProps = {
  workouts: WorkoutSummary[];
  activeElsewhere: WorkoutSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpen: (id: number) => void;
  showHealthMetrics: boolean;
  onHealthMetrics: () => void;
};

/** Key this viewport by the selected day to reset native scroll position and fades together. */
export function WorkoutSessionList({ workouts, activeElsewhere, loading, error, onRefresh, onOpen, showHealthMetrics, onHealthMetrics }: WorkoutSessionListProps) {
  const { rawColors } = useTheme();
  const blurTarget = useRef<View>(null);
  const offset = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offset.value = event.contentOffset.y;
  });
  // Opacity follows distance on the UI thread. No threshold, timer, or JS render
  // can leave the glass catching up after a fast swipe or a direction change.
  const topOpacity = useDerivedValue(() => {
    const overflow = Math.max(0, contentHeight.value - viewportHeight.value);
    const distance = Math.max(0, Math.min(offset.value, overflow));
    return viewportHeight.value > 0 ? Math.min(1, distance / sizes.scrollFade) : 0;
  });
  const bottomOpacity = useDerivedValue(() => {
    const overflow = Math.max(0, contentHeight.value - viewportHeight.value);
    const distance = Math.max(0, overflow - Math.max(0, offset.value));
    return viewportHeight.value > 0 ? Math.min(1, distance / sizes.scrollFade) : 0;
  });

  return (
    <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <BlurTargetView ref={blurTarget} style={{ flex: 1, minHeight: 0, backgroundColor: rawColors.background }}>
        <Animated.ScrollView accessibilityLabel="Workouts list" contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false} showsVerticalScrollIndicator={false}
          style={{ flex: 1, minHeight: 0 }}
          onLayout={(event) => { viewportHeight.value = event.nativeEvent.layout.height; }}
          onContentSizeChange={(_, height) => { contentHeight.value = height; }}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={loading && workouts.length > 0} onRefresh={onRefresh} tintColor={rawColors.primary} />}
          contentContainerStyle={{ gap: space[16], paddingBottom: space[16] }}>
          {activeElsewhere && <Pressable accessibilityRole="button" accessibilityLabel="Continue active workout" onPress={() => onOpen(activeElsewhere.id)}
            className="active:opacity-70" style={{ flexDirection: 'row', gap: space[12], alignItems: 'center', borderWidth: 1, borderColor: rawColors.border, padding: space[16], borderRadius: radius.action, backgroundColor: rawColors.surface }}>
            <MaterialCommunityIcons name="play-outline" color={rawColors.primary} size={25} />
            <View style={{ flex: 1, gap: space[4] }}>
              <Text style={{ color: rawColors.primary, ...typography.caption, fontWeight: '600' }}>Continue workout · {dateLabel(new Date(activeElsewhere.startedAt))}</Text>
              <Text numberOfLines={1} style={{ color: rawColors.foreground, fontSize: 15, fontWeight: '600' }}>{workoutTitle(activeElsewhere)}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" color={rawColors.foregroundMuted} size={20} />
          </Pressable>}
          {error && <WorkoutError message={error} onRetry={onRefresh} />}
          {loading && workouts.length === 0 ? <ActivityIndicator style={{ padding: space[20] * 2 }} color={rawColors.primary} />
            : workouts.map((workout, index) => <WorkoutSessionRow key={workout.id} workout={workout} index={index} onPress={() => onOpen(workout.id)} />)}
          {!loading && !error && workouts.length === 0 && <WorkoutEmpty title="A fresh page" description="No workouts on this day yet. Start a session and build your next personal best." />}
          {showHealthMetrics && <View style={{ borderTopWidth: 1, borderColor: rawColors.borderLight, paddingTop: space[16], gap: space[4] }}>
            <Pressable accessibilityRole="button" onPress={onHealthMetrics} style={{ flexDirection: 'row', alignItems: 'center', gap: space[12], paddingVertical: space[16] }}>
              <MaterialCommunityIcons name="heart-pulse" size={22} color={rawColors.foregroundSecondary} />
              <Text style={{ flex: 1, color: rawColors.foregroundSecondary, fontSize: 15, fontWeight: '600' }}>Health metrics</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={rawColors.foregroundMuted} />
            </Pressable>
          </View>}
        </Animated.ScrollView>
      </BlurTargetView>
      <ScrollFade edge="top" blurTarget={blurTarget} opacity={topOpacity} />
      <ScrollFade edge="bottom" blurTarget={blurTarget} opacity={bottomOpacity} />
    </View>
  );
}
