import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable } from 'react-native';
import { opacity, radius, sizes } from '@/lib/design-system/tokens';
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
      style={{ width: sizes.touchTarget, height: sizes.touchTarget, borderRadius: radius.icon,
        alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? opacity.disabled : 1 }}>
      <MaterialCommunityIcons name={icon} size={sizes.icon} color={rawColors.foreground} />
    </Pressable>
  );
}
