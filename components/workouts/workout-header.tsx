import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { useTheme } from '@/lib/theme/ThemeContext';
import { IconButton } from './workout-ui';

/** Supplied brand artwork, with its original aspect ratio and a theme-aware tint. */
export function LiftingLogMark() {
  const { rawColors } = useTheme();
  return <Image source={require('@/assets/branding/liftinglog-logo.svg')}
    style={{ width: 44, flexShrink: 0, aspectRatio: 1095 / 690 }} contentFit="contain"
    tintColor={rawColors.primary} accessible accessibilityLabel="LiftingLog logo" />;
}

export function WorkoutHeader({ onCalculators, onStats }: { onCalculators: () => void; onStats: () => void }) {
  const { rawColors } = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 10 }}>
    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <LiftingLogMark />
      <Text accessibilityLabel="LiftingLog" style={{ flexShrink: 1, minWidth: 0, fontSize: 21, fontWeight: '700', letterSpacing: -0.7, color: rawColors.foreground }}>{'Lifting\u200BLog'}</Text>
    </View>
    <View style={{ flexShrink: 0, flexDirection: 'row', gap: 2 }}>
      <IconButton icon="calculator-variant-outline" label="Open calculators" onPress={onCalculators} />
      <IconButton icon="chart-box-outline" label="Open quick stats" onPress={onStats} />
    </View>
  </View>;
}
