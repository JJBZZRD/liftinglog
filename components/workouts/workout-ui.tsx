import { Text, View } from 'react-native';
import { useTheme } from '@/lib/theme/ThemeContext';

export { IconButton } from '@/components/design-system/icon-button';
export { Metric } from '@/components/design-system/metric';

export function WorkoutStatus({ active }: { active: boolean }) {
  const { rawColors } = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <View style={{ width: 6, height: 6, borderRadius: 3,
      backgroundColor: active ? rawColors.primary : rawColors.foregroundMuted }} />
    <Text style={{ color: active ? rawColors.primary : rawColors.foregroundSecondary,
      fontSize: 12, fontWeight: '600' }}>{active ? 'In progress' : 'Completed'}</Text>
  </View>;
}
