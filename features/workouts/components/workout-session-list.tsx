import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurTargetView } from 'expo-blur';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { ScrollFade } from '@/components/workouts/scroll-fade';
import { radius, space, typography } from '@/lib/design-system/tokens';
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
  const scrollMetrics = useRef({ offset: 0, contentHeight: 0, viewportHeight: 0 });
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const updateEdges = () => {
    const { offset, contentHeight, viewportHeight } = scrollMetrics.current;
    const top = offset > space[8];
    const bottom = viewportHeight > 0 && contentHeight - viewportHeight - Math.max(0, offset) > space[8];
    setEdges((current) => current.top === top && current.bottom === bottom ? current : { top, bottom });
  };

  return (
    <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <BlurTargetView ref={blurTarget} style={{ flex: 1, minHeight: 0, backgroundColor: rawColors.background }}>
        <ScrollView accessibilityLabel="Workouts list" contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false} showsVerticalScrollIndicator={false}
          style={{ flex: 1, minHeight: 0 }}
          onLayout={(event) => { scrollMetrics.current.viewportHeight = event.nativeEvent.layout.height; updateEdges(); }}
          onContentSizeChange={(_, height) => { scrollMetrics.current.contentHeight = height; updateEdges(); }}
          onScroll={(event) => { scrollMetrics.current.offset = event.nativeEvent.contentOffset.y; updateEdges(); }}
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
        </ScrollView>
      </BlurTargetView>
      <ScrollFade edge="top" blurTarget={blurTarget} visible={edges.top} />
      <ScrollFade edge="bottom" blurTarget={blurTarget} visible={edges.bottom} />
    </View>
  );
}
