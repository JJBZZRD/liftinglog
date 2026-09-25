import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { radius, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';

export function LibrarySearchActions({ value, onChange, onAdd }: {
  value: string; onChange: (value: string) => void; onAdd: () => void;
}) {
  const { rawColors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: space[12] }}>
      <View style={{
        flex: 1, minWidth: 0, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space[8],
        paddingLeft: space[12], paddingRight: space[4], borderRadius: radius.control,
        backgroundColor: rawColors.surface, borderWidth: 1, borderColor: rawColors.border,
      }}>
        <MaterialCommunityIcons name="magnify" size={20} color={rawColors.foregroundMuted} />
        <TextInput accessibilityLabel="Search exercises" value={value} onChangeText={onChange}
          placeholder="Search…" placeholderTextColor={rawColors.foregroundMuted}
          returnKeyType="search" autoCorrect={false}
          style={{ flex: 1, minWidth: 0, ...typography.body, color: rawColors.foreground, paddingVertical: space[12] }} />
        {/* Keep the input's width stable when its clear action appears. */}
        <Pressable accessibilityRole="button" accessibilityLabel="Clear exercise search" onPress={() => onChange('')}
          hitSlop={6}
          disabled={!value} accessibilityElementsHidden={!value} importantForAccessibility={value ? 'auto' : 'no-hide-descendants'}
          className="active:opacity-70"
          style={{ width: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: value ? 1 : 0 }}>
          <MaterialCommunityIcons name="close-circle" size={18} color={rawColors.foregroundMuted} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Add exercise" onPress={onAdd}
        className="active:opacity-70" style={{
          minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[4],
          paddingHorizontal: space[12], borderRadius: radius.control, backgroundColor: rawColors.primary,
        }}>
        <MaterialCommunityIcons name="plus" size={20} color={rawColors.primaryForeground} />
        <Text style={{ ...typography.label, fontWeight: '600', color: rawColors.primaryForeground }}>Add</Text>
      </Pressable>
    </View>
  );
}
