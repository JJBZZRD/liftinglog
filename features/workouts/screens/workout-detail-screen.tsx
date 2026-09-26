import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurTargetView } from 'expo-blur';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/design-system/button';
import { ConfirmDialog } from '@/components/design-system/confirm-dialog';
import { MetricStrip } from '@/components/design-system/metric-strip';
import { StatusPill } from '@/components/design-system/status-pill';
import { FrostedModalProvider } from '@/components/modals/frosted-modal-context';
import { WorkoutThemeBoundary } from '@/components/workouts/workout-theme';
import { IconButton } from '@/components/workouts/workout-ui';
import { ScrollFade } from '@/components/workouts/scroll-fade';
import { useUnitPreference } from '@/lib/contexts/UnitPreferenceContext';
import { radius, sizes, space, typography } from '@/lib/design-system/tokens';
import { useResponsiveLayout } from '@/lib/design-system/use-responsive-layout';
import { useScrollEdgeFades } from '@/lib/design-system/use-scroll-edge-fades';
import { useTheme } from '@/lib/theme/ThemeContext';
import { formatVolumeFromKg, getWeightUnitLabel } from '@/lib/utils/units';
import { setSelectedWorkoutId } from '@/lib/workouts/selection-store';
import { ActiveWorkoutDialog, CompleteWorkoutDialog } from '../components/workout-dialogs';
import { WorkoutExerciseEntry, WorkoutSetRow } from '../components/workout-exercise-entry';
import { WorkoutEmpty, WorkoutError } from '../components/workout-feedback';
import { WorkoutMetadataEditor } from '../components/workout-metadata-editor';
import { useWorkoutDetail } from '../hooks/use-workout-detail';
import { useWorkoutPBBadges } from '../hooks/use-workout-pb-badges';
import { dateLabel, deleteWorkoutCopy, workoutTitle } from '../workout-types';

