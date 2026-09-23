import { Pressable, Text, View } from 'react-native';
import { IconButton } from '@/components/workouts/workout-ui';
import { useTheme } from '@/lib/theme/ThemeContext';
import { dateLabel } from '../workout-types';

export function WorkoutDateSelector({ date, onChange, onCalendar }: {
  date: Date; onChange: (date: Date) => void; onCalendar: () => void;
}) {
  const { rawColors } = useTheme();
  const move = (days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    onChange(next);
  };
  const isToday = date.toDateString() === new Date().toDateString();

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <IconButton icon="chevron-left" label="Previous day" onPress={() => move(-1)} />
        <Text accessibilityRole="header" style={{ color: rawColors.foreground, fontSize: 19, fontWeight: '600', textAlign: 'center', flex: 1 }}>
          {dateLabel(date)}
        </Text>
        <IconButton icon="chevron-right" label="Next day" onPress={() => move(1)} />
        <IconButton icon="calendar-blank-outline" label="Choose workout date" onPress={onCalendar} />
      </View>
      {!isToday && (
        <Pressable onPress={() => onChange(new Date())} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}>
          <Text style={{ color: rawColors.primary, fontWeight: '600', fontSize: 13 }}>Back to today</Text>
        </Pressable>
      )}
    </View>
  );
}
