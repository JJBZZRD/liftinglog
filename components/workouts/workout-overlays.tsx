import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type RefObject, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { FrostedModal } from '@/components/modals/frosted-modal';
import { CALCULATORS } from '@/lib/calculators/catalog';
import { useUnitPreference } from '@/lib/contexts/UnitPreferenceContext';
import { getTotalPBCount } from '@/lib/db/pbEvents';
import { getQuickStats } from '@/lib/db/workouts';
import { useTheme } from '@/lib/theme/ThemeContext';
import { formatVolumeFromKg, getWeightUnitLabel } from '@/lib/utils/units';
import { IconButton, Metric } from './workout-ui';

export function WorkoutOverlays({ active, onClose, blurTarget }: {
  active: 'calculators' | 'stats' | null; onClose: () => void; blurTarget: RefObject<View | null>;
}) {
  const { rawColors } = useTheme();
  return <FrostedModal visible={active !== null} onClose={onClose} blurTarget={blurTarget}
    centerContent={false} topOffset={70} maxWidth={560}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <View style={{ gap: 5 }}>
        <Text style={{ color: rawColors.foregroundSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 2 }}>LIFTINGLOG / TOOLS</Text>
        <Text accessibilityRole="header" style={{ color: rawColors.foreground, fontSize: 28, fontWeight: '700', letterSpacing: -0.8 }}>
          {active === 'calculators' ? 'Calculators' : 'Quick stats'}
        </Text>
      </View>
      <IconButton icon="close" label="Close overlay" onPress={onClose} />
    </View>
    {active === 'calculators' ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
      {CALCULATORS.map((calculator) => <Pressable key={calculator.id} accessibilityRole="button"
        onPress={() => { onClose(); router.push(calculator.href); }}
        className="active:opacity-60"
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18,
          borderBottomWidth: 1, borderColor: rawColors.borderLight
        }}>
        <MaterialCommunityIcons name={calculator.icon as ComponentProps<typeof MaterialCommunityIcons>['name']} size={25} color={rawColors.primary} />
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={{ color: rawColors.foreground, fontSize: 16, fontWeight: '600' }}>{calculator.title}</Text>
          <Text style={{ color: rawColors.foregroundSecondary, fontSize: 12, lineHeight: 18 }}>{calculator.description}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={rawColors.foregroundMuted} />
      </Pressable>)}
    </ScrollView> : active === 'stats' ? <QuickStatsPanel /> : null}
  </FrostedModal>;
}

function QuickStatsPanel() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const [data, setData] = useState<{ stats: Awaited<ReturnType<typeof getQuickStats>>; pbs: number } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let mounted = true;
    setError(false);
    Promise.all([getQuickStats(), getTotalPBCount()]).then(([stats, pbs]) => {
      if (mounted) setData({ stats, pbs });
    }).catch(() => { if (mounted) setError(true); });
    return () => { mounted = false; };
  }, [attempt]);
  if (error) return <View style={{ gap: 12 }}>
    <Text selectable style={{ color: rawColors.foregroundSecondary }}>{"Couldn't load your stats."}</Text>
    <Pressable onPress={() => setAttempt((value) => value + 1)}><Text style={{ color: rawColors.primary }}>Try again</Text></Pressable>
  </View>;
  if (!data) return <ActivityIndicator color={rawColors.primary} style={{ marginVertical: 36 }} />;
  return <View style={{ gap: 28, paddingBottom: 12 }}>
    <Text style={{ color: rawColors.foregroundSecondary, fontSize: 14, lineHeight: 21 }}>Your training, so far.</Text>
    <View style={{ flexDirection: 'row', gap: 14 }}>
      <Metric label="TRAINING DAYS" value={data.stats.totalWorkoutDays} />
      <Metric label="PERSONAL BESTS" value={data.pbs} />
    </View>
    <View style={{ height: 1, backgroundColor: rawColors.border }} />
    <View style={{ flexDirection: 'row' }}>
      <Metric label={`TOTAL VOLUME / ${getWeightUnitLabel(unitPreference).toUpperCase()}`}
        value={formatVolumeFromKg(data.stats.totalVolumeKg, unitPreference, { abbreviate: true })} />
    </View>
  </View>;
}
