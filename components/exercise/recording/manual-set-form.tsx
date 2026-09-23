import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { appCapabilities } from '@/lib/config/releaseProfile';
import { getWeightUnitLabel } from '@/lib/utils/units';
import type { RecordingController } from './use-recording-controller';

type Props = Pick<RecordingController,
  'rawColors' | 'unitPreference' | 'weight' | 'reps' | 'note' | 'setNote' | 'currentTimer' |
  'isManualFormExpanded' | 'setIsManualFormExpanded' | 'inProgramMode' | 'manualFormExpansion' |
  'nextSetIndex' | 'manualFormAnimatedStyle' | 'setWeight' | 'setReps' | 'handleAddSet' |
  'handleTimerPress' | 'handleTimerLongPress' | 'handleRecordVideoPress' | 'timerDisplayText' | 'canOpenCamera'>;

export default function ManualSetForm({ rawColors, unitPreference, weight, reps, note, setNote, currentTimer,
  isManualFormExpanded, setIsManualFormExpanded, inProgramMode, manualFormExpansion, nextSetIndex,
  manualFormAnimatedStyle, setWeight, setReps, handleAddSet, handleTimerPress, handleTimerLongPress,
  handleRecordVideoPress, timerDisplayText, canOpenCamera }: Props) {
  const toggleForm = () => {
    const expanded = !isManualFormExpanded;
    setIsManualFormExpanded(expanded);
    manualFormExpansion.value = expanded ? 1 : 0;
  };

  return (
    <View className="border border-border bg-surface p-5" style={{ borderRadius: 18 }}>
      <View className="flex-row items-center justify-between mb-5">
        <Text className="text-xs font-semibold tracking-widest uppercase text-foreground-muted">Next set</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={inProgramMode ? 'Toggle additional set form' : 'Current set number'}
          disabled={!inProgramMode} onPress={toggleForm} className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-light active:opacity-70">
          <Text className="text-sm font-semibold text-primary">Set {String(nextSetIndex).padStart(2, '0')}</Text>
          {inProgramMode && <MaterialCommunityIcons name={isManualFormExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={rawColors.primary} />}
        </Pressable>
      </View>
      <Animated.View style={inProgramMode ? manualFormAnimatedStyle : undefined}
        pointerEvents={inProgramMode && !isManualFormExpanded ? 'none' : 'auto'}>
        <View className="flex-row gap-3 mb-4">
          <View className="flex-1 rounded-2xl bg-surface-secondary px-4 pt-3 pb-2">
            <Text className="text-xs font-medium text-foreground-secondary">WEIGHT · {getWeightUnitLabel(unitPreference).toUpperCase()}</Text>
            <TextInput accessibilityLabel="Set weight" value={weight} onChangeText={setWeight} placeholder="0"
              placeholderTextColor={rawColors.foregroundMuted} keyboardType="decimal-pad" selectTextOnFocus
              className="text-3xl font-semibold text-foreground py-3" style={{ fontVariant: ['tabular-nums'] }} />
          </View>
          <View className="flex-1 rounded-2xl bg-surface-secondary px-4 pt-3 pb-2">
            <Text className="text-xs font-medium text-foreground-secondary">REPS</Text>
            <TextInput accessibilityLabel="Set reps" value={reps} onChangeText={setReps} placeholder="0"
              placeholderTextColor={rawColors.foregroundMuted} keyboardType="number-pad" selectTextOnFocus
              className="text-3xl font-semibold text-foreground py-3" style={{ fontVariant: ['tabular-nums'] }} />
          </View>
        </View>
        <Text className="text-sm font-medium mb-2 text-foreground-secondary">Set note · optional</Text>
        <TextInput accessibilityLabel="Set note" value={note} onChangeText={setNote} placeholder="Add a set note..."
          placeholderTextColor={rawColors.foregroundMuted} multiline
          className="rounded-2xl bg-surface-secondary px-4 py-3 mb-4 text-base text-foreground min-h-[56px]"
          style={{ textAlignVertical: 'top' }} />
        <View className="flex-row gap-3 items-center mb-4">
          <Pressable accessibilityRole="button" accessibilityLabel="Rest timer" onPress={handleTimerPress}
            onLongPress={handleTimerLongPress} delayLongPress={400}
            className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-2xl bg-surface-secondary active:opacity-70">
            <MaterialCommunityIcons name={currentTimer?.isRunning ? 'pause' : 'timer-outline'} size={20} color={rawColors.primary} />
            <Text className="text-base font-semibold text-primary" style={{ fontVariant: ['tabular-nums'] }}>{timerDisplayText}</Text>
          </Pressable>
          {appCapabilities.videoRecording && <Pressable accessibilityRole="button" accessibilityLabel="Record video"
            disabled={!canOpenCamera} onPress={handleRecordVideoPress} className="p-3 rounded-2xl bg-surface-secondary active:opacity-70"
            style={{ opacity: canOpenCamera ? 1 : 0.4 }}>
            <MaterialCommunityIcons name="video-outline" size={22} color={rawColors.primary} />
          </Pressable>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Add Set" onPress={handleAddSet}
          className="flex-row items-center justify-center gap-2 py-4 rounded-2xl bg-primary active:opacity-70">
          <MaterialCommunityIcons name="plus" size={22} color={rawColors.primaryForeground} />
          <Text className="text-base font-semibold text-primary-foreground">Add Set</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
