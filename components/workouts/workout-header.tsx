import { Text, View } from 'react-native';
import { BrandMark } from '@/components/design-system/brand-mark';
import { useTheme } from '@/lib/theme/ThemeContext';
import { IconButton } from './workout-ui';

export function WorkoutHeader({ onCalculators, onStats }: { onCalculators: () => void; onStats: () => void }) {
  const { rawColors } = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <BrandMark />
      <Text accessibilityLabel="LiftingLog" style={{ flexShrink: 1, minWidth: 0, fontSize: 21, fontWeight: '700', letterSpacing: -0.4, color: rawColors.foreground }}>{'Lifting​Log'}</Text>
    </View>
    <View style={{ flexShrink: 0, flexDirection: 'row', gap: 4 }}>
      <IconButton icon="calculator" label="Open calculators" onPress={onCalculators} />
      <IconButton icon="chart" label="Open quick stats" onPress={onStats} />
    </View>
  </View>;
}
