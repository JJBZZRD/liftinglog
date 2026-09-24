import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurTargetView } from 'expo-blur';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FrostedModalProvider } from '@/components/modals/frosted-modal-context';
import { WorkoutThemeBoundary } from '@/components/workouts/workout-theme';
import { IconButton, Metric, WorkoutStatus } from '@/components/workouts/workout-ui';
import { ScrollFade } from '@/components/workouts/scroll-fade';
import { useUnitPreference } from '@/lib/contexts/UnitPreferenceContext';
import { useTheme } from '@/lib/theme/ThemeContext';
import { formatVolumeFromKg, getWeightUnitLabel } from '@/lib/utils/units';
import { requestExerciseNavigation, setSelectedWorkoutId } from '@/lib/workouts/selection-store';
import { ActiveWorkoutDialog, CompleteWorkoutDialog } from '../components/workout-dialogs';
import { WorkoutExerciseEntry, WorkoutSetRow } from '../components/workout-exercise-entry';
import { WorkoutEmpty, WorkoutError } from '../components/workout-feedback';
import { WorkoutMetadataEditor } from '../components/workout-metadata-editor';
import { useWorkoutDetail } from '../hooks/use-workout-detail';
import { useWorkoutCurrentPBBadges } from '../hooks/use-workout-current-pb-badges';
import { dateLabel, workoutTitle } from '../workout-types';

