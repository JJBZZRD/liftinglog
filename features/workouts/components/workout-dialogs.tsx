import { ScrollView, Text, View, Pressable } from 'react-native';
import BaseModal from '@/components/modals/BaseModal';
import type { WorkoutExercise } from '../workout-types';

export function ActiveWorkoutDialog({ visible, onClose, onOpen }: { visible: boolean; onClose: () => void; onOpen: () => void }) {
  return (
    <BaseModal visible={visible} onClose={onClose}>
      <Text className="text-xl font-bold text-foreground mb-3">A workout is in progress</Text>
      <Text className="text-base text-foreground-secondary mb-6">Complete your current workout before starting or resuming another.</Text>
      <View className="flex-row gap-3">
        <Pressable accessibilityRole="button" onPress={onClose} className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary">
          <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onOpen} className="flex-1 items-center justify-center p-3.5 rounded-lg bg-primary">
          <Text className="text-base font-semibold text-primary-foreground">Open workout</Text>
        </Pressable>
      </View>
    </BaseModal>
  );
}

export function CompleteWorkoutDialog({ entries, busy, error, onClose, onComplete }: {
  entries: WorkoutExercise[] | null; busy: boolean; error?: string | null; onClose: () => void; onComplete: () => void;
}) {
  return (
    <BaseModal visible={entries !== null} onClose={busy ? () => {} : onClose}>
      <Text className="text-xl font-bold text-foreground mb-3">Finish these exercises?</Text>
      <Text className="text-base text-foreground-secondary mb-4">These exercise entries are still in progress. Completing this workout will finish them together and keep every logged set.</Text>
      <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
        {entries?.map((entry, index) => (
          <View key={entry.id} className="flex-row gap-3">
            <Text className="text-sm text-foreground-muted">{index + 1}.</Text>
            <Text className="text-base text-foreground flex-1">{entry.exerciseName}{entry.sets.length === 0 ? ' · no sets' : ` · ${entry.sets.length} sets`}</Text>
          </View>
        ))}
      </ScrollView>
      {error && <Text selectable accessibilityRole="alert" className="text-sm text-destructive mb-4">{error}</Text>}
      <View className="flex-row gap-3">
        <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary">
          <Text className="text-base font-semibold text-foreground-secondary">Keep training</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onComplete} className="flex-1 items-center justify-center p-3.5 rounded-lg bg-primary">
          <Text className="text-base font-semibold text-primary-foreground">{busy ? 'Completing…' : 'Complete all'}</Text>
        </Pressable>
      </View>
    </BaseModal>
  );
}
