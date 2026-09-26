import { Pressable, Text, View } from 'react-native';
import { Button } from '@/components/design-system/button';
import { GroupedList, GroupLabel, ListRow } from '@/components/design-system/grouped-list';
import { Icon } from '@/components/design-system/icon';
import type { ExerciseLibraryGroup } from '@/lib/db/exercises';
import { space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { LibraryController } from '../hooks/use-library-controller';
import type { LibraryQuery } from '../hooks/use-library-query';
import { formatMuscleGroupTitle, getEquipmentBadgeLabel, titleCaseWords, type SearchScope } from '../library-model';

/** "Barbell · 3 variations"; in the Equipment scope the muscle group replaces the equipment. */
export function exerciseSubtitle(item: ExerciseLibraryGroup, scope: SearchScope) {
  const kind = scope === 'equipment' ? formatMuscleGroupTitle(item.exercise.muscleGroup) : titleCaseWords(getEquipmentBadgeLabel(item.exercise));
  const count = item.variations.length;
  return count ? `${kind} · ${count} ${count === 1 ? 'variation' : 'variations'}` : kind;
}

/** Count badge and expand chevron. The whole slot toggles; the row itself opens the exercise. */
function VariationToggle({ item, expanded, onToggle }: { item: ExerciseLibraryGroup; expanded: boolean; onToggle: () => void }) {
  const { rawColors } = useTheme();
  return (
    <Pressable onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }} accessible={false} importantForAccessibility="no"
      className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', gap: space[6], minHeight: 36 }}>
      <Text style={{ ...typography.pill, color: rawColors.foregroundSecondary, backgroundColor: rawColors.surfaceSecondary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden', fontVariant: ['tabular-nums'] }}>
        {item.variations.length}
      </Text>
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={rawColors.foregroundMuted} />
    </Pressable>
  );
}

/** Rows for one exercise: the parent, then its variations when expanded. Returned flat for `GroupedList`. */
function exerciseRows(item: ExerciseLibraryGroup, scope: SearchScope, controller: LibraryController) {
  const { expandedExerciseId, handleNavigateToExercise, handleOpenActions, handleToggleExpanded } = controller;
  const hasVariations = item.variations.length > 0;
  const expanded = hasVariations && expandedExerciseId === item.exercise.id;
  const subtitle = exerciseSubtitle(item, scope);
  const toggle = () => handleToggleExpanded(item.exercise.id);
  const rows = [
    <ListRow key={`exercise-${item.exercise.id}`} title={item.exercise.name} subtitle={subtitle}
      onPress={() => handleNavigateToExercise(item.exercise)} onLongPress={() => handleOpenActions(item)}
      accessibilityHint="Hold for exercise actions"
      accessibilityActions={[
        { name: 'longpress', label: 'Exercise actions' },
        ...(hasVariations ? [{ name: 'expand', label: expanded ? 'Hide variations' : 'Show variations' }] : []),
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'longpress') handleOpenActions(item);
        if (event.nativeEvent.actionName === 'expand') toggle();
      }}
      trailing={hasVariations ? <VariationToggle item={item} expanded={expanded} onToggle={toggle} /> : undefined}
      chevron={!hasVariations} />,
  ];
  if (expanded) {
    for (const variation of item.variations) {
      rows.push(<ListRow key={`variation-${variation.id}`} indent title={variation.name} chevron
        accessibilityLabel={`${variation.name}, variation of ${item.exercise.name}`}
        onPress={() => handleNavigateToExercise(variation)} />);
    }
  }
  return rows;
}

function EmptyLibrary({ hasExercises, onAdd }: { hasExercises: boolean; onAdd: () => void }) {
  const { rawColors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space[8], paddingVertical: space[24], paddingHorizontal: space[16] }}>
      <Text accessibilityRole="header" style={{ ...typography.section, color: rawColors.foreground, textAlign: 'center' }}>
        {hasExercises ? 'No matches found' : 'No exercises yet'}
      </Text>
      <Text style={{ ...typography.label, lineHeight: 20, color: rawColors.foregroundSecondary, textAlign: 'center' }}>
        {hasExercises ? 'Try another search or filter.' : 'Create your first exercise to start building your library.'}
      </Text>
      {!hasExercises && <Button label="Add exercise" icon="plus" onPress={onAdd} style={{ marginTop: space[8] }} />}
    </View>
  );
}

export function LibrarySections({ controller, query }: { controller: LibraryController; query: LibraryQuery }) {
  const { sections, searchScope } = query;
  if (sections.length === 0) {
    return <EmptyLibrary hasExercises={controller.items.length > 0} onAdd={() => controller.setAddModalVisible(true)} />;
  }
  return (
    <View style={{ gap: space[12] }}>
      {sections.map((section) => (
        <View key={section.key} style={{ gap: space[8] }}>
          {/* The ungrouped All list still gets a heading, so it never reads as part of the group above. */}
          <GroupLabel title={section.title || 'All exercises'} detail={String(section.items.length)} />
          <GroupedList>{section.items.flatMap((item) => exerciseRows(item, searchScope, controller))}</GroupedList>
        </View>
      ))}
    </View>
  );
}
