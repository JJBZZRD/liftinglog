import { useCallback, useMemo, useState } from 'react';
import type { ExerciseLibraryGroup } from '@/lib/db/exercises';
import {
  getShowAllTabBodyPartGrouping as getShowAllTabBodyPartGroupingPreference,
  setShowAllTabBodyPartGrouping as setShowAllTabBodyPartGroupingPreference,
} from '@/lib/db/settings';
import { filterAndSortGroups, groupExerciseSections, type SearchScope, type SortOption } from '../library-model';

export function useLibraryQuery(items: ExerciseLibraryGroup[]) {
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("alphabetical");
  const [sortAscending, setSortAscending] = useState(true);
  const [searchScope, setSearchScope] = useState<SearchScope>("all");
  const [showAllTabBodyPartGrouping, setShowAllTabBodyPartGrouping] = useState(() => {
    try {
      return getShowAllTabBodyPartGroupingPreference();
    } catch (error) {
      console.error("Error loading exercise library grouping preference:", error);
      return true;
    }
  });
  const [searchQuery, setSearchQuery] = useState("");

  const handleShowAllTabBodyPartGroupingChange = useCallback((value: boolean) => {
    setShowAllTabBodyPartGrouping(value);

    try {
      setShowAllTabBodyPartGroupingPreference(value);
    } catch (error) {
      console.error("Error saving exercise library grouping preference:", error);
    }
  }, []);


  const filteredAndSortedItems = useMemo(() => filterAndSortGroups(items, searchQuery, sortOption, sortAscending), [items, searchQuery, sortOption, sortAscending]);
  const sections = useMemo(() => groupExerciseSections(filteredAndSortedItems, searchScope, showAllTabBodyPartGrouping), [filteredAndSortedItems, searchScope, showAllTabBodyPartGrouping]);
  return {
    showSortModal, setShowSortModal, sortOption, setSortOption, sortAscending, setSortAscending,
    searchScope, setSearchScope, searchQuery, setSearchQuery, showAllTabBodyPartGrouping,
    handleShowAllTabBodyPartGroupingChange, filteredAndSortedItems, sections,
  };
}
export type LibraryQuery = ReturnType<typeof useLibraryQuery>;
