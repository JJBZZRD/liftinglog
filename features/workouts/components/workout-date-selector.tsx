import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { IconButton } from '@/components/workouts/workout-ui';
import { radius, sizes, space } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { dateLabel } from '../workout-types';

export function WorkoutDateSelector({ date, onChange, onCalendar }: {
  date: Date; onChange: (date: Date) => void; onCalendar: () => void;
}) {
  const { rawColors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const availableWidth = Math.min(width, sizes.pageMaxWidth) - space[22] * 2;
  const dateWidth = 112 * fontScale;
  // Reserve both text controls even on today. The Calendar allowance includes its
  // icon, gap, padding, and a conservative 60 dp label at the default font size.
  const singleRowMinimum = sizes.touchTarget * 2 + dateWidth + 88 * fontScale
    + space[4] + 19 + 7 + space[12] * 2 + 60 * fontScale;
  const compact = availableWidth < singleRowMinimum;
  const compactDateWidth = Math.max(1, Math.min(dateWidth, availableWidth - sizes.touchTarget * 2));
  const move = (days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    onChange(next);
  };
  const isToday = date.toDateString() === new Date().toDateString();

  const dateNavigation = (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: compact ? 0 : 1 }}>
          <IconButton icon="chevron-left" label="Previous day" variant="secondary" onPress={() => move(-1)} />
          <Text accessibilityRole="header" style={{ width: compact ? compactDateWidth : dateWidth, color: rawColors.foreground, fontSize: 17, lineHeight: 24, fontWeight: '600', fontVariant: ['tabular-nums'], textAlign: 'center', flexShrink: compact ? 0 : 1, paddingHorizontal: 2 }}>
            {dateLabel(date)}
          </Text>
          <IconButton icon="chevron-right" label="Next day" variant="secondary" onPress={() => move(1)} />
        </View>
  );
  const todayAction = (
        // Reserve this space on today too, so hiding the action never shifts the controls.
        <View style={compact ? { flex: 1, minWidth: 0, minHeight: 44 } : { flex: 1, minWidth: 88, minHeight: 44 }}>
          {(compact || !isToday) && (
            <Pressable onPress={() => onChange(new Date())} accessibilityRole="button" accessibilityLabel="Back to today"
              disabled={isToday} pointerEvents={isToday ? 'none' : undefined}
              accessibilityElementsHidden={isToday} importantForAccessibility={isToday ? 'no-hide-descendants' : 'auto'}
              className="active:opacity-70" style={{ minHeight: 44, alignItems: compact ? 'flex-start' : 'center', justifyContent: 'center', paddingHorizontal: 4, opacity: isToday ? 0 : undefined }}>
              {/* In the wide row, include half its gap to center between the visible button edges. */}
              <Text style={{ color: rawColors.primary, fontWeight: '600', fontSize: 13, textAlign: compact ? 'left' : 'center', transform: compact ? undefined : [{ translateX: space[4] / 2 }] }}>Back to today</Text>
            </Pressable>
          )}
        </View>
  );
  const calendarAction = (
      <Pressable accessibilityRole="button" accessibilityLabel="Choose workout date" onPress={onCalendar}
        className="active:opacity-70"
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, gap: 7, paddingHorizontal: 12, borderRadius: radius.control, backgroundColor: rawColors.surfaceSecondary, maxWidth: compact ? '50%' : undefined }}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={19} color={rawColors.foregroundSecondary} />
        <Text style={{ color: rawColors.foregroundSecondary, fontSize: 14, fontWeight: '600', flexShrink: compact ? 1 : undefined }}>Calendar</Text>
      </Pressable>
  );

  if (compact) {
    return <View style={{ gap: space[8] }}>
      <View style={{ alignItems: 'center' }}>{dateNavigation}</View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[4] }}>
        {todayAction}
        {calendarAction}
      </View>
    </View>;
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1, maxWidth: '100%' }}>
        {dateNavigation}
        {todayAction}
      </View>
      {calendarAction}
    </View>
  );
}
