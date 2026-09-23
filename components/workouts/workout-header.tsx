import { Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '@/lib/theme/ThemeContext';
import { IconButton } from './workout-ui';

/** The existing LiftingLog barbell/book mark, rendered crisply at header size. */
export function LiftingLogMark() {
  const { rawColors } = useTheme();
  return <Svg width={32} height={32} viewBox="0 0 48 48" accessibilityLabel="LiftingLog logo">
    <Rect x={1} y={16} width={4} height={16} rx={2} fill={rawColors.foreground} />
    <Rect x={7} y={10} width={5} height={27} rx={2} fill={rawColors.foreground} />
    <Rect x={36} y={10} width={5} height={27} rx={2} fill={rawColors.foreground} />
    <Rect x={43} y={16} width={4} height={16} rx={2} fill={rawColors.foreground} />
    <Path d="M16 7v30h6M32 7v30h-6M13 40q0 4 9 4M35 40q0 4-9 4" stroke={rawColors.foreground} strokeWidth={4} strokeLinecap="round" fill="none" />
    <Path d="m19 23 4 4 7-10" stroke={rawColors.primary} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>;
}

export function WorkoutHeader({ onCalculators, onStats }: { onCalculators: () => void; onStats: () => void }) {
  const { rawColors } = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <LiftingLogMark />
      <Text style={{ fontSize: 21, fontWeight: '700', letterSpacing: -0.7, color: rawColors.foreground }}>LiftingLog</Text>
    </View>
    <View style={{ flexDirection: 'row', gap: 2 }}>
      <IconButton icon="calculator-variant-outline" label="Open calculators" onPress={onCalculators} />
      <IconButton icon="chart-box-outline" label="Open quick stats" onPress={onStats} />
    </View>
  </View>;
}
