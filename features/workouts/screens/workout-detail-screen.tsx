import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurTargetView } from 'expo-blur';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FrostedModalProvider } from '@/components/modals/frosted-modal-context';
import { WorkoutThemeBoundary } from '@/components/workouts/workout-theme';
import { IconButton, Metric, WorkoutStatus } from '@/components/workouts/workout-ui';
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
import { dateLabel, workoutTitle } from '../workout-types';

function WorkoutDetailContent() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(typeof params.id === 'string' ? params.id : '');
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const insets = useSafeAreaInsets();
  const { pageWidth, pageGutter, cardPadding, itemGap } = useResponsiveLayout();
  const blurTarget = useRef<View>(null);
  const [editing, setEditing] = useState(false);
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

  return (
    <FrostedModalProvider blurTarget={blurTarget}>
    <View style={{ flex: 1, backgroundColor: rawColors.background }}>
      <Stack.Screen options={{ title: workout ? workoutTitle(workout) : 'Workout', headerShown: false }} />
      <BlurTargetView ref={blurTarget} style={{ flex: 1, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: rawColors.background }}>
        <Animated.ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}
          style={{ backgroundColor: rawColors.background }}
          {...scrollProps}
          contentContainerStyle={{ paddingTop: insets.top + space[8], paddingHorizontal: pageGutter, paddingBottom: Math.max(insets.bottom, space[20]) + 30, gap: itemGap + space[8], maxWidth: pageWidth, minWidth: 0, width: '100%', alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: space[8], marginLeft: -10 }}>
            <View style={{ flexDirection: 'row', minWidth: 0, flexShrink: 1, alignItems: 'center', gap: space[8] }}>
              <IconButton icon="arrow-left" label="Go back" onPress={back} />
              <Text style={{ flexShrink: 1, color: rawColors.foregroundSecondary, fontSize: 15, fontWeight: '600' }}>Workouts</Text>
            </View>
            {workout && <WorkoutStatus active={active} />}
          </View>
          {loading && !workout && <ActivityIndicator color={rawColors.primary} style={{ paddingVertical: 60 }} />}
          {error && !editing && <WorkoutError message={error} onRetry={() => void detail.reload()} />}
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
            <View style={{ flexDirection: 'row', gap: itemGap, paddingVertical: cardPadding, borderTopWidth: 1, borderBottomWidth: 1, borderColor: rawColors.border }}>
              <Metric label="Exercises" value={workout.exerciseCount} />
              <Metric label="Sets" value={workout.setCount} />
              <Metric label={`Volume · ${getWeightUnitLabel(unitPreference)}`} value={formatVolumeFromKg(workout.volumeKg, unitPreference, { abbreviate: true })} />
            </View>
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
              <Pressable onPress={() => void addExercise()} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy }}
                className="active:opacity-70" style={{ minHeight: sizes.touchTarget, borderWidth: 1, borderColor: rawColors.border, borderRadius: radius.action, padding: cardPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[8], backgroundColor: rawColors.surface }}>
                <MaterialCommunityIcons name="plus" size={21} color={rawColors.primary} style={{ flexShrink: 0 }} />
                <Text style={{ flexShrink: 1, minWidth: 0, textAlign: 'center', color: rawColors.primary, ...typography.body, fontWeight: '600' }}>Add Exercise</Text>
              </Pressable>
            </View>
            <Pressable disabled={busy} onPress={() => void (active ? detail.requestComplete() : detail.resume())} accessibilityRole="button" accessibilityState={{ disabled: busy }}
              className="active:opacity-70" style={{ minHeight: sizes.touchTarget, backgroundColor: rawColors.primary, opacity: busy ? 0.8 : 1, borderRadius: radius.action, padding: cardPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[12] }}>
              {busy ? <ActivityIndicator color={rawColors.primaryForeground} /> : <MaterialCommunityIcons name={active ? 'check' : 'play-outline'} size={22} color={rawColors.primaryForeground} />}
              <Text style={{ flexShrink: 1, minWidth: 0, textAlign: 'center', color: rawColors.primaryForeground, ...typography.body, fontWeight: '700' }}>{active ? 'Complete Workout' : 'Resume Workout'}</Text>
            </Pressable>
          </>}
        </Animated.ScrollView>
      </BlurTargetView>
      <ScrollFade edge="top" solidExtent={insets.top} opacity={topOpacity} />
      <ScrollFade edge="bottom" solidExtent={insets.bottom} opacity={bottomOpacity} />
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
