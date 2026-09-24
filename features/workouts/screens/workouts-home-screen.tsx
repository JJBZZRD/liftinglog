import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurTargetView } from 'expo-blur';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FrostedModalProvider } from '@/components/modals/frosted-modal-context';
import { WorkoutCalendar } from '@/components/workouts/workout-calendar';
import { WorkoutHeader } from '@/components/workouts/workout-header';
import { WorkoutOverlays } from '@/components/workouts/workout-overlays';
import { ScrollFade } from '@/components/workouts/scroll-fade';
import { WorkoutThemeBoundary } from '@/components/workouts/workout-theme';
import { appCapabilities } from '@/lib/config/releaseProfile';
import { useTheme } from '@/lib/theme/ThemeContext';
import { setSelectedWorkoutId } from '@/lib/workouts/selection-store';
import { ActiveWorkoutDialog } from '../components/workout-dialogs';
import { WorkoutDateSelector } from '../components/workout-date-selector';
import { WorkoutEmpty, WorkoutError } from '../components/workout-feedback';
import { WorkoutSessionRow } from '../components/workout-session-row';
import { useWorkoutList } from '../hooks/use-workout-list';
import { useWorkoutDate } from '../hooks/use-workout-date';
import { dateLabel, workoutTitle } from '../workout-types';

function WorkoutsHomeContent() {
  const { rawColors } = useTheme();
  const insets = useSafeAreaInsets();
  const blurTarget = useRef<View>(null);
  const { date, setDate } = useWorkoutDate();
  const [scrolled, setScrolled] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [overlay, setOverlay] = useState<'calculators' | 'stats' | null>(null);
  const { workouts, activeElsewhere, loading, creating, error, conflictId, setConflictId, reload, create } = useWorkoutList(date);
  const open = (id: number) => router.push({ pathname: '/workout-session/[id]', params: { id: String(id) } });
  const newWorkout = async () => { const id = await create(); if (id !== null) open(id); };
  return (
    <FrostedModalProvider blurTarget={blurTarget}>
    <View style={{ flex: 1, backgroundColor: rawColors.background }}>
      <Stack.Screen options={{ title: 'Workouts', headerShown: false }} />
      <BlurTargetView ref={blurTarget} style={{ flex: 1, backgroundColor: rawColors.background }}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}
          style={{ backgroundColor: rawColors.background }}
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 8)} scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={loading && workouts.length > 0} onRefresh={() => void reload()} tintColor={rawColors.primary} />}
          contentContainerStyle={{ paddingHorizontal: 22, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) + 92, gap: 18, maxWidth: 700, width: '100%', alignSelf: 'center' }}>
          <WorkoutHeader onCalculators={() => setOverlay('calculators')} onStats={() => setOverlay('stats')} />
          <WorkoutDateSelector date={date} onChange={setDate} onCalendar={() => setCalendarVisible(true)} />
          <Pressable onPress={() => void newWorkout()} disabled={creating} accessibilityRole="button" accessibilityState={{ disabled: creating }}
            className="active:opacity-70" style={{ backgroundColor: rawColors.primary, opacity: creating ? 0.8 : 1, borderRadius: 16, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            {creating ? <ActivityIndicator color={rawColors.primaryForeground} /> : <MaterialCommunityIcons name="plus" size={23} color={rawColors.primaryForeground} />}
            <Text style={{ color: rawColors.primaryForeground, fontSize: 16, fontWeight: '700' }}>{creating ? 'Creating workout…' : 'New Workout'}</Text>
          </Pressable>
          {activeElsewhere && <Pressable accessibilityRole="button" accessibilityLabel="Continue active workout" onPress={() => open(activeElsewhere.id)}
            className="active:opacity-70" style={{ flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: rawColors.border, padding: 16, borderRadius: 16, backgroundColor: rawColors.surface }}>
            <MaterialCommunityIcons name="play-outline" color={rawColors.primary} size={25} />
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ color: rawColors.primary, fontSize: 12, fontWeight: '600' }}>Continue workout · {dateLabel(new Date(activeElsewhere.startedAt))}</Text>
              <Text numberOfLines={1} style={{ color: rawColors.foreground, fontSize: 15, fontWeight: '600' }}>{workoutTitle(activeElsewhere)}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" color={rawColors.foregroundMuted} size={20} />
          </Pressable>}
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
              <Text accessibilityRole="header" style={{ color: rawColors.foreground, fontSize: 18, fontWeight: '600', letterSpacing: -0.3 }}>Workouts</Text>
              <Text style={{ color: rawColors.foregroundMuted, fontSize: 12 }}>{workouts.length} {workouts.length === 1 ? 'workout' : 'workouts'}</Text>
            </View>
            {error && <WorkoutError message={error} onRetry={() => void reload()} />}
            {loading && workouts.length === 0 ? <ActivityIndicator style={{ padding: 40 }} color={rawColors.primary} />
              : workouts.map((workout, index) => <WorkoutSessionRow key={workout.id} workout={workout} index={index} onPress={() => open(workout.id)} />)}
            {!loading && !error && workouts.length === 0 && <WorkoutEmpty title="A fresh page" description="No workouts on this day yet. Start a session and build your next personal best." />}
          </View>
          {appCapabilities.healthMetrics && <View style={{ borderTopWidth: 1, borderColor: rawColors.borderLight, paddingTop: 14, gap: 4 }}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/user-metrics')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
              <MaterialCommunityIcons name="heart-pulse" size={22} color={rawColors.foregroundSecondary} />
              <Text style={{ flex: 1, color: rawColors.foregroundSecondary, fontSize: 15, fontWeight: '600' }}>Health metrics</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={rawColors.foregroundMuted} />
            </Pressable>
          </View>}
        </ScrollView>
      </BlurTargetView>
      {scrolled && <ScrollFade edge="top" blurTarget={blurTarget} />}
      <ScrollFade edge="bottom" blurTarget={blurTarget} inset={88} />
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
