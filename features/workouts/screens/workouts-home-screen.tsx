import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurTargetView } from 'expo-blur';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FrostedModalProvider } from '@/components/modals/frosted-modal-context';
import { WorkoutCalendar } from '@/components/workouts/workout-calendar';
import { WorkoutHeader } from '@/components/workouts/workout-header';
import { WorkoutOverlays } from '@/components/workouts/workout-overlays';
import { WorkoutThemeBoundary } from '@/components/workouts/workout-theme';
import { appCapabilities } from '@/lib/config/releaseProfile';
import { radius, sizes, space, typography } from '@/lib/design-system/tokens';
import { useResponsiveLayout } from '@/lib/design-system/use-responsive-layout';
import { useTheme } from '@/lib/theme/ThemeContext';
import { setSelectedWorkoutId } from '@/lib/workouts/selection-store';
import { ActiveWorkoutDialog } from '../components/workout-dialogs';
import { WorkoutDateSelector } from '../components/workout-date-selector';
import { WorkoutSessionList } from '../components/workout-session-list';
import { useWorkoutList } from '../hooks/use-workout-list';
import { useWorkoutDate } from '../hooks/use-workout-date';

// Keep the list viewport above the floating tab bar in app/(tabs)/_layout.tsx.
const floatingTabBarHeight = 64;
const floatingTabBarBottom = space[24];

function WorkoutsHomeContent() {
  const { rawColors } = useTheme();
  const insets = useSafeAreaInsets();
  const { pageWidth, pageGutter, itemGap } = useResponsiveLayout();
  const blurTarget = useRef<View>(null);
  const { date, setDate } = useWorkoutDate();
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [overlay, setOverlay] = useState<'calculators' | 'stats' | null>(null);
  const { workouts, activeElsewhere, loading, creating, error, conflictId, setConflictId, reload, create } = useWorkoutList(date);
  const open = (id: number) => router.push({ pathname: '/workout-session/[id]', params: { id: String(id) } });
  const newWorkout = async () => { const id = await create(); if (id !== null) open(id); };
  return (
    <FrostedModalProvider blurTarget={blurTarget}>
      <View style={{ flex: 1, backgroundColor: rawColors.background }}>
        <Stack.Screen options={{ title: 'Workouts', headerShown: false }} />
        <BlurTargetView ref={blurTarget} style={{ flex: 1, minHeight: 0, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: rawColors.background }}>
          <View style={{
            flex: 1, minHeight: 0, minWidth: 0, width: '100%', maxWidth: pageWidth, alignSelf: 'center',
            paddingHorizontal: pageGutter, paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom, space[16]) + floatingTabBarBottom + floatingTabBarHeight,
          }}>
            <View style={{ flexShrink: 0, gap: itemGap, paddingBottom: space[16] }}>
              <WorkoutHeader onCalculators={() => setOverlay('calculators')} onStats={() => setOverlay('stats')} />
              <WorkoutDateSelector date={date} onChange={setDate} onCalendar={() => setCalendarVisible(true)} />
              <Pressable onPress={() => void newWorkout()} disabled={creating} accessibilityRole="button" accessibilityState={{ disabled: creating }}
                className="active:opacity-70" style={{ minHeight: sizes.touchTarget, backgroundColor: rawColors.primary, opacity: creating ? 0.8 : 1, borderRadius: radius.action, paddingVertical: itemGap, paddingHorizontal: pageGutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[12] }}>
                {creating ? <ActivityIndicator color={rawColors.primaryForeground} /> : <MaterialCommunityIcons name="plus" size={sizes.icon} color={rawColors.primaryForeground} />}
                <Text style={{ flexShrink: 1, minWidth: 0, textAlign: 'center', color: rawColors.primaryForeground, ...typography.body, fontWeight: '700' }}>{creating ? 'Creating workout…' : 'New Workout'}</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[8], alignItems: 'center', justifyContent: 'space-between', paddingTop: space[6] }}>
                <Text accessibilityRole="header" style={{ flexShrink: 1, color: rawColors.foreground, ...typography.section }}>Workouts</Text>
                <Text style={{ flexShrink: 1, color: rawColors.foregroundMuted, ...typography.caption, fontVariant: ['tabular-nums'] }}>{workouts.length} {workouts.length === 1 ? 'workout' : 'workouts'}</Text>
              </View>
            </View>
            <WorkoutSessionList key={date.toDateString()} workouts={workouts} activeElsewhere={activeElsewhere}
              loading={loading} error={error} onRefresh={() => void reload()} onOpen={open}
              showHealthMetrics={appCapabilities.healthMetrics} onHealthMetrics={() => router.push('/user-metrics')} />
          </View>
        </BlurTargetView>
        <WorkoutOverlays active={overlay} onClose={() => setOverlay(null)} blurTarget={blurTarget} />
        <WorkoutCalendar visible={calendarVisible} date={date} onSelect={(next) => { setDate(next); setCalendarVisible(false); }} onClose={() => setCalendarVisible(false)} />
        <ActiveWorkoutDialog visible={conflictId !== null} onClose={() => setConflictId(null)} onOpen={() => {
          if (conflictId === null) return;
          setSelectedWorkoutId(conflictId); open(conflictId); setConflictId(null);
        }} />
      </View>
    </FrostedModalProvider>
  );
}

export default function WorkoutsHomeScreen() {
  return <WorkoutThemeBoundary><WorkoutsHomeContent /></WorkoutThemeBoundary>;
}
