import { Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/design-system/icon';
import { IconButton } from '@/components/workouts/workout-ui';
import { radius, sizes, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { dateLabel, relativeDayLabel } from '../workout-types';

/**
 * Previous day, the date itself (which opens the calendar), next day. The calendar
 * sheet has the Today action, so nothing appears or disappears as the date changes.
 */
export function WorkoutDateSelector({ date, onChange, onCalendar }: {
  date: Date; onChange: (date: Date) => void; onCalendar: () => void;
}) {
  const { rawColors } = useTheme();
  const move = (days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    onChange(next);
  };
  const label = dateLabel(date);
  const caption = relativeDayLabel(date);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[8], minWidth: 0 }}>
      <IconButton icon="chevron-left" label="Previous day" variant="secondary" onPress={() => move(-1)} />
      <Pressable accessibilityRole="button" accessibilityLabel={caption ? `${label}, ${caption}` : label}
        accessibilityHint="Opens the calendar to choose a day" onPress={onCalendar}
        className="active:opacity-70"
        style={{
          flex: 1, minWidth: 0, minHeight: sizes.touchTarget, borderRadius: radius.control, borderWidth: 1,
          borderColor: rawColors.controlBorder, backgroundColor: rawColors.control,
          // A wrapping row packs its lines at the top unless alignContent centres them.
          flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', alignContent: 'center', justifyContent: 'center',
          columnGap: space[8], rowGap: 0, paddingHorizontal: space[8], paddingVertical: space[4],
        }}>
        <Icon name="calendar" size={18} color={rawColors.foregroundSecondary} />
        <Text style={{ color: rawColors.foreground, ...typography.rowTitle, fontVariant: ['tabular-nums'] }}>{label}</Text>
        {caption && <Text style={{ color: rawColors.foregroundMuted, ...typography.caption, fontWeight: '500' }}>{caption}</Text>}
      </Pressable>
      <IconButton icon="chevron-right" label="Next day" variant="secondary" onPress={() => move(1)} />
    </View>
  );
}
