/**
 * Set Item Component
 * 
 * A reusable component for displaying a workout set. This consolidates
 * the set item rendering pattern used in:
 * - RecordTab.tsx
 * - HistoryTab.tsx
 * - edit-workout.tsx
 */
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../../lib/theme/ThemeContext";

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
  variant?: "default" | "compact";
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
  variant = "default",
  prBadge,
}: SetItemProps) {
  const { rawColors } = useTheme();
  const isCompact = variant === "compact";

  const content = (
    <View 
      className={`flex-row items-center rounded-lg mb-2 ${
        isCompact 
          ? "py-2 px-3 mb-1 bg-surface" 
          : "py-3 px-4 bg-surface-secondary"
      }`}
    >
      <View 
        className={`items-center justify-center mr-3 bg-primary ${
          isCompact ? "w-7 h-7 rounded-full" : "w-8 h-8 rounded-full"
        }`}
      >
        <Text 
          className={`font-semibold text-primary-foreground ${
            isCompact ? "text-xs" : "text-sm"
          }`}
        >
          {index}
        </Text>
      </View>
      <View className="flex-1">
        <View className="flex-row gap-3 mb-1">
          <Text className="text-base font-semibold text-foreground">
            {weightKg !== null ? `${weightKg} kg` : "—"}
          </Text>
          <Text className="text-base font-semibold text-foreground">
            {reps !== null ? `${reps} reps` : "—"}
          </Text>
        </View>
        {note && (
          <Text 
            className="text-sm italic text-foreground-secondary"
            numberOfLines={isCompact ? 1 : undefined}
          >
            {note}
          </Text>
        )}
      </View>
      {prBadge && (
        <View 
          className="px-2 py-1 rounded-md ml-2"
          style={{ backgroundColor: rawColors.prGold }}
        >
          <Text className="text-[11px] font-bold uppercase text-primary-foreground">
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
  variant?: "default" | "compact";
  emptyText?: string;
}

export function SetItemList({
  sets,
  onLongPressSet,
  variant = "default",
  emptyText = "No sets recorded",
}: SetItemListProps) {
  if (sets.length === 0) {
    return (
      <View className="py-6 items-center">
        <Text className="text-sm text-center text-foreground-muted">{emptyText}</Text>
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
