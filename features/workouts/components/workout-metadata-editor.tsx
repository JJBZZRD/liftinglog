import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import AppModal from '@/components/modals/BaseModal';
import { useFrostedModalTarget } from '@/components/modals/frosted-modal-context';
import { useTheme } from '@/lib/theme/ThemeContext';

export function WorkoutMetadataEditor({ visible, name, note, busy, error, onClose, onSave }: {
  visible: boolean; name: string; note: string | null; busy: boolean; error: string | null;
  onClose: () => void; onSave: (name: string, note: string) => Promise<boolean>;
}) {
  const { rawColors } = useTheme();
  const frostedTarget = useFrostedModalTarget();
  const [draftName, setDraftName] = useState(name);
  const [draftNote, setDraftNote] = useState(note ?? '');
  useEffect(() => {
    if (visible) { setDraftName(name); setDraftNote(note ?? ''); }
  }, [visible, name, note]);
  const save = async () => {
    if (draftName.trim() && await onSave(draftName, draftNote)) onClose();
  };
  return (
    <AppModal visible={visible} onClose={busy ? () => { } : onClose}>
      <KeyboardAvoidingView enabled={!frostedTarget} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 450 }}>
          <Text className="text-xl font-bold text-foreground mb-5">Edit workout</Text>
          <Text className="text-sm font-semibold text-foreground-secondary mb-2">Workout name</Text>
          <TextInput accessibilityLabel="Workout name" autoFocus value={draftName} onChangeText={setDraftName} editable={!busy}
            maxLength={120} returnKeyType="next" placeholder="Workout name" placeholderTextColor={rawColors.foregroundMuted}
            className="text-base text-foreground bg-surface-secondary rounded-lg p-3.5 mb-5" />
          <Text className="text-sm font-semibold text-foreground-secondary mb-2">Workout note</Text>
          <TextInput accessibilityLabel="Workout note" value={draftNote} onChangeText={setDraftNote} editable={!busy}
            multiline textAlignVertical="top" placeholder="How did your session feel?" placeholderTextColor={rawColors.foregroundMuted}
            style={{ minHeight: 120 }} className="text-base text-foreground bg-surface-secondary rounded-lg p-3.5 mb-5" />
          {error && <Text accessibilityRole="alert" selectable className="text-sm text-destructive mb-4">{error}</Text>}
          <View className="flex-row gap-3">
            <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary">
              <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !draftName.trim() }} disabled={busy || !draftName.trim()} onPress={() => void save()} className="flex-1 items-center justify-center p-3.5 rounded-lg bg-primary">
              <Text className="text-base font-semibold text-primary-foreground">{busy ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppModal>
  );
}
