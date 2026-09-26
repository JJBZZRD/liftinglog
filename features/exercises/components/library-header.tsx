import { Text, View } from 'react-native';
import { space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { filteredLabel } from '../library-model';
import type { LibraryQuery } from '../hooks/use-library-query';
import { LibrarySearchActions } from './library-search-actions';
import { LibrarySearchScope, sortSummaryLabel } from './library-search-scope';

/** Title and count, search with Add, then the filter chips and sort. Stays fixed above the list. */
export function LibraryHeader({ query, onAdd }: { query: LibraryQuery; onAdd: () => void }) {
  const { rawColors } = useTheme();
  const { searchScope, setSearchScope, searchQuery, setSearchQuery, sortOption, sortAscending, setShowSortModal, filteredAndSortedItems } = query;
  return (
    <View style={{ gap: space[12] }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space[8] }}>
        <Text accessibilityRole="header" style={{ flexShrink: 1, ...typography.screenTitle, color: rawColors.foreground }}>Exercises</Text>
        <Text style={{ flexShrink: 0, paddingBottom: space[4], ...typography.rowSubtitle, color: rawColors.foregroundMuted, fontVariant: ['tabular-nums'] }}>
          {filteredLabel(filteredAndSortedItems.length)}
        </Text>
      </View>
      <LibrarySearchActions value={searchQuery} onChange={setSearchQuery} onAdd={onAdd} />
      <LibrarySearchScope value={searchScope} onChange={setSearchScope}
        sortLabel={sortSummaryLabel(sortOption, sortAscending)} onSort={() => setShowSortModal(true)} />
    </View>
  );
}
