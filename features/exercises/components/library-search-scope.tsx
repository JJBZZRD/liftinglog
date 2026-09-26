import { Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/design-system/icon';
import { space } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { SEARCH_SCOPE_OPTIONS, type SearchScope, type SortOption } from '../library-model';

/** Short label for the current order, shown beside the filter chips. */
export function sortSummaryLabel(option: SortOption, ascending: boolean) {
  if (option === 'alphabetical') return ascending ? 'A–Z' : 'Z–A';
  return ascending ? 'Oldest' : 'Recent';
}

/** All / Muscle / Equipment chips, with the sort control at the end of the row. */
export function LibrarySearchScope({ value, onChange, sortLabel, onSort }: {
  value: SearchScope; onChange: (scope: SearchScope) => void; sortLabel: string; onSort: () => void;
}) {
  const { rawColors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[8] }}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Group exercises by" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[8], flexShrink: 1 }}>
        {SEARCH_SCOPE_OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <Pressable key={option.id} onPress={() => onChange(option.id)}
              accessibilityRole="radio" accessibilityState={{ checked: selected, selected }} accessibilityLabel={option.label}
              hitSlop={{ top: 5, bottom: 5 }} className="active:opacity-70" style={{
                minHeight: 34, paddingHorizontal: 13, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: selected ? rawColors.primary : rawColors.controlBorder,
                backgroundColor: selected ? rawColors.primary : rawColors.control,
              }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: selected ? rawColors.primaryForeground : rawColors.foregroundSecondary }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Sort: ${sortLabel}. Change order`} onPress={onSort}
        hitSlop={{ top: 8, bottom: 8, left: 8 }} className="active:opacity-70"
        style={{ marginLeft: 'auto', flexShrink: 0, minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <Icon name="sort" size={16} color={rawColors.foregroundSecondary} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: rawColors.foregroundSecondary }}>{sortLabel}</Text>
      </Pressable>
    </View>
  );
}