function WorkoutDetailContent() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(typeof params.id === 'string' ? params.id : '');
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const insets = useSafeAreaInsets();
  const blurTarget = useRef<View>(null);
  const [editing, setEditing] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const detail = useWorkoutDetail(id);
  const { workout, loading, busy, error } = detail;
  const { pbBadges, pbError } = useWorkoutCurrentPBBadges(workout);
  const active = workout?.completedAt === null;
  const back = () => router.canGoBack() ? router.back() : router.replace('/(tabs)');
  const openSet = (setId: number) => router.push({ pathname: '/set/[id]', params: { id: String(setId) } });
  const addExercise = async () => {
    if (!workout || busy) return;
    // Resuming through the domain layer checks for a conflicting active workout.
    if (!active && !await detail.resume()) return;
    requestExerciseNavigation(id);
    router.dismissTo('/(tabs)');
  };

  return (
    <FrostedModalProvider blurTarget={blurTarget}>
    <View style={{ flex: 1, backgroundColor: rawColors.background }}>
      <Stack.Screen options={{ title: workout ? workoutTitle(workout) : 'Workout', headerShown: false }} />
      <BlurTargetView ref={blurTarget} style={{ flex: 1, backgroundColor: rawColors.background }}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}
          style={{ backgroundColor: rawColors.background }}
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 8)} scrollEventThrottle={16}
          contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 22, paddingBottom: Math.max(insets.bottom, 20) + 30, gap: 26, maxWidth: 700, width: '100%', alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: -10 }}>
            <IconButton icon="arrow-left" label="Back to workouts" onPress={back} />
            <Text style={{ flex: 1, color: rawColors.foregroundSecondary, fontSize: 15, fontWeight: '600' }}>Workouts</Text>
            {workout && <WorkoutStatus active={active} />}
          </View>
          {loading && !workout && <ActivityIndicator color={rawColors.primary} style={{ paddingVertical: 60 }} />}
          {error && !editing && <WorkoutError message={error} onRetry={() => void detail.reload()} />}
          {!loading && !workout && !error && <WorkoutEmpty title="Workout unavailable" description="This workout may have been deleted. Return to Workouts to choose another session." />}
          {workout && <>
            <View style={{ gap: 12 }}>
              <Text style={{ color: rawColors.foregroundMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>
                {dateLabel(new Date(workout.startedAt)).toUpperCase()} · {new Date(workout.startedAt).getFullYear()}
              </Text>
              <Pressable onPress={() => setEditing(true)} disabled={busy} accessibilityRole="button" accessibilityLabel="Edit workout name and note" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <Text accessibilityRole="header" style={{ flex: 1, fontSize: 32, lineHeight: 39, fontWeight: '700', letterSpacing: -0.8, color: rawColors.foreground }}>{workoutTitle(workout)}</Text>
                <MaterialCommunityIcons name="pencil-outline" size={20} color={rawColors.foregroundMuted} style={{ marginTop: 11 }} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 18, paddingVertical: 23, borderTopWidth: 1, borderBottomWidth: 1, borderColor: rawColors.border }}>
              <Metric label="Exercises" value={workout.exerciseCount} />
              <Metric label="Sets" value={workout.setCount} />
              <Metric label={`Volume · ${getWeightUnitLabel(unitPreference)}`} value={formatVolumeFromKg(workout.volumeKg, unitPreference, { abbreviate: true })} />
            </View>
            <Pressable onPress={() => setEditing(true)} disabled={busy} accessibilityRole="button" accessibilityLabel="Edit workout note"
              style={{ padding: 18, borderWidth: 1, borderColor: rawColors.border, borderRadius: 16, backgroundColor: rawColors.surface, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="text-box-outline" size={16} color={rawColors.foregroundMuted} />
                <Text style={{ flex: 1, color: rawColors.foregroundMuted, fontSize: 11, letterSpacing: 1.3, fontWeight: '600' }}>WORKOUT NOTE</Text>
                <MaterialCommunityIcons name="pencil-outline" size={15} color={rawColors.foregroundMuted} />
              </View>
              <Text style={{ color: workout.note?.trim() ? rawColors.foregroundSecondary : rawColors.foregroundMuted, fontSize: 14, lineHeight: 22 }}>{workout.note?.trim() || 'Add a note about this session…'}</Text>
            </Pressable>
            <View style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: rawColors.foregroundMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>EXERCISES</Text>
                <Text style={{ color: rawColors.foregroundMuted, fontSize: 12 }}>{workout.exercises.filter((entry) => entry.completedAt !== null).length} / {workout.exercises.length} complete</Text>
              </View>
              {pbError && <WorkoutError message={pbError} onRetry={() => void detail.reload()} />}
              {workout.exercises.map((entry, index) => <WorkoutExerciseEntry key={entry.id} entry={entry} index={index} pbBadges={pbBadges} onSetPress={openSet} onPress={() => {
                if (active) setSelectedWorkoutId(id);
                router.push({ pathname: '/exercise/[id]', params: { id: String(entry.exerciseId), name: entry.exerciseName, weId: String(entry.id), workoutId: String(id) } });
              }} />)}
              {workout.exercises.length === 0 && workout.unassignedSets.length === 0 && <WorkoutEmpty title="Your session starts here" description="Choose an exercise and record a set to add it here." />}
              {workout.unassignedSets.length > 0 && <View style={{ borderWidth: 1, borderColor: rawColors.border, borderRadius: 18, backgroundColor: rawColors.surface, overflow: 'hidden' }}>
                <Text style={{ color: rawColors.foregroundSecondary, padding: 18, fontWeight: '600' }}>Other logged sets</Text>
                {workout.unassignedSets.map((set, index) => <View key={set.id}>
                  <Text style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 6, color: rawColors.foreground, fontSize: 15, fontWeight: '600' }}>{set.exerciseName}</Text>
                  <WorkoutSetRow set={set} index={index} pbBadge={pbBadges.get(set.id)} onPress={() => openSet(set.id)} />
                </View>)}
              </View>}
              <Pressable onPress={() => void addExercise()} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }}
                className="active:opacity-70" style={{ borderWidth: 1, borderColor: rawColors.border, borderRadius: 16, padding: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: rawColors.surface }}>
                <MaterialCommunityIcons name="plus" size={21} color={rawColors.primary} />
                <Text style={{ color: rawColors.primary, fontSize: 16, fontWeight: '600' }}>Add Exercise</Text>
              </Pressable>
            </View>
            <Pressable disabled={busy} onPress={() => void (active ? detail.requestComplete() : detail.resume())} accessibilityRole="button" accessibilityState={{ disabled: busy }}
              className="active:opacity-70" style={{ backgroundColor: rawColors.primary, opacity: busy ? 0.8 : 1, borderRadius: 16, padding: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {busy ? <ActivityIndicator color={rawColors.primaryForeground} /> : <MaterialCommunityIcons name={active ? 'check' : 'play-outline'} size={22} color={rawColors.primaryForeground} />}
              <Text style={{ color: rawColors.primaryForeground, fontSize: 16, fontWeight: '700' }}>{active ? 'Complete Workout' : 'Resume Workout'}</Text>
            </Pressable>
          </>}
        </ScrollView>
      </BlurTargetView>
      {scrolled && <ScrollFade edge="top" blurTarget={blurTarget} />}
      <ScrollFade edge="bottom" blurTarget={blurTarget} />
      <CompleteWorkoutDialog entries={detail.unfinished} busy={busy} error={error} onClose={detail.cancelComplete} onComplete={() => void detail.complete()} />
      <ActiveWorkoutDialog visible={detail.conflictId !== null} onClose={() => detail.setConflictId(null)} onOpen={() => {
        if (detail.conflictId === null) return;
        const activeId = detail.conflictId;
        detail.setConflictId(null); setSelectedWorkoutId(activeId);
        router.replace({ pathname: '/workout-session/[id]', params: { id: String(activeId) } });
      }} />
      {workout && <WorkoutMetadataEditor visible={editing} name={workoutTitle(workout)} note={workout.note} busy={busy} error={error} onClose={() => setEditing(false)} onSave={detail.save} />}
    </View>
    </FrostedModalProvider>
  );
}

export default function WorkoutDetailScreen() {
  return <WorkoutThemeBoundary><WorkoutDetailContent /></WorkoutThemeBoundary>;
}
