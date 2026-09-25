import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { IconButton } from '@/components/workouts/workout-ui';
import { radius, sizes, space } from '@/lib/design-system/tokens';
import { useContainerWidth } from '@/lib/design-system/use-container-width';
import { useResponsiveLayout } from '@/lib/design-system/use-responsive-layout';
import { useTheme } from '@/lib/theme/ThemeContext';
import { dateLabel } from '../workout-types';

export function WorkoutDateSelector({ date, onChange, onCalendar }: {
  date: Date; onChange: (date: Date) => void; onCalendar: () => void;
}) {
  const { rawColors } = useTheme();
  const { contentWidth, fontScale } = useResponsiveLayout();
  const { width: availableWidth, onLayout } = useContainerWidth(contentWidth);
  // Budget all controls even on today; changing the date must never change modes.
  const fullCalendarWidth = 50 + 60 * fontScale;
  const fullTodayWidth = Math.max(sizes.touchTarget, 88 * fontScale);
  const fullMinimum = sizes.touchTarget * 2 + 112 * fontScale + fullTodayWidth + space[4] + fullCalendarWidth;
  const compactCalendarWidth = 37 + 55 * fontScale;
  const compactTodayWidth = Math.max(sizes.touchTarget, 8 + 36 * fontScale);
  const compactMinimum = sizes.touchTarget * 2 + 100 * fontScale + compactTodayWidth + space[4] + compactCalendarWidth;
  const compact = availableWidth < fullMinimum;
  const stacked = compact && availableWidth < compactMinimum;
  const dateWidth = Math.max(1, Math.min((compact && !stacked ? 100 : 112) * fontScale, availableWidth - sizes.touchTarget * 2));
  const move = (days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    onChange(next);
  };
  const isToday = date.toDateString() === new Date().toDateString();

  const dateNavigation = (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
          <IconButton icon="chevron-left" label="Previous day" variant="secondary" onPress={() => move(-1)} />
          <Text accessibilityRole="header" style={{ width: dateWidth, color: rawColors.foreground, fontSize: compact && !stacked ? 15 : 17, lineHeight: 24, fontWeight: '600', fontVariant: ['tabular-nums'], textAlign: 'center', flexShrink: 0, paddingHorizontal: 2 }}>
            {dateLabel(date)}
          </Text>
          <IconButton icon="chevron-right" label="Next day" variant="secondary" onPress={() => move(1)} />
        </View>
  );
  const todayAction = (
        // Reserve this space on today too, so hiding the action never shifts the controls.
        <View style={{ flex: 1, minWidth: compact ? compactTodayWidth : fullTodayWidth, minHeight: sizes.touchTarget }}>
            <Pressable onPress={() => onChange(new Date())} accessibilityRole="button" accessibilityLabel="Back to today"
              disabled={isToday} pointerEvents={isToday ? 'none' : undefined}
              accessibilityElementsHidden={isToday} importantForAccessibility={isToday ? 'no-hide-descendants' : 'auto'}
              className="active:opacity-70" style={{ minHeight: sizes.touchTarget, alignItems: stacked ? 'flex-start' : 'center', justifyContent: 'center', paddingHorizontal: space[4], opacity: isToday ? 0 : undefined }}>
              {/* In the wide row, include half its gap to center between the visible button edges. */}
              <Text style={{ color: rawColors.primary, fontWeight: '600', fontSize: 13, textAlign: stacked ? 'left' : 'center', transform: stacked ? undefined : [{ translateX: space[4] / 2 }] }}>{compact ? 'Today' : 'Back to today'}</Text>
            </Pressable>
        </View>
  );
  const calendarAction = (
      <Pressable accessibilityRole="button" accessibilityLabel="Choose workout date" onPress={onCalendar}
        className="active:opacity-70"
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: sizes.touchTarget, flexShrink: 0,
          width: stacked ? Math.min(fullCalendarWidth, Math.max(sizes.touchTarget, availableWidth - compactTodayWidth - space[4])) : compact ? compactCalendarWidth : fullCalendarWidth,
          gap: compact && !stacked ? space[4] : 7, paddingHorizontal: compact && !stacked ? space[8] : space[12],
          paddingVertical: space[4], borderRadius: radius.control, backgroundColor: rawColors.surfaceSecondary }}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={compact && !stacked ? 17 : 19} color={rawColors.foregroundSecondary} />
        <Text style={{ color: rawColors.foregroundSecondary, fontSize: compact && !stacked ? 13 : 14, fontWeight: '600', flexShrink: 1 }}>Calendar</Text>
      </Pressable>
  );

  if (stacked) {
    return <View onLayout={onLayout} style={{ gap: space[8], minWidth: 0 }}>
      <View style={{ alignItems: 'center' }}>{dateNavigation}</View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[4] }}>
        {todayAction}
        {calendarAction}
      </View>
    </View>;
  }

  return (
    <View onLayout={onLayout} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[4], minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
        {dateNavigation}
        {todayAction}
      </View>
      {calendarAction}
    </View>
  );
}
