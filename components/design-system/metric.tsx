import { Text, View } from 'react-native';
import { space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';

export function Metric({ label, value }: { label: string; value: string | number }) {
  const { rawColors } = useTheme();
  return <View style={{ flex: 1, gap: space[6] }}>
    <Text selectable style={{ color: rawColors.foreground, ...typography.metricValue }}>{value}</Text>
    <Text style={{ color: rawColors.foregroundSecondary, ...typography.metricLabel }}>{label}</Text>
  </View>;
}
