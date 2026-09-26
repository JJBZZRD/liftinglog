import { BlurTargetView } from 'expo-blur';
import { router, Stack } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/design-system/brand-mark';
import { Button } from '@/components/design-system/button';
import { ConfirmDialog } from '@/components/design-system/confirm-dialog';
import { DesignSystemProvider } from '@/components/design-system/design-system-provider';
import { GroupedList, GroupLabel, ListRow } from '@/components/design-system/grouped-list';
import { Icon, type IconName } from '@/components/design-system/icon';
import { IconButton } from '@/components/design-system/icon-button';
import { MetricStrip } from '@/components/design-system/metric-strip';
import { HoldProgress, usePressAndHold } from '@/components/design-system/press-and-hold';
import { SegmentedControl } from '@/components/design-system/segmented-control';
import { LiveDot, StatusPill } from '@/components/design-system/status-pill';
import { FrostedModalProvider } from '@/components/modals/frosted-modal-context';
import { designColors, radius, space, typography } from '@/lib/design-system/tokens';
import { ThemeColorScope, useTheme } from '@/lib/theme/ThemeContext';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { rawColors } = useTheme();
  return <View style={{ gap: space[12] }}>
    <Text style={{ color: rawColors.foregroundMuted, ...typography.groupLabel }}>{title}</Text>
    {children}
  </View>;
}

function HoldCard({ onHold }: { onHold: () => void }) {
  const { rawColors } = useTheme();
  const [taps, setTaps] = useState(0);
  const { progress, holdStyle, pressableProps } = usePressAndHold({ onHold, onPress: () => setTaps((n) => n + 1), holdLabel: 'Delete workout' });
  return <Animated.View style={holdStyle}>
    <Pressable accessibilityRole="button" accessibilityLabel="Push Day, hold to delete" {...pressableProps}
      style={{ padding: space[16], gap: 10, borderRadius: radius.card, borderWidth: 1, borderColor: rawColors.border, backgroundColor: rawColors.surface, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <StatusPill status="live" />
        <Text style={{ color: rawColors.foregroundMuted, ...typography.caption }}>6:42 PM · taps {taps}</Text>
      </View>
      <Text style={{ color: rawColors.foreground, ...typography.cardTitle }}>Push Day</Text>
      <MetricStrip items={[{ value: 4, label: 'exercises' }, { value: 14, label: 'sets' }, { value: '6.2k', label: 'kg' }]} />
      <HoldProgress progress={progress} />
    </Pressable>
  </Animated.View>;
}

function Catalog({ scheme }: { scheme: 'light' | 'dark' }) {
  const { rawColors } = useTheme();
  const [mode, setMode] = useState<'system' | 'light' | 'dark'>('system');
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg');
  const [dialog, setDialog] = useState<'delete' | 'discard' | null>(null);
  const [busy, setBusy] = useState(false);
  const noop = () => {};

  return <View style={{ padding: space[16], gap: space[24], backgroundColor: rawColors.background }}>
    <Text accessibilityRole="header" style={{ color: rawColors.foreground, ...typography.section }}>{scheme === 'light' ? 'Light' : 'Dark'}</Text>

    <Section title="Buttons">
      <Button label="New Workout" icon="plus" size="large" onPress={noop} />
      <View style={{ flexDirection: 'row', gap: space[12] }}>
        <Button label="Cancel" variant="secondary" onPress={noop} style={{ flex: 1 }} />
        <Button label="Save" onPress={noop} style={{ flex: 1 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: space[12] }}>
        <Button label="Delete" icon="trash" variant="destructive" onPress={noop} style={{ flex: 1 }} />
        <Button label="Delete workout" icon="trash" variant="destructive-outline" onPress={noop} style={{ flex: 1 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: space[12] }}>
        <Button label="Disabled" variant="secondary" disabled onPress={noop} style={{ flex: 1 }} />
        <Button label="Saving" busy onPress={noop} style={{ flex: 1 }} />
      </View>
    </Section>

    <Section title="Brand and icons">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[12] }}>
        <BrandMark />
        <Text style={{ color: rawColors.foreground, fontSize: 21, fontWeight: '700', letterSpacing: -0.4 }}>LiftingLog</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[12] }}>
        {(['calculator', 'chart', 'calendar', 'plus', 'check', 'search', 'sort', 'day', 'dumbbell', 'book', 'cog', 'pencil', 'trash', 'arrow-left', 'arrow-right', 'chevron-right', 'moon', 'scale', 'formula', 'download', 'table', 'restore', 'info', 'play', 'close'] as IconName[])
          .map((name) => <Icon key={name} name={name} color={rawColors.foregroundSecondary} />)}
      </View>
    </Section>

    <Section title="Status">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[16] }}>
        <StatusPill status="live" />
        <StatusPill status="completed" />
        <LiveDot />
      </View>
    </Section>

    <Section title="Metric strip">
      <MetricStrip items={[{ value: 4, label: 'exercises' }, { value: 14, label: 'sets' }, { value: '6.2k', label: 'kg' }]} />
    </Section>

    <Section title="Segmented control">
      <SegmentedControl accessibilityLabel="Display mode" stretch value={mode} onChange={setMode}
        options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      <SegmentedControl accessibilityLabel="Weight unit" value={unit} onChange={setUnit}
        options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
    </Section>

    <View style={{ gap: space[8] }}>
      <GroupLabel title="In this workout" accessory={<View style={{ flexDirection: 'row', alignItems: 'center', gap: space[6], minHeight: 32, paddingHorizontal: space[12], borderRadius: radius.pill, backgroundColor: rawColors.liveSoft }}>
        <LiveDot pulse={false} />
        <Text style={{ color: rawColors.liveInk, ...typography.pill, fontSize: 13 }}>Push Day →</Text>
      </View>} />
      <GroupedList>
        <ListRow icon="dumbbell" live title="Bench Press" subtitle="3 sets · best 105 kg × 3" trailing="6:48 PM" onPress={noop} />
        <ListRow icon="dumbbell" title="Overhead Press" subtitle="Barbell" chevron onPress={noop} />
      </GroupedList>
      <GroupLabel title="Chest" detail="6" />
      <GroupedList>
        <ListRow title="Bench Press" subtitle="Barbell · 3 variations" trailing={<Icon name="chevron-up" size={18} color={rawColors.foregroundMuted} />} onPress={noop} />
        <ListRow indent title="Close-Grip Bench" chevron onPress={noop} />
        <ListRow indent title="Paused Bench" chevron onPress={noop} />
        <ListRow title="Cable Fly" subtitle="Cable" chevron onPress={noop} />
      </GroupedList>
      <GroupLabel title="Data" detail="3 items" />
      <GroupedList>
        <ListRow title="Export backup" subtitle="Save a .db copy" chevron onPress={noop} />
        <ListRow title="Export CSV" chevron onPress={noop} />
        <ListRow title="Restore from backup" destructive onPress={noop} />
      </GroupedList>
    </View>

    <Section title="Press and hold">
      <HoldCard onHold={() => setDialog('delete')} />
      <Button label="Open discard dialog" variant="secondary" onPress={() => setDialog('discard')} />
    </Section>

    <ConfirmDialog visible={dialog === 'delete'} title="Delete Push Day?" busy={busy}
      message="4 exercises and 14 sets will be deleted. PBs set in this workout will be recalculated. Videos stay in your gallery."
      emphasis="This can’t be undone." confirmLabel="Delete" onCancel={() => setDialog(null)}
      onConfirm={() => { setBusy(true); setTimeout(() => { setBusy(false); setDialog(null); }, 900); }} />
    <ConfirmDialog visible={dialog === 'discard'} title="Discard workout?" message="This workout has no sets yet."
      confirmLabel="Discard" onCancel={() => setDialog(null)} onConfirm={() => setDialog(null)} />
  </View>;
}

