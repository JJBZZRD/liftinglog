import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/lib/theme/ThemeContext';

export function IconButton({ icon, label, onPress, disabled = false }: {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string; onPress: () => void; disabled?: boolean;
}) {
  const { rawColors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      className="active:opacity-60"
      style={{ width: 44, height: 44, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.35 : 1 }}>
      <MaterialCommunityIcons name={icon} size={23} color={rawColors.foreground} />
    </Pressable>
  );
}

export function WorkoutStatus({ active }: { active: boolean }) {
  const { rawColors } = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <View style={{ width: 6, height: 6, borderRadius: 3,
      backgroundColor: active ? rawColors.primary : rawColors.foregroundMuted }} />
    <Text style={{ color: active ? rawColors.primary : rawColors.foregroundSecondary,
      fontSize: 12, fontWeight: '600' }}>{active ? 'In progress' : 'Completed'}</Text>
  </View>;
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  const { rawColors } = useTheme();
  return <View style={{ flex: 1, gap: 6 }}>
    <Text selectable style={{ color: rawColors.foreground, fontSize: 25,
      fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: -0.7 }}>{value}</Text>
    <Text style={{ color: rawColors.foregroundSecondary, fontSize: 11,
      letterSpacing: 0.6 }}>{label}</Text>
  </View>;
}
