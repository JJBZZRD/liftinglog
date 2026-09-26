import { Children, createContext, isValidElement, useContext, type ReactNode } from 'react';
import { Pressable, Text, View, type AccessibilityActionEvent, type AccessibilityActionInfo } from 'react-native';
import { radius, sizes, space, typography } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { Icon, type IconName } from './icon';

const ROW_PADDING = 14;
const LEADING_GAP = space[12];
/** A separator starts at the text, not the edge, when rows have a leading tile. */
const LEADING_INSET = ROW_PADDING + sizes.listLeading + LEADING_GAP;

const RowPosition = createContext({ first: true });

/** Uppercase heading above a group, with an optional count or an accessory such as the return pill. */
export function GroupLabel({ title, detail, accessory }: { title: string; detail?: string; accessory?: ReactNode }) {
  const { rawColors } = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[8], paddingTop: accessory ? 2 : space[6], paddingHorizontal: 4 }}>
    <Text accessibilityRole="header" style={{ flexShrink: 1, color: rawColors.foregroundMuted, ...typography.groupLabel }}>{title}</Text>
    {accessory ?? (detail !== undefined && <Text style={{ flexShrink: 0, color: rawColors.foregroundMuted, ...typography.caption, fontWeight: '500' }}>{detail}</Text>)}
  </View>;
}

/** A card that holds `ListRow`s and draws the separators between them. */
export function GroupedList({ children }: { children: ReactNode }) {
  const { rawColors } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return <View style={{ backgroundColor: rawColors.surface, borderWidth: 1, borderColor: rawColors.border, borderRadius: radius.card, overflow: 'hidden' }}>
    {rows.map((row, index) => <RowPosition.Provider key={row.key ?? index} value={{ first: index === 0 }}>{row}</RowPosition.Provider>)}
  </View>;
}

export function ListRow({
  title, subtitle, icon, leading, live = false, trailing, chevron = false, destructive = false, indent = false,
  onPress, onLongPress, accessibilityLabel, accessibilityHint, accessibilityActions, onAccessibilityAction,
}: {
  title: string;
  subtitle?: string;
  /** Icon in the standard 36 dp leading tile. */
  icon?: IconName;
  /** Custom leading content, used instead of `icon`. */
  leading?: ReactNode;
  /** Tints the leading tile for an item in the active workout. */
  live?: boolean;
  /** Right-aligned text or controls. */
  trailing?: ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  /** A nested row, such as an exercise variation: indented, shorter, on a tinted band. */
  indent?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Extra screen-reader actions, for controls inside the row such as an expand toggle. */
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}) {
  const { rawColors } = useTheme();
  const { first } = useContext(RowPosition);
  const hasLeading = Boolean(icon || leading);

  const content = <>
    {!first && <View style={{ position: 'absolute', top: 0, right: 0, left: hasLeading ? LEADING_INSET : 16, height: 1, backgroundColor: rawColors.borderLight }} />}
    {leading ?? (icon && <View style={{
      width: sizes.listLeading, height: sizes.listLeading, borderRadius: 11, flexShrink: 0,
      alignItems: 'center', justifyContent: 'center', backgroundColor: live ? rawColors.liveSoft : rawColors.surfaceSecondary,
    }}>
      <Icon name={icon} size={18} strokeWidth={2.4} color={live ? rawColors.liveInk : rawColors.foregroundMuted} />
    </View>)}
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text numberOfLines={1} style={{ color: destructive ? rawColors.destructive : rawColors.foreground, ...typography.rowTitle, ...(indent && { fontSize: 15, fontWeight: '500' }) }}>{title}</Text>
      {subtitle && <Text numberOfLines={1} style={{ color: rawColors.foregroundSecondary, ...typography.rowSubtitle }}>{subtitle}</Text>}
    </View>
    {(trailing !== undefined || chevron) && <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[6], flexShrink: 0 }}>
      {typeof trailing === 'string' || typeof trailing === 'number'
        ? <Text style={{ color: rawColors.foregroundMuted, ...typography.rowSubtitle }}>{trailing}</Text> : trailing}
      {chevron && <Icon name="chevron-right" size={18} color={rawColors.foregroundMuted} />}
    </View>}
  </>;

  const rowStyle = {
    flexDirection: 'row', alignItems: 'center', gap: LEADING_GAP, paddingVertical: space[12], paddingHorizontal: ROW_PADDING,
    minHeight: indent ? 48 : sizes.listRowMinHeight,
    // Half the page colour over the card gives the mockups' nested-row band in both modes.
    ...(indent && { paddingLeft: 30, backgroundColor: `${rawColors.background}80` }),
  } as const;

  if (!onPress && !onLongPress) return <View style={rowStyle}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
    accessibilityHint={accessibilityHint} onPress={onPress} onLongPress={onLongPress}
    accessibilityActions={accessibilityActions} onAccessibilityAction={onAccessibilityAction}
    // A function `style` loses its layout under NativeWind's Pressable interop; use a class for the pressed state.
    className="active:bg-pressed" style={rowStyle}>
    {content}
  </Pressable>;
}