function CatalogContent() {
  const { rawColors } = useTheme();
  const insets = useSafeAreaInsets();
  const blurTarget = useRef<View>(null);
  const back = () => router.canGoBack() ? router.back() : router.replace('/(tabs)');
  return <FrostedModalProvider blurTarget={blurTarget}>
    <Stack.Screen options={{ headerShown: false }} />
    <BlurTargetView ref={blurTarget} style={{ flex: 1, backgroundColor: rawColors.background }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + space[24] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[8], paddingHorizontal: space[8] }}>
          <IconButton icon="arrow-left" label="Go back" onPress={back} />
          <Text accessibilityRole="header" style={{ color: rawColors.foreground, ...typography.cardTitle }}>Design catalog</Text>
        </View>
        {/* Each half pins one palette so both modes can be compared side by side. */}
        <ThemeColorScope colors={designColors.light}><Catalog scheme="light" /></ThemeColorScope>
        <ThemeColorScope colors={designColors.dark}><Catalog scheme="dark" /></ThemeColorScope>
      </ScrollView>
    </BlurTargetView>
  </FrostedModalProvider>;
}

/** Dev-only gallery of the shared primitives. Open with `liftinglog://dev/design-catalog`. */
export default function DesignCatalogScreen() {
  return <DesignSystemProvider><CatalogContent /></DesignSystemProvider>;
}
