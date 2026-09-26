import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/design-system/button';
import { BaseModal } from '@/components/modals/BaseModal';
import type { E1RMFormulaId } from '@/lib/db';
import { radius, space } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { FORMULA_OPTIONS } from '../formulas';

const MONOSPACE = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

/** The 1RM formula picker: radio options with their equations, applied on "Use …". */
export function FormulaSheet({ visible, value, onCancel, onConfirm }: {
  visible: boolean;
  value: E1RMFormulaId;
  onCancel: () => void;
  onConfirm: (formula: E1RMFormulaId) => void;
}) {
  const { rawColors } = useTheme();
  const [pending, setPending] = useState(value);
  useEffect(() => { if (visible) setPending(value); }, [visible, value]);
  const pendingLabel = FORMULA_OPTIONS.find((option) => option.id === pending)?.label ?? '';

  return (
    <BaseModal visible={visible} onClose={onCancel} sheet maxWidth={560}>
      <View style={{ gap: space[6] }}>
        <Text accessibilityRole="header" style={{ marginHorizontal: space[4], color: rawColors.foreground, fontSize: 20, fontWeight: '700' }}>
          Estimated 1RM formula
        </Text>
        <Text style={{ marginHorizontal: space[4], marginBottom: space[6], color: rawColors.foregroundSecondary, fontSize: 14, lineHeight: 19 }}>
          Estimates your one-rep max from weight (w) and reps (r). Changes recalculate charts; your logged sets are not modified.
        </Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Estimated 1RM formula" style={{ gap: space[6] }}>
          {FORMULA_OPTIONS.map((option) => {
            const selected = option.id === pending;
            return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label} onPress={() => setPending(option.id)} className="active:opacity-70"
              style={{ flexDirection: 'row', alignItems: 'center', gap: space[12], paddingVertical: 11, paddingHorizontal: space[12], borderRadius: radius.control }}>
              {/* Always mounted: Android can drop the corner radius when a background appears after mount. */}
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius.control, backgroundColor: rawColors.surfaceSecondary, opacity: selected ? 1 : 0 }]} />
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? rawColors.primary : rawColors.foregroundMuted, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: rawColors.primary, opacity: selected ? 1 : 0 }} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: rawColors.foreground, fontSize: 15, fontWeight: '600' }}>{option.label}</Text>
                <Text style={{ color: rawColors.foregroundSecondary, fontSize: 12.5, fontFamily: MONOSPACE }}>{option.equation}</Text>
              </View>
            </Pressable>;
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: space[12], marginTop: space[8] }}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
          <Button label={`Use ${pendingLabel}`} onPress={() => onConfirm(pending)} style={{ flex: 1 }} />
        </View>
      </View>
    </BaseModal>
  );
}
