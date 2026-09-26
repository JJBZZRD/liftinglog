import { Text, View } from 'react-native';
import { BaseModal } from '@/components/modals/BaseModal';
import { radius, space } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { Button } from './button';
import { Icon, type IconName } from './icon';

/**
 * A confirmation built on `BaseModal`, so it is frosted inside a `FrostedModalProvider`.
 * Say exactly what will be lost in `message`; put the irreversible part in `emphasis`.
 */
export function ConfirmDialog({
  visible, title, message, emphasis, confirmLabel, cancelLabel = 'Cancel', tone = 'destructive',
  icon, busy = false, error, onConfirm, onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  /** A second, stronger line such as “This can’t be undone.” */
  emphasis?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'destructive' | 'primary';
  /** Shown in a tinted tile above the title. Defaults to a bin for destructive dialogs. */
  icon?: IconName | null;
  /** Disables both actions and ignores dismissal while the action runs. */
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { rawColors } = useTheme();
  const destructive = tone === 'destructive';
  const iconName = icon === undefined ? (destructive ? 'trash' : null) : icon;
  const accent = destructive ? rawColors.destructive : rawColors.primary;

  return (
    <BaseModal visible={visible} onClose={busy ? () => {} : onCancel}>
      <View style={{ gap: 10 }}>
        {iconName && <View style={{ width: 44, height: 44, borderRadius: radius.icon, alignItems: 'center', justifyContent: 'center', backgroundColor: `${accent}24` }}>
          <Icon name={iconName} size={22} color={accent} />
        </View>}
        <Text accessibilityRole="header" style={{ marginTop: 4, color: rawColors.foreground, fontSize: 20, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: rawColors.foregroundSecondary, fontSize: 15, lineHeight: 22 }}>{message}</Text>
        {emphasis && <Text style={{ color: rawColors.foreground, fontSize: 15, lineHeight: 22, fontWeight: '500' }}>{emphasis}</Text>}
        {error && <Text selectable accessibilityRole="alert" style={{ color: rawColors.destructive, fontSize: 14 }}>{error}</Text>}
        <View style={{ flexDirection: 'row', gap: space[12], marginTop: space[8] }}>
          <Button label={cancelLabel} variant="secondary" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
          <Button label={confirmLabel} variant={destructive ? 'destructive' : 'primary'} onPress={onConfirm} busy={busy}
            icon={destructive ? 'trash' : undefined} style={{ flex: 1 }} />
        </View>
      </View>
    </BaseModal>
  );
}
