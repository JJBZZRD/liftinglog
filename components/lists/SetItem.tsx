/**
 * Set Item Component
 * 
 * A reusable component for displaying a workout set. This consolidates
 * the set item rendering pattern used in:
 * - RecordTab.tsx
 * - HistoryTab.tsx
 * - edit-workout.tsx
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../lib/theme/ThemeContext';

interface SetItemProps {
  /** Set index (1-based for display) */
  index: number;
  /** Weight in kg */
  weightKg: number | null;
  /** Number of reps */
  reps: number | null;
  /** Optional note */
  note?: string | null;
  /** Called on long press (for edit mode) */
  onLongPress?: () => void;
  /** Long press delay in ms (default: 400) */
  delayLongPress?: number;
  /** Variant styling */
  variant?: 'default' | 'compact';
  /** PR badge text (e.g., "1RM", "5RM") */
  prBadge?: string | null;
}

/**
 * SetItem displays a single workout set with:
 * - Numbered badge
 * - Weight and reps
 * - Optional note
 * - Optional long-press handler for editing
 */
export default function SetItem({
  index,
  weightKg,
  reps,
  note,
  onLongPress,
  delayLongPress = 400,
  variant = 'default',
  prBadge,
}: SetItemProps) {
  const { themeColors } = useTheme();

  const content = (
    <View style={[
      styles.container, 
      { backgroundColor: themeColors.surfaceSecondary },
      variant === 'compact' && [styles.containerCompact, { backgroundColor: themeColors.surface }]
    ]}>
      <View style={[styles.badge, { backgroundColor: themeColors.primary }, variant === 'compact' && styles.badgeCompact]}>
        <Text style={[styles.badgeText, { color: themeColors.surface }, variant === 'compact' && styles.badgeTextCompact]}>
          {index}
        </Text>
      </View>
      <View style={styles.details}>
        <View style={styles.infoRow}>
          <Text style={[styles.info, { color: themeColors.text }]}>
            {weightKg !== null ? `${weightKg} kg` : '—'}
          </Text>
          <Text style={[styles.info, { color: themeColors.text }]}>
            {reps !== null ? `${reps} reps` : '—'}
          </Text>
        </View>
        {note && (
          <Text style={[styles.note, { color: themeColors.textSecondary }]} numberOfLines={variant === 'compact' ? 1 : undefined}>
            {note}
          </Text>
        )}
      </View>
      {prBadge && (
        <View style={[styles.prBadge, { backgroundColor: themeColors.prGold }]}>
          <Text style={[styles.prBadgeText, { color: themeColors.surface }]}>
            {prBadge}
          </Text>
        </View>
      )}
    </View>
  );

  if (onLongPress) {
    return (
      <Pressable onLongPress={onLongPress} delayLongPress={delayLongPress}>
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  containerCompact: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badgeCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  badgeTextCompact: {
    fontSize: 12,
  },
  details: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  info: {
    fontSize: 16,
    fontWeight: '600',
  },
  note: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  prBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  prBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});

/**
 * SetItemList - Helper component for rendering a list of sets
 */
interface SetData {
  id: number;
  weightKg: number | null;
  reps: number | null;
  note?: string | null;
}

interface SetItemListProps {
  sets: SetData[];
  onLongPressSet?: (set: SetData) => void;
  variant?: 'default' | 'compact';
  emptyText?: string;
}

export function SetItemList({
  sets,
  onLongPressSet,
  variant = 'default',
  emptyText = 'No sets recorded',
}: SetItemListProps) {
  const { themeColors } = useTheme();

  if (sets.length === 0) {
    return (
      <View style={emptyStyles.container}>
        <Text style={[emptyStyles.text, { color: themeColors.textTertiary }]}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <>
      {sets.map((set, index) => (
        <SetItem
          key={set.id}
          index={index + 1}
          weightKg={set.weightKg}
          reps={set.reps}
          note={set.note}
          onLongPress={onLongPressSet ? () => onLongPressSet(set) : undefined}
          variant={variant}
        />
      ))}
    </>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  text: {
    fontSize: 14,
    textAlign: 'center',
  },
});