function WorkoutDetailContent() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(typeof params.id === 'string' ? params.id : '');
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const insets = useSafeAreaInsets();
  const { pageWidth, pageGutter, cardPadding, itemGap } = useResponsiveLayout();
  const blurTarget = useRef<View>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The fixed footer's measured height pads the scroll content and sizes its fade.
  const [footerHeight, setFooterHeight] = useState(0);
  const { topOpacity, bottomOpacity, scrollProps } = useScrollEdgeFades();
  const detail = useWorkoutDetail(id);
  const { workout, loading, busy, error } = detail;
  const { pbBadges, pbError } = useWorkoutPBBadges(workout);
  const active = workout?.completedAt === null;
  const back = () => router.canGoBack() ? router.back() : router.replace('/(tabs)');
  const openSet = (setId: number) => router.push({ pathname: '/set/[id]', params: { id: String(setId) } });
  const addExercise = async () => {
    if (!workout || busy) return;
    // Resuming through the domain layer checks for a conflicting active workout.
    if (!active && !await detail.resume()) return;
    setSelectedWorkoutId(id);
    router.dismissTo({ pathname: '/(tabs)/exercises', params: { workoutId: String(id) } });
  };
  const askDelete = () => { detail.clearError(); setConfirmingDelete(true); };
  const confirmDelete = async () => {
    if (!await detail.remove()) return;
    setConfirmingDelete(false);
    back();
  };

  return (
    <FrostedModalProvider blurTarget={blurTarget}>
    <View style={{ flex: 1, backgroundColor: rawColors.background }}>
      <Stack.Screen options={{ title: workout ? workoutTitle(workout) : 'Workout', headerShown: false }} />
      <BlurTargetView ref={blurTarget} style={{ flex: 1, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: rawColors.background }}>
        <Animated.ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}
          style={{ backgroundColor: rawColors.background }}
          {...scrollProps}
          contentContainerStyle={{ paddingTop: insets.top + space[8], paddingHorizontal: pageGutter, paddingBottom: workout ? footerHeight + space[20] : Math.max(insets.bottom, space[20]) + 30, gap: itemGap + space[8], maxWidth: pageWidth, minWidth: 0, width: '100%', alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: space[8], marginLeft: -10 }}>
            <View style={{ flexDirection: 'row', minWidth: 0, flexShrink: 1, alignItems: 'center', gap: space[8] }}>
              <IconButton icon="arrow-left" label="Go back" onPress={back} />
              <Text style={{ flexShrink: 1, color: rawColors.foregroundSecondary, fontSize: 15, fontWeight: '600' }}>Workouts</Text>
            </View>
            {workout && <StatusPill status={active ? 'live' : 'completed'} />}
          </View>
          {loading && !workout && <ActivityIndicator color={rawColors.primary} style={{ paddingVertical: 60 }} />}
          {error && !editing && !confirmingDelete && <WorkoutError message={error} onRetry={() => void detail.reload()} />}
          {!loading && !workout && !error && <WorkoutEmpty title="Workout unavailable" description="This workout may have been deleted. Return to Workouts to choose another session." />}
          {workout && <>
            <View style={{ gap: space[12] }}>
              <Text style={{ color: rawColors.foregroundMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>
                {dateLabel(new Date(workout.startedAt)).toUpperCase()} · {new Date(workout.startedAt).getFullYear()}
              </Text>
              <Pressable onPress={() => setEditing(true)} disabled={busy} accessibilityRole="button" accessibilityLabel="Edit workout name and note" style={{ minHeight: sizes.touchTarget, flexDirection: 'row', alignItems: 'flex-start', gap: space[12] }}>
                <Text accessibilityRole="header" style={{ flex: 1, minWidth: 0, ...typography.title, color: rawColors.foreground }}>{workoutTitle(workout)}</Text>
                <MaterialCommunityIcons name="pencil-outline" size={20} color={rawColors.foregroundMuted} style={{ flexShrink: 0, marginTop: 11 }} />
              </Pressable>
            </View>
            <MetricStrip items={[
              { value: workout.exerciseCount, label: workout.exerciseCount === 1 ? 'exercise' : 'exercises' },
              { value: workout.setCount, label: workout.setCount === 1 ? 'set' : 'sets' },
              { value: formatVolumeFromKg(workout.volumeKg, unitPreference, { abbreviate: true }), label: getWeightUnitLabel(unitPreference) },
            ]} />
            <Pressable onPress={() => setEditing(true)} disabled={busy} accessibilityRole="button" accessibilityLabel="Edit workout note"
              style={{ padding: cardPadding, borderWidth: 1, borderColor: rawColors.border, borderRadius: radius.action, backgroundColor: rawColors.surface, gap: space[12] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[8] }}>
                <MaterialCommunityIcons name="text-box-outline" size={16} color={rawColors.foregroundMuted} style={{ flexShrink: 0 }} />
                <Text style={{ flex: 1, minWidth: 0, color: rawColors.foregroundMuted, fontSize: 11, letterSpacing: 1.3, fontWeight: '600' }}>WORKOUT NOTE</Text>
                <MaterialCommunityIcons name="pencil-outline" size={15} color={rawColors.foregroundMuted} style={{ flexShrink: 0 }} />
              </View>
              <Text style={{ color: workout.note?.trim() ? rawColors.foregroundSecondary : rawColors.foregroundMuted, fontSize: 14, lineHeight: 22 }}>{workout.note?.trim() || 'Add a note about this session…'}</Text>
            </Pressable>
            <View style={{ gap: itemGap }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[8], alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ flexShrink: 1, color: rawColors.foregroundMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>EXERCISES</Text>
                <Text style={{ flexShrink: 1, color: rawColors.foregroundMuted, fontSize: 12 }}>{workout.exercises.filter((entry) => entry.completedAt !== null).length} / {workout.exercises.length} complete</Text>
              </View>
              {pbError && <WorkoutError message={pbError} onRetry={() => void detail.reload()} />}
              {workout.exercises.map((entry, index) => <WorkoutExerciseEntry key={entry.id} entry={entry} index={index} pbBadges={pbBadges} onSetPress={openSet} onPress={() => {
                if (active) setSelectedWorkoutId(id);
                router.push({ pathname: '/exercise/[id]', params: { id: String(entry.exerciseId), name: entry.exerciseName, weId: String(entry.id), workoutId: String(id) } });
              }} />)}
              {workout.exercises.length === 0 && workout.unassignedSets.length === 0 && <WorkoutEmpty title="Your session starts here" description="Choose an exercise and record a set to add it here." />}
              {workout.unassignedSets.length > 0 && <View style={{ borderWidth: 1, borderColor: rawColors.border, borderRadius: radius.card, backgroundColor: rawColors.surface, overflow: 'hidden' }}>
                <Text style={{ color: rawColors.foregroundSecondary, padding: cardPadding, fontWeight: '600' }}>Other logged sets</Text>
                {workout.unassignedSets.map((set, index) => <View key={set.id}>
                  <Text style={{ paddingHorizontal: cardPadding, paddingTop: space[12], paddingBottom: space[6], color: rawColors.foreground, fontSize: 15, fontWeight: '600' }}>{set.exerciseName}</Text>
                  <WorkoutSetRow set={set} index={index} pbBadge={pbBadges.get(set.id)} onPress={() => openSet(set.id)} />
                </View>)}
              </View>}
              <Button label="Add Exercise" icon="plus" variant="secondary" disabled={busy} onPress={() => void addExercise()} />
            </View>
            <Button label="Delete workout" icon="trash-can-outline" variant="destructive-outline" disabled={busy} onPress={askDelete} />
          </>}
        </Animated.ScrollView>
      </BlurTargetView>
      <ScrollFade edge="top" solidExtent={insets.top} opacity={topOpacity} />
      {workout ? <>
        {/* The main action stays fixed at the bottom; a permanent fade lets content scroll under it. */}
        <ScrollFade edge="bottom" solidExtent={footerHeight} />
        <View onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingLeft: insets.left, paddingRight: insets.right }}>
          <View style={{ width: '100%', maxWidth: pageWidth, alignSelf: 'center', paddingHorizontal: pageGutter, paddingTop: space[12], paddingBottom: Math.max(insets.bottom, space[20]) }}>
            <Button label={active ? 'Complete Workout' : 'Resume Workout'} icon={active ? 'check' : 'play-outline'} size="large"
              busy={busy && !confirmingDelete} disabled={busy} onPress={() => void (active ? detail.requestComplete() : detail.resume())} />
          </View>
        </View>
      </> : <ScrollFade edge="bottom" solidExtent={insets.bottom} opacity={bottomOpacity} />}
      {workout && <ConfirmDialog visible={confirmingDelete} {...deleteWorkoutCopy(workout)} busy={busy} error={error}
        onConfirm={() => void confirmDelete()} onCancel={() => setConfirmingDelete(false)} />}
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
