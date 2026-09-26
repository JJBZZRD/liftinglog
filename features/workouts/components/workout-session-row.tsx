import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { MetricStrip } from '@/components/design-system/metric-strip';
import { Icon } from '@/components/design-system/icon';
import { HoldProgress, usePressAndHold } from '@/components/design-system/press-and-hold';
import { StatusPill } from '@/components/design-system/status-pill';
import { useUnitPreference } from '@/lib/contexts/UnitPreferenceContext';
import { radius, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { formatVolumeFromKg, getWeightUnitLabel } from '@/lib/utils/units';
import { timeLabel, workoutTitle, type WorkoutSummary } from '../workout-types';

/** The metric-strip workout card. Tap opens the workout; press and hold asks to delete it. */
export function WorkoutSessionRow({ workout, index, onPress, onHold }: {
  workout: WorkoutSummary; index: number; onPress: () => void; onHold: () => void;
}) {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const active = workout.completedAt === null;
  const { progress, holdStyle, pressableProps } = usePressAndHold({ onHold, onPress, holdLabel: 'Delete workout' });
  const title = workoutTitle(workout);
  const time = timeLabel(workout.startedAt);
  // Android wrapped text can report its final height after a layout transition
  // captures the row. Keep native height updates immediate to avoid overlapping cards.
  return (
    <Animated.View entering={FadeInDown.duration(240).delay(Math.min(index, 5) * 40).reduceMotion(ReduceMotion.System)}>
      <Animated.View style={holdStyle}>
        <Pressable accessibilityRole="button" {...pressableProps}
          accessibilityLabel={`${title}, ${active ? 'in progress' : 'completed'}, ${time}, ${workout.exerciseCount} exercises, ${workout.setCount} sets`}
          className="active:opacity-80"
          style={{ minWidth: 0, overflow: 'hidden', backgroundColor: rawColors.surface, borderWidth: 1, borderColor: rawColors.border, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: space[16], gap: 10 }}>
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[12], rowGap: space[4] }}>
              <StatusPill status={active ? 'live' : 'completed'} />
              <Text style={{ marginLeft: 'auto', color: rawColors.foregroundMuted, ...typography.caption, fontVariant: ['tabular-nums'] }}>{time}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[12] }}>
              <Text numberOfLines={2} style={{ flex: 1, minWidth: 0, color: rawColors.foreground, ...typography.cardTitle }}>{title}</Text>
              <Icon name="chevron-right" size={22} color={rawColors.foregroundMuted} />
            </View>
            <MetricStrip items={[
              { value: workout.exerciseCount, label: workout.exerciseCount === 1 ? 'exercise' : 'exercises' },
              { value: workout.setCount, label: workout.setCount === 1 ? 'set' : 'sets' },
              { value: formatVolumeFromKg(workout.volumeKg, unitPreference, { abbreviate: true }), label: getWeightUnitLabel(unitPreference) },
            ]} />
          </View>
          <HoldProgress progress={progress} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
