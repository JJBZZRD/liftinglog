import { Text, View } from 'react-native';
import { radius, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';

export type MetricStripItem = { value: string | number; label: string };

/** A row of small value/label chips, such as a workout card's exercises, sets and volume. */
export function MetricStrip({ items }: { items: MetricStripItem[] }) {
  const { rawColors } = useTheme();
  return <View style={{ flexDirection: 'row', gap: space[8] }}>
    {items.map((item) => (
      // The label wraps under the value at large text sizes instead of truncating.
      <View key={item.label} accessible accessibilityLabel={`${item.value} ${item.label}`}
        style={{
          flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 5,
          backgroundColor: rawColors.surfaceSecondary, borderRadius: radius.chip, paddingVertical: space[6], paddingHorizontal: 10,
        }}>
        <Text style={{ color: rawColors.foreground, ...typography.chipValue }}>{item.value}</Text>
        <Text style={{ color: rawColors.foregroundSecondary, ...typography.caption }}>{item.label}</Text>
      </View>
    ))}
  </View>;
}
