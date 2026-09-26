import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Icon } from '@/components/design-system/icon';
import { LiveDot } from '@/components/design-system/status-pill';
import { ScrollFade } from '@/components/workouts/scroll-fade';
import { radius, sizes, space, typography } from '@/lib/design-system/tokens';
import { useScrollEdgeFades } from '@/lib/design-system/use-scroll-edge-fades';
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
  /** Press and hold on a card: ask to delete that workout. */
  onDelete: (workout: WorkoutSummary) => void;
  showHealthMetrics: boolean;
  onHealthMetrics: () => void;
};

/** Key this viewport by the selected day to reset native scroll position and fades together. */
export function WorkoutSessionList({ workouts, activeElsewhere, loading, error, onRefresh, onOpen, onDelete, showHealthMetrics, onHealthMetrics }: WorkoutSessionListProps) {
  const { rawColors } = useTheme();
  const { topOpacity, bottomOpacity, scrollProps } = useScrollEdgeFades();

  return (
    <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <View style={{ flex: 1, minHeight: 0, backgroundColor: rawColors.background }}>
        <Animated.ScrollView accessibilityLabel="Workouts list" contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false} showsVerticalScrollIndicator={false}
          style={{ flex: 1, minHeight: 0 }}
          {...scrollProps}
          refreshControl={<RefreshControl refreshing={loading && workouts.length > 0} onRefresh={onRefresh} tintColor={rawColors.primary} />}
          contentContainerStyle={{ gap: space[12], paddingBottom: space[16] }}>
          {activeElsewhere && <Pressable accessibilityRole="button" onPress={() => onOpen(activeElsewhere.id)}
            accessibilityLabel={`Continue active workout, ${workoutTitle(activeElsewhere)}, in progress since ${dateLabel(new Date(activeElsewhere.startedAt))}`}
            className="active:opacity-70" style={{
              flexDirection: 'row', gap: space[12], alignItems: 'center', minHeight: sizes.liveStrip,
              paddingHorizontal: space[16], paddingVertical: 10, borderWidth: 1, borderColor: rawColors.border,
              borderRadius: radius.card, backgroundColor: rawColors.surface,
            }}>
            <LiveDot />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text numberOfLines={1} style={{ color: rawColors.foreground, fontSize: 15, fontWeight: '600' }}>{workoutTitle(activeElsewhere)}</Text>
              <Text numberOfLines={1} style={{ color: rawColors.liveInk, ...typography.pill }}>In progress · {dateLabel(new Date(activeElsewhere.startedAt))}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], flexShrink: 0 }}>
              <Text style={{ color: rawColors.foreground, fontSize: 14, fontWeight: '700' }}>Return</Text>
              <Icon name="chevron-right" size={18} color={rawColors.foreground} />
            </View>
          </Pressable>}
          {error && <WorkoutError message={error} onRetry={onRefresh} />}
          {loading && workouts.length === 0 ? <ActivityIndicator style={{ padding: space[20] * 2 }} color={rawColors.primary} />
            : workouts.map((workout, index) => <WorkoutSessionRow key={workout.id} workout={workout} index={index} onPress={() => onOpen(workout.id)} onHold={() => onDelete(workout)} />)}
          {!loading && !error && workouts.length === 0 && <WorkoutEmpty title="A fresh page" description="No workouts on this day yet. Start a session and build your next personal best." />}
          {showHealthMetrics && <View style={{ borderTopWidth: 1, borderColor: rawColors.borderLight, paddingTop: space[16], gap: space[4] }}>
            <Pressable accessibilityRole="button" onPress={onHealthMetrics} style={{ flexDirection: 'row', alignItems: 'center', gap: space[12], paddingVertical: space[16] }}>
              <MaterialCommunityIcons name="heart-pulse" size={22} color={rawColors.foregroundSecondary} />
              <Text style={{ flex: 1, color: rawColors.foregroundSecondary, fontSize: 15, fontWeight: '600' }}>Health metrics</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={rawColors.foregroundMuted} />
            </Pressable>
          </View>}
        </Animated.ScrollView>
      </View>
      <ScrollFade edge="top" opacity={topOpacity} />
      <ScrollFade edge="bottom" opacity={bottomOpacity} />
    </View>
  );
}
