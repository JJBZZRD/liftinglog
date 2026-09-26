import { BlurTargetView } from 'expo-blur';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/design-system/button';
import { Icon } from '@/components/design-system/icon';
import { ConfirmDialog } from '@/components/design-system/confirm-dialog';
import { MetricStrip } from '@/components/design-system/metric-strip';
import { StatusPill } from '@/components/design-system/status-pill';
import { FrostedModalProvider } from '@/components/modals/frosted-modal-context';
import { WorkoutThemeBoundary } from '@/components/workouts/workout-theme';
import { IconButton } from '@/components/workouts/workout-ui';
import { ScrollFade } from '@/components/workouts/scroll-fade';
import { useUnitPreference } from '@/lib/contexts/UnitPreferenceContext';
import { radius, space, typography } from '@/lib/design-system/tokens';
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
import { dateLabel, deleteWorkoutCopy, timeLabel, workoutTitle } from '../workout-types';

function WorkoutDetailContent() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(typeof params.id === 'string' ? params.id : '');
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const insets = useSafeAreaInsets();
  const { pageWidth, pageGutter } = useResponsiveLayout();
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
          contentContainerStyle={{ paddingTop: insets.top + space[8], paddingHorizontal: pageGutter, paddingBottom: workout ? footerHeight + space[20] : Math.max(insets.bottom, space[20]) + 30, gap: space[12], maxWidth: pageWidth, minWidth: 0, width: '100%', alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[8] }}>
            <IconButton icon="arrow-left" label="Go back" onPress={back} />
            {workout && <Text style={{ flexShrink: 1, color: rawColors.foregroundMuted, ...typography.caption, fontVariant: ['tabular-nums'] }}>
              {dateLabel(new Date(workout.startedAt))} · {timeLabel(workout.startedAt)}
            </Text>}
          </View>
          {loading && !workout && <ActivityIndicator color={rawColors.primary} style={{ paddingVertical: 60 }} />}
          {error && !editing && !confirmingDelete && <WorkoutError message={error} onRetry={() => void detail.reload()} />}
          {!loading && !workout && !error && <WorkoutEmpty title="Workout unavailable" description="This workout may have been deleted. Return to Workouts to choose another session." />}
          {workout && <>
            <View style={{ flexDirection: 'row' }}>
              <StatusPill status={active ? 'live' : 'completed'} />
            </View>
            <Pressable onPress={() => setEditing(true)} disabled={busy} accessibilityRole="button" accessibilityLabel={`${workoutTitle(workout)}. Edit workout name and note`}>
              <Text accessibilityRole="header" style={{ ...typography.detailTitle, color: rawColors.foreground }}>{workoutTitle(workout)}</Text>
            </Pressable>
            <MetricStrip items={[
              { value: workout.exerciseCount, label: workout.exerciseCount === 1 ? 'exercise' : 'exercises' },
              { value: workout.setCount, label: workout.setCount === 1 ? 'set' : 'sets' },
              { value: formatVolumeFromKg(workout.volumeKg, unitPreference, { abbreviate: true }), label: getWeightUnitLabel(unitPreference) },
            ]} />
            <Pressable onPress={() => setEditing(true)} disabled={busy} accessibilityRole="button"
              accessibilityLabel={workout.note?.trim() ? `Workout note: ${workout.note.trim()}. Edit note` : 'Add a note'}
              // hitSlop keeps a 44 dp target while the row stays as compact as the mockup.
              hitSlop={{ top: 12, bottom: 12 }} className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="pencil" size={18} color={rawColors.foregroundMuted} />
              <Text style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 21, color: workout.note?.trim() ? rawColors.foregroundSecondary : rawColors.foregroundMuted }}>{workout.note?.trim() || 'Add a note'}</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: space[8], alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 2 }}>
              <Text accessibilityRole="header" style={{ flexShrink: 1, color: rawColors.foreground, ...typography.section }}>Exercises</Text>
              <Text style={{ flexShrink: 1, color: rawColors.foregroundMuted, ...typography.caption, fontVariant: ['tabular-nums'] }}>{workout.exercises.length} {workout.exercises.length === 1 ? 'exercise' : 'exercises'}</Text>
            </View>
            {pbError && <WorkoutError message={pbError} onRetry={() => void detail.reload()} />}
            {workout.exercises.map((entry, index) => <WorkoutExerciseEntry key={entry.id} entry={entry} index={index} workoutStartedAt={workout.startedAt} pbBadges={pbBadges} onSetPress={openSet} onPress={() => {
              if (active) setSelectedWorkoutId(id);
              router.push({ pathname: '/exercise/[id]', params: { id: String(entry.exerciseId), name: entry.exerciseName, weId: String(entry.id), workoutId: String(id) } });
            }} />)}
            {workout.exercises.length === 0 && workout.unassignedSets.length === 0 && <WorkoutEmpty title="Your session starts here" description="Choose an exercise and record a set to add it here." />}
            {workout.unassignedSets.length > 0 && <View style={{ borderWidth: 1, borderColor: rawColors.border, borderRadius: radius.card, backgroundColor: rawColors.surface, padding: space[16], gap: space[6] }}>
              <Text style={{ color: rawColors.foreground, fontSize: 18, fontWeight: '600' }}>Other logged sets</Text>
              {workout.unassignedSets.map((set, index) => <View key={set.id}>
                <Text style={{ paddingTop: space[8], paddingBottom: space[4], color: rawColors.foregroundSecondary, ...typography.caption, fontWeight: '600' }}>{set.exerciseName}</Text>
                <WorkoutSetRow set={set} index={index} pbBadge={pbBadges.get(set.id)} onPress={() => openSet(set.id)} />
              </View>)}
            </View>}
            <Button label="Add exercise" icon="plus" variant="secondary" disabled={busy} onPress={() => void addExercise()} />
            <Button label="Delete workout" icon="trash" variant="destructive-outline" disabled={busy} onPress={askDelete} />
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
            <Button label={active ? 'Complete Workout' : 'Resume Workout'} icon={active ? 'check' : 'play'} size="large"
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
