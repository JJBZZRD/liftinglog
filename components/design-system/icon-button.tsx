import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable } from 'react-native';
import { opacity, radius, sizes } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';

export function IconButton({ icon, label, onPress, disabled = false, variant = 'plain' }: {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string; onPress: () => void; disabled?: boolean;
  variant?: 'plain' | 'secondary';
}) {
  const { rawColors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      className="active:opacity-60"
      style={{ width: sizes.touchTarget, height: sizes.touchTarget,
        borderRadius: variant === 'secondary' ? radius.control : radius.icon,
        backgroundColor: variant === 'secondary' ? rawColors.surfaceSecondary : undefined,
        alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? opacity.disabled : 1 }}>
      <MaterialCommunityIcons name={icon} size={sizes.icon}
        color={variant === 'secondary' ? rawColors.foregroundSecondary : rawColors.foreground} />
    </Pressable>
  );
}
