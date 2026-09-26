import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/design-system/icon';
import { LiveDot } from '@/components/design-system/status-pill';
import { sizes, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { elapsedLabel, workoutTitle, type WorkoutSummary } from '../workout-types';

/** Re-render once a minute so the elapsed time stays current while the strip is shown. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The in-progress workout, docked above the tab bar with a Return action. */
export function LiveWorkoutStrip({ workout, onPress }: { workout: WorkoutSummary; onPress: () => void }) {
  const { rawColors } = useTheme();
  const now = useMinuteClock();
  const title = workoutTitle(workout);
  const detail = `In progress · ${elapsedLabel(workout.startedAt, now)} · ${workout.exerciseCount} ${workout.exerciseCount === 1 ? 'exercise' : 'exercises'}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Return to ${title}. ${detail}`} onPress={onPress}
      className="active:bg-pressed"
      style={{
        minHeight: sizes.liveStrip, flexDirection: 'row', alignItems: 'center', gap: space[12],
        paddingHorizontal: space[16], paddingVertical: 10, backgroundColor: rawColors.surface,
        borderTopWidth: 1, borderColor: rawColors.border,
      }}>
      <LiveDot />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text numberOfLines={1} style={{ color: rawColors.foreground, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: rawColors.liveInk, ...typography.pill, fontVariant: ['tabular-nums'] }}>{detail}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], flexShrink: 0 }}>
        <Text style={{ color: rawColors.foreground, fontSize: 14, fontWeight: '700' }}>Return</Text>
        <Icon name="chevron-right" size={18} color={rawColors.foreground} />
      </View>
    </Pressable>
  );
}
