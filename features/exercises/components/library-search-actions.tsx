import { Pressable, TextInput, View } from 'react-native';
import { Icon } from '@/components/design-system/icon';
import { radius, sizes, space } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';

/** Search and a square Add button share a row; the Add button never moves while typing. */
export function LibrarySearchActions({ value, onChange, onAdd }: {
  value: string; onChange: (value: string) => void; onAdd: () => void;
}) {
  const { rawColors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: space[12] }}>
      <View style={{
        flex: 1, minWidth: 0, minHeight: sizes.touchTarget, flexDirection: 'row', alignItems: 'center', gap: space[8],
        paddingLeft: space[12], paddingRight: space[4], borderRadius: radius.control,
        backgroundColor: rawColors.surface, borderWidth: 1, borderColor: rawColors.controlBorder,
      }}>
        <Icon name="search" size={18} color={rawColors.foregroundMuted} />
        <TextInput accessibilityLabel="Search exercises" value={value} onChangeText={onChange}
          placeholder="Search exercises" placeholderTextColor={rawColors.foregroundMuted}
          returnKeyType="search" autoCorrect={false}
          style={{ flex: 1, minWidth: 0, fontSize: 15, color: rawColors.foreground, paddingVertical: space[8] }} />
        {/* Keep the input's width stable when its clear action appears. */}
        <Pressable accessibilityRole="button" accessibilityLabel="Clear exercise search" onPress={() => onChange('')}
          hitSlop={6}
          disabled={!value} accessibilityElementsHidden={!value} importantForAccessibility={value ? 'auto' : 'no-hide-descendants'}
          className="active:opacity-70"
          style={{ width: 32, minHeight: 40, alignItems: 'center', justifyContent: 'center', opacity: value ? 1 : 0 }}>
          <Icon name="close" size={16} color={rawColors.foregroundMuted} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Add exercise" onPress={onAdd}
        className="active:opacity-70" style={{
          width: sizes.touchTarget, minHeight: sizes.touchTarget, alignItems: 'center', justifyContent: 'center',
          borderRadius: radius.control, backgroundColor: rawColors.primary,
        }}>
        <Icon name="plus" size={22} color={rawColors.primaryForeground} />
      </Pressable>
    </View>
  );
}
