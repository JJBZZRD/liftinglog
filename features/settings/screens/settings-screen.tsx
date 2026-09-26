import Constants from 'expo-constants';
import { BlurTargetView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesignSystemProvider } from '@/components/design-system/design-system-provider';
import { GroupedList, GroupLabel, ListRow } from '@/components/design-system/grouped-list';
import { SegmentedControl } from '@/components/design-system/segmented-control';
import { FrostedModalProvider } from '@/components/modals/frosted-modal-context';
import ReplacementRestoreDialog from '@/components/settings/ReplacementRestoreDialog';
import { ScrollFade } from '@/components/workouts/scroll-fade';
import { useUnitPreference } from '@/lib/contexts/UnitPreferenceContext';
import { getGlobalFormula, setGlobalFormula, type E1RMFormulaId, type UnitPreference } from '@/lib/db/index';
import { discardPreparedRestore, prepareReplacementRestore } from '@/lib/db/replacementRestore';
import { getReplacementRestoreAvailability, scheduleReplacementRestoreAndBlock } from '@/lib/db/replacementRestoreLifecycle';
import type { ThemePreference } from '@/lib/db/settings';
import { space, typography } from '@/lib/design-system/tokens';
import { useResponsiveLayout } from '@/lib/design-system/use-responsive-layout';
import { useScrollEdgeFades } from '@/lib/design-system/use-scroll-edge-fades';
import { useTheme } from '@/lib/theme/ThemeContext';
import { FormulaSheet } from '../components/formula-sheet';
import { FORMULA_OPTIONS } from '../formulas';
import { useDataTransfer } from '../hooks/use-data-transfer';

const DISPLAY_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
];
const UNIT_OPTIONS: { value: UnitPreference; label: string }[] = [{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }];

const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null;

function SettingsContent() {
  const { rawColors, themePreference, setThemePreference } = useTheme();
  const { unitPreference, setUnitPreference } = useUnitPreference();
  const insets = useSafeAreaInsets();
  const { pageWidth, pageGutter } = useResponsiveLayout();
  const blurTarget = useRef<View>(null);
  const { topOpacity, bottomOpacity, scrollProps } = useScrollEdgeFades();
  const transfer = useDataTransfer();
  const [formula, setFormula] = useState<E1RMFormulaId>('epley');
  const [showFormulaSheet, setShowFormulaSheet] = useState(false);

  useEffect(() => { setFormula(getGlobalFormula()); }, []);

  function onSelectFormula(id: E1RMFormulaId) {
    setFormula(id);
    setGlobalFormula(id);
    setShowFormulaSheet(false);
  }

  const formulaLabel = FORMULA_OPTIONS.find((option) => option.id === formula)?.label ?? '';

  return (
    <FrostedModalProvider blurTarget={blurTarget}>
      <View style={{ flex: 1, backgroundColor: rawColors.background }}>
        <BlurTargetView ref={blurTarget} style={{ flex: 1, minHeight: 0, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: rawColors.background }}>
          {/* The docked tab bar sits below this screen and handles the bottom safe area. */}
          <View style={{ flex: 1, minHeight: 0, width: '100%', maxWidth: pageWidth, alignSelf: 'center', paddingTop: insets.top + space[4], overflow: 'hidden' }}>
            <Animated.ScrollView accessibilityLabel="Settings" showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never"
              style={{ flex: 1, minHeight: 0 }} {...scrollProps}
              contentContainerStyle={{ gap: space[12], paddingHorizontal: pageGutter, paddingBottom: space[16] }}>
              <Text accessibilityRole="header" style={{ ...typography.screenTitle, color: rawColors.foreground, paddingBottom: 2 }}>Settings</Text>

              <GroupLabel title="Appearance" />
              <GroupedList>
                <ListRow icon="moon" tile="small" title="Display" trailing={
                  <SegmentedControl accessibilityLabel="Display mode" options={DISPLAY_OPTIONS} value={themePreference} onChange={setThemePreference} />
                } />
              </GroupedList>

              <GroupLabel title="Units & calculations" />
              <GroupedList>
                <ListRow icon="scale" tile="small" title="Weight unit" trailing={
                  <SegmentedControl accessibilityLabel="Weight unit" options={UNIT_OPTIONS} value={unitPreference}
                    onChange={(unit) => { void setUnitPreference(unit); }} />
                } />
                <ListRow icon="formula" tile="small" title="Estimated 1RM formula" subtitle="Used in charts and the 1RM toolkit"
                  trailing={<Text style={{ color: rawColors.foreground, ...typography.rowSubtitle, fontWeight: '600' }}>{formulaLabel}</Text>}
                  chevron accessibilityLabel={`Estimated 1RM formula, ${formulaLabel}`} onPress={() => setShowFormulaSheet(true)} />
              </GroupedList>

              <GroupLabel title="Data" />
              <GroupedList>
                <ListRow icon="download" tile="small" title="Export backup" subtitle="Full copy of your data as a .db file" chevron
                  busy={transfer.isExportingBackup} disabled={transfer.showReplacementRestore} onPress={transfer.onExportBackup} />
                <ListRow icon="table" tile="small" title="Export CSV" subtitle="Workouts and sets for spreadsheets" chevron
                  busy={transfer.isExporting} disabled={transfer.showReplacementRestore} onPress={transfer.onExportCsv} />
                <ListRow icon="restore" tile="small" title="Restore from backup" subtitle="Replaces all data on this device" chevron destructive
                  disabled={transfer.showReplacementRestore || !transfer.restoreAvailability.available || transfer.otherOperationRunning}
                  onPress={transfer.onImportBackup} />
              </GroupedList>

              <GroupLabel title="About" />
              <GroupedList>
                <ListRow icon="info" tile="small" title="LiftingLog" subtitle={appVersion ? `Version ${appVersion}` : undefined} />
              </GroupedList>
            </Animated.ScrollView>
            <ScrollFade edge="top" opacity={topOpacity} />
            <ScrollFade edge="bottom" opacity={bottomOpacity} />
          </View>
        </BlurTargetView>
        <ReplacementRestoreDialog
          visible={transfer.showReplacementRestore}
          onDismiss={transfer.onDismissRestore}
          service={{ prepareReplacementRestore, discardPreparedRestore }}
          lifecycle={{ scheduleReplacementRestoreAndBlock, getReplacementRestoreAvailability }}
        />
        <FormulaSheet visible={showFormulaSheet} value={formula} onCancel={() => setShowFormulaSheet(false)} onConfirm={onSelectFormula} />
      </View>
    </FrostedModalProvider>
  );
}

export default function SettingsScreen() {
  return <DesignSystemProvider><SettingsContent /></DesignSystemProvider>;
}
