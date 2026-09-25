import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { useTheme } from '@/lib/theme/ThemeContext';
import { IconButton } from './workout-ui';

/** Supplied brand artwork, with its original aspect ratio and a theme-aware tint. */
export function LiftingLogMark() {
  const { rawColors } = useTheme();
  return <Image source={require('@/assets/branding/liftinglog-logo.svg')}
    style={{ width: 44, aspectRatio: 1095 / 690 }} contentFit="contain"
    tintColor={rawColors.primary} accessible accessibilityLabel="LiftingLog logo" />;
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
