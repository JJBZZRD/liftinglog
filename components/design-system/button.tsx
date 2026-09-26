import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { opacity, radius, sizes, space } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'destructive-outline';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// Colour classes keep NativeWind and the scoped theme in step (see AGENTS.md).
const containerClass: Record<ButtonVariant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-control border border-control-border',
  destructive: 'bg-destructive',
  'destructive-outline': 'border border-destructive',
};
const labelClass: Record<ButtonVariant, string> = {
  primary: 'text-primary-foreground',
  secondary: 'text-foreground-secondary',
  destructive: 'text-on-destructive',
  'destructive-outline': 'text-destructive',
};

/**
 * `large` is the page's main call to action; `medium` suits secondary actions and
 * dialog rows (pass `style={{ flex: 1 }}` for equal-width pairs).
 */
export function Button({
  label, onPress, variant = 'primary', size = 'medium', icon, disabled = false, busy = false,
  accessibilityLabel, accessibilityHint, style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'medium' | 'large';
  icon?: IconName;
  disabled?: boolean;
  /** Shows a spinner in place of the icon and blocks presses. */
  busy?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { rawColors } = useTheme();
  const large = size === 'large';
  const inactive = disabled || busy;
  const foreground = {
    primary: rawColors.primaryForeground,
    secondary: rawColors.foregroundSecondary,
    destructive: rawColors.onDestructive,
    'destructive-outline': rawColors.destructive,
  }[variant];

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }} disabled={inactive} onPress={onPress}
      className={`${containerClass[variant]} active:opacity-70`}
      style={[{
        minHeight: large ? sizes.buttonLarge : sizes.touchTarget,
        borderRadius: large ? radius.action : radius.control,
        paddingHorizontal: space[16], paddingVertical: space[12],
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[8],
        opacity: disabled ? opacity.disabled : 1,
      }, style]}>
      {busy ? <ActivityIndicator size="small" color={foreground} />
        : icon && <MaterialCommunityIcons name={icon} size={large ? 22 : 18} color={foreground} style={{ flexShrink: 0 }} />}
      <Text className={labelClass[variant]}
        style={{ flexShrink: 1, minWidth: 0, textAlign: 'center', fontSize: large ? 16 : 15, fontWeight: large ? '700' : '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}
