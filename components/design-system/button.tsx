import { ActivityIndicator, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { opacity, radius, sizes, space } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { Icon, type IconName } from './icon';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'destructive-outline';

// Colour classes keep NativeWind and the scoped theme in step (see AGENTS.md).
const containerClass: Record<ButtonVariant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-control border border-control-border',
  destructive: 'bg-destructive',
  // Border and tint are translucent destructive, applied inline below.
  'destructive-outline': 'border',
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
        // As in the mockups: a 40% destructive border over a 7% destructive tint.
        ...(variant === 'destructive-outline' && { borderColor: `${rawColors.destructive}66`, backgroundColor: `${rawColors.destructive}12` }),
      }, style]}>
      {busy ? <ActivityIndicator size="small" color={foreground} />
        : icon && <Icon name={icon} size={large ? 22 : 18} color={foreground} />}
      <Text className={labelClass[variant]}
        style={{ flexShrink: 1, minWidth: 0, textAlign: 'center', fontSize: large ? 16 : 15, fontWeight: large ? '700' : '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}
