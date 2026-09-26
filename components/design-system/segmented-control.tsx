import { Pressable, Text, View } from 'react-native';
import { radius, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';

export type SegmentOption<T extends string> = { value: T; label: string };

/**
 * A small set of mutually exclusive choices, such as System/Light/Dark or kg/lb.
 * Use `stretch` to fill the row with equal-width segments.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel, stretch = false }: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  stretch?: boolean;
}) {
  const { rawColors } = useTheme();
  return <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}
    style={{
      flexDirection: 'row', gap: 2, padding: 3, borderRadius: radius.chip, borderWidth: 1,
      borderColor: rawColors.controlBorder, backgroundColor: rawColors.control,
      alignSelf: stretch ? 'stretch' : 'flex-start', flexShrink: stretch ? 1 : 0,
    }}>
    {options.map((option) => {
      const selected = option.value === value;
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }}
        accessibilityLabel={option.label} onPress={() => { if (!selected) onChange(option.value); }}
        style={{
          flex: stretch ? 1 : undefined, minHeight: 32, justifyContent: 'center', alignItems: 'center',
          paddingVertical: space[6], paddingHorizontal: 11, borderRadius: radius.button,
          backgroundColor: selected ? rawColors.surface : undefined,
          shadowColor: rawColors.shadow, shadowOpacity: selected ? 0.12 : 0, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
          elevation: selected ? 1 : 0,
        }}>
        <Text numberOfLines={1} style={{ color: selected ? rawColors.foreground : rawColors.foregroundSecondary, ...typography.pill, fontSize: 13 }}>
          {option.label}
        </Text>
      </Pressable>;
    })}
  </View>;
}
