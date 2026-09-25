import { Pressable, Text, View } from 'react-native';
import { radius, sizes, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { SEARCH_SCOPE_OPTIONS, type SearchScope } from '../library-model';

export function LibrarySearchScope({ value, onChange }: {
  value: SearchScope; onChange: (scope: SearchScope) => void;
}) {
  const { rawColors } = useTheme();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'stretch', gap: space[4], padding: space[4],
      borderRadius: radius.control, backgroundColor: rawColors.surfaceSecondary,
      borderWidth: 1, borderColor: rawColors.border,
    }}>
      {SEARCH_SCOPE_OPTIONS.map((option) => {
        const selected = value === option.id;
        return (
          <Pressable key={option.id} onPress={() => onChange(option.id)}
            accessibilityRole="button" accessibilityState={{ selected }}
            className="active:opacity-70" style={{
              // Reserve more of the row for its longest label at larger text sizes.
              flex: option.id === 'equipment' ? 1.4 : 1, minWidth: 0, minHeight: sizes.touchTarget,
              alignItems: 'center', justifyContent: 'center',
              paddingHorizontal: space[4], paddingVertical: space[8], borderRadius: radius.button,
              backgroundColor: selected ? rawColors.surface : 'transparent',
              borderWidth: 1, borderColor: selected ? rawColors.border : 'transparent',
            }}>
            <Text style={{
              ...typography.label, fontWeight: '600', textAlign: 'center', width: '100%',
              color: selected ? rawColors.primary : rawColors.foregroundSecondary,
            }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
