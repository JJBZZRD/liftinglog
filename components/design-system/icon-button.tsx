import { Pressable } from 'react-native';
import { opacity, radius, sizes } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { Icon, type IconName } from './icon';

export function IconButton({ icon, label, onPress, disabled = false, variant = 'plain' }: {
  icon: IconName;
  label: string; onPress: () => void; disabled?: boolean;
  variant?: 'plain' | 'secondary';
}) {
  const { rawColors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      className="active:opacity-60"
      style={{ width: sizes.touchTarget, height: sizes.touchTarget, flexShrink: 0,
        borderRadius: variant === 'secondary' ? radius.control : radius.icon,
        backgroundColor: variant === 'secondary' ? rawColors.control : undefined,
        borderWidth: variant === 'secondary' ? 1 : 0, borderColor: rawColors.controlBorder,
        alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? opacity.disabled : 1 }}>
      <Icon name={icon} size={22} color={rawColors.foregroundSecondary} />
    </Pressable>
  );
}
