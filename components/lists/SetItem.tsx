/**
 * Set Item Component
 * 
 * A reusable component for displaying a workout set. This consolidates
 * the set item rendering pattern used in:
 * - RecordTab.tsx
 * - HistoryTab.tsx
 * - edit-workout.tsx
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import { radius, space, typography } from "../../lib/design-system/tokens";
import { useTheme } from "../../lib/theme/ThemeContext";
import { formatWeightFromKg, getWeightUnitLabel } from "../../lib/utils/units";

interface SetItemProps {
  /** Set index (1-based for display) */
  index: number;
  /** Weight in kg */
  weightKg: number | null;
  /** Number of reps */
  reps: number | null;
  /** Optional note */
  note?: string | null;
  /** Called on press */
  onPress?: () => void;
  /** Called on long press (for edit mode) */
  onLongPress?: () => void;
  /** Long press delay in ms (default: 400) */
  delayLongPress?: number;
  /** Variant styling */
  variant?: "default" | "compact" | "workout";
  /** PB badge text (e.g., "1RM", "5RM") */
  pbBadge?: string | null;
  /** Whether this is the best set in the session */
  isBestSet?: boolean;
  /** Optional right-side actions/accessories; below the values in workout rows. */
  rightActions?: ReactNode;
  /** Warm-up metadata; displayed below the values in grouped workout rows. */
  isWarmup?: boolean;
  /** Optional domain-specific description of a tappable set. */
  accessibilityLabel?: string;
}

/**
 * A set row inside a workout-detail exercise card, as drawn in the mockups: a number
 * badge, weight and reps as a bold value with a small unit, and a BEST or PB badge in
 * a reserved accessory column. The card supplies the horizontal padding.
 */
function WorkoutSetContent({
  index, weightLabel, reps, note, pbBadge, isWarmup, isBestSet, rightActions,
}: Pick<SetItemProps, "index" | "reps" | "note" | "pbBadge" | "isWarmup" | "isBestSet" | "rightActions"> & { weightLabel: string }) {
  const { rawColors } = useTheme();
  const { fontScale } = useWindowDimensions();
  // The badge slot scales with text and exists even on ordinary sets, so values never shift.
  const badgeWidth = 52 * Math.max(1, fontScale);
  const [weight, unit] = weightLabel.split(' ');
  const value = (amount: string | number, label?: string) => (
    <Text selectable style={{ flex: 1, minWidth: 0, fontSize: 13, color: rawColors.foregroundSecondary, fontVariant: ['tabular-nums'] }}>
      <Text style={{ fontSize: 17, fontWeight: '600', color: rawColors.foreground }}>{amount}</Text>{label ? ` ${label}` : ''}
    </Text>
  );
  const badge = (text: string, gold: boolean) => (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ maxWidth: '100%', paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.badge, backgroundColor: gold ? `${rawColors.pbGold}29` : rawColors.surfaceSecondary }}>
      <Text style={{ flexShrink: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, color: gold ? rawColors.pbGold : rawColors.foreground }}>{text.toUpperCase()}</Text>
    </View>
  );
  return (
    <View style={{ paddingVertical: space[8], borderTopWidth: 1, borderColor: rawColors.borderLight, gap: space[6] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 26, minHeight: 26, borderRadius: radius.button, backgroundColor: rawColors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: rawColors.foregroundSecondary, fontVariant: ['tabular-nums'] }}>{index}</Text>
        </View>
        {value(weight, unit)}
        {value(reps ?? '—', 'reps')}
        <View style={{ width: badgeWidth, alignItems: 'flex-end' }}>
          {pbBadge ? badge(pbBadge, true) : isBestSet ? badge('Best', false) : null}
        </View>
      </View>
      {(isWarmup || !!note?.trim()) && (
        <View style={{ paddingLeft: 26 + 10, gap: space[4] }}>
          {isWarmup && <Text style={{ ...typography.caption, color: rawColors.foregroundMuted }}>Warm-up</Text>}
          {!!note?.trim() && <Text selectable style={{ ...typography.label, lineHeight: 20, color: rawColors.foregroundSecondary }}>{note}</Text>}
        </View>
      )}
      {rightActions && <View style={{ alignItems: 'flex-end' }}>{rightActions}</View>}
    </View>
  );
}

/**
 * SetItem displays a single workout set with:
 * - Numbered badge
 * - Weight and reps
 * - Optional note
 * - Optional long-press handler for editing
 * - Optional best set highlight with trophy icon
 */
export default function SetItem({
  index,
  weightKg,
  reps,
  note,
  onPress,
  onLongPress,
  delayLongPress = 400,
  variant = "default",
  pbBadge,
  isBestSet,
  rightActions,
  isWarmup,
  accessibilityLabel,
}: SetItemProps) {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const isCompact = variant === "compact";

  // Build style for best set highlighting - uses primary color with opacity for cross-theme support
  const bestSetStyle: ViewStyle | undefined = isBestSet
    ? {
        backgroundColor: `${rawColors.primary}20`, // ~12% opacity for subtle highlight
        borderLeftWidth: 3,
        borderLeftColor: rawColors.primary,
      }
    : undefined;

  const weightLabel = formatWeightFromKg(weightKg, unitPreference, {
    placeholder: variant === 'workout' ? `\u2014 ${getWeightUnitLabel(unitPreference)}` : '--',
  });
  const content = variant === "workout" ? (
    <WorkoutSetContent index={index} weightLabel={weightLabel} reps={reps} note={note}
      pbBadge={pbBadge} isWarmup={isWarmup} isBestSet={isBestSet} rightActions={rightActions} />
  ) : (
    <View 
      className={`flex-row items-center rounded-lg mb-2 ${
        isCompact 
          ? "py-2 px-3 mb-1" 
          : "py-3 px-4"
      } ${!isBestSet ? (isCompact ? "bg-surface" : "bg-surface-secondary") : ""}`}
      style={bestSetStyle}
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
        <View className="flex-row gap-3 mb-1 items-center">
          <Text className="text-base font-semibold text-foreground">
            {weightLabel}
          </Text>
          <Text className="text-base font-semibold text-foreground">
            {reps !== null ? `${reps} reps` : "\u2014"}
          </Text>
          {isBestSet && (
            <View className="flex-row items-center ml-1">
              <MaterialCommunityIcons 
                name="trophy" 
                size={14} 
                color={rawColors.primary} 
              />
            </View>
          )}
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
      {pbBadge && (
        <View 
          className="px-2 py-1 rounded-md ml-2"
          style={{ backgroundColor: rawColors.pbGold }}
        >
          <Text className="text-[11px] font-bold uppercase text-primary-foreground">
            {pbBadge}
          </Text>
        </View>
      )}
      {rightActions}
    </View>
  );

  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className="active:opacity-70"
      >
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
  onPressSet?: (set: SetData) => void;
  onLongPressSet?: (set: SetData) => void;
  variant?: "default" | "compact";
  emptyText?: string;
}

export function SetItemList({
  sets,
  onPressSet,
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
          onPress={onPressSet ? () => onPressSet(set) : undefined}
          onLongPress={onLongPressSet ? () => onLongPressSet(set) : undefined}
          variant={variant}
        />
      ))}
    </>
  );
}


