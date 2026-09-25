import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { IconButton } from '@/components/workouts/workout-ui';
import { useTheme } from '@/lib/theme/ThemeContext';
import { dateLabel } from '../workout-types';

export function WorkoutDateSelector({ date, onChange, onCalendar }: {
  date: Date; onChange: (date: Date) => void; onCalendar: () => void;
}) {
  const { rawColors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const move = (days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    onChange(next);
  };
  const isToday = date.toDateString() === new Date().toDateString();

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, maxWidth: '100%', gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
          <IconButton icon="chevron-left" label="Previous day" onPress={() => move(-1)} />
          <Text accessibilityRole="header" style={{ width: 112 * fontScale, color: rawColors.foreground, fontSize: 17, lineHeight: 24, fontWeight: '600', fontVariant: ['tabular-nums'], textAlign: 'center', flexShrink: 1, paddingHorizontal: 2 }}>
            {dateLabel(date)}
          </Text>
          <IconButton icon="chevron-right" label="Next day" onPress={() => move(1)} />
        </View>
        {/* Reserve this space on today too, so hiding the action never shifts the controls. */}
        <View style={{ width: 88, minHeight: 44 }}>
          {!isToday && (
            <Pressable onPress={() => onChange(new Date())} accessibilityRole="button" accessibilityLabel="Back to today"
              className="active:opacity-70" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text style={{ color: rawColors.primary, fontWeight: '600', fontSize: 13 }}>Back to today</Text>
            </Pressable>
          )}
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose workout date" onPress={onCalendar}
        className="active:opacity-70"
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, gap: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: rawColors.surfaceSecondary }}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={19} color={rawColors.foregroundSecondary} />
        <Text style={{ color: rawColors.foregroundSecondary, fontSize: 14, fontWeight: '600' }}>Calendar</Text>
      </Pressable>
    </View>
  );
}
