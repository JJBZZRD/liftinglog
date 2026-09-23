import { Pressable, Text, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useReducedMotion } from 'react-native-reanimated';
import { BaseModal } from '@/components/modals/BaseModal';
import { useTheme } from '@/lib/theme/ThemeContext';

export function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function WorkoutCalendar({ visible, date, onSelect, onClose }: {
  visible: boolean; date: Date; onSelect: (date: Date) => void; onClose: () => void;
}) {
  const { rawColors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  return <BaseModal visible={visible} onClose={onClose} maxWidth={420} animationType={reducedMotion ? 'none' : 'fade'}>
    <Text className="text-xl font-semibold text-foreground mb-3">Choose a day</Text>
    {visible && <Calendar key={`${localDayKey(date)}-${isDark}`} current={localDayKey(date)} enableSwipeMonths
      markedDates={{ [localDayKey(date)]: { selected: true, selectedColor: rawColors.primary } }}
      onDayPress={({ year, month, day }) => { onSelect(new Date(year, month - 1, day, 12)); onClose(); }}
      theme={{ backgroundColor: rawColors.surface, calendarBackground: rawColors.surface,
        dayTextColor: rawColors.foreground, monthTextColor: rawColors.foreground,
        textDisabledColor: rawColors.foregroundMuted, textSectionTitleColor: rawColors.foregroundSecondary,
        todayTextColor: rawColors.primary, arrowColor: rawColors.primary,
        selectedDayTextColor: rawColors.primaryForeground, textDayFontSize: 15 }} />}
    <View className="flex-row gap-3 mt-4">
      <Pressable accessibilityRole="button" onPress={onClose} className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary">
        <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => { onSelect(new Date()); onClose(); }} className="flex-1 items-center justify-center p-3.5 rounded-lg bg-primary">
        <Text className="text-base font-semibold text-primary-foreground">Today</Text>
      </Pressable>
    </View>
  </BaseModal>;
}
