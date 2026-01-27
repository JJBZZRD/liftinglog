import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { timerStore, type Timer } from "../lib/timerStore";
import { useTheme } from "../lib/theme/ThemeContext";

// Helper function to format seconds as MM:SS
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

interface TimerModalProps {
  visible: boolean;
  onClose: () => void;
  exerciseId: number;
  exerciseName: string;
  currentTimer: Timer | null;
  minutes: string;
  seconds: string;
  onMinutesChange: (value: string) => void;
  onSecondsChange: (value: string) => void;
  onSaveRestTime?: (seconds: number) => Promise<void>;
}

const PRESETS = [
  { label: "0:30", minutes: "0", seconds: "30" },
  { label: "1:00", minutes: "1", seconds: "0" },
  { label: "1:30", minutes: "1", seconds: "30" },
  { label: "2:00", minutes: "2", seconds: "0" },
  { label: "2:30", minutes: "2", seconds: "30" },
  { label: "3:00", minutes: "3", seconds: "0" },
];

export default function TimerModal({
  visible,
  onClose,
  exerciseId,
  exerciseName,
  currentTimer,
  minutes,
  seconds,
  onMinutesChange,
  onSecondsChange,
  onSaveRestTime,
}: TimerModalProps) {
  const { rawColors } = useTheme();

  const handleStartTimer = async () => {
    const mins = parseInt(minutes, 10) || 0;
    const secs = parseInt(seconds, 10) || 0;
    const totalSeconds = mins * 60 + secs;

    if (totalSeconds <= 0) return;

    // Save the rest time for this exercise
    if (onSaveRestTime) {
      await onSaveRestTime(totalSeconds);
    }

    let timerId: string;
    if (currentTimer) {
      timerStore.updateTimerDuration(currentTimer.id, totalSeconds);
      timerId = currentTimer.id;
    } else {
      timerId = timerStore.createTimer(exerciseId, exerciseName, totalSeconds);
    }

    await timerStore.startTimer(timerId);
    onClose();
  };

  const handleResetTimer = async () => {
    if (currentTimer) {
      await timerStore.resetTimer(currentTimer.id);
    }
  };

  const handleDeleteTimer = async () => {
    if (currentTimer) {
      await timerStore.deleteTimer(currentTimer.id);
    }
    onClose();
  };

  const applyPreset = (presetMinutes: string, presetSeconds: string) => {
    onMinutesChange(presetMinutes);
    onSecondsChange(presetSeconds);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 justify-center items-center bg-overlay-dark" onPress={onClose}>
        <View 
          className="rounded-2xl p-6 w-[85%] max-w-[400px] bg-surface"
          onStartShouldSetResponder={() => true}
        >
          <Text className="text-xl font-bold mb-5 text-center text-foreground">Rest Timer</Text>

          {/* Current timer status if exists */}
          {currentTimer && (
            <View className="rounded-xl p-4 mb-5 items-center bg-surface-secondary">
              <Text className="text-sm mb-1 text-foreground-secondary">
                {currentTimer.isRunning ? "Running" : "Paused"}
              </Text>
              <Text className="text-3xl font-bold text-primary">
                {formatTime(currentTimer.remainingSeconds)}
              </Text>
            </View>
          )}

          {/* Time input */}
          <View className="flex-row items-center justify-center gap-2 mb-5">
            <View className="items-center">
              <Text className="text-xs mb-1 text-foreground-secondary">Minutes</Text>
              <TextInput
                className="rounded-lg px-4 py-3 text-2xl font-semibold text-center w-20 bg-surface-secondary text-foreground"
                value={minutes}
                onChangeText={onMinutesChange}
                placeholder="0"
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <Text className="text-3xl font-semibold mt-4 text-foreground">:</Text>
            <View className="items-center">
              <Text className="text-xs mb-1 text-foreground-secondary">Seconds</Text>
              <TextInput
                className="rounded-lg px-4 py-3 text-2xl font-semibold text-center w-20 bg-surface-secondary text-foreground"
                value={seconds}
                onChangeText={onSecondsChange}
                placeholder="0"
                placeholderTextColor={rawColors.foregroundMuted}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
          </View>

          {/* Quick presets */}
          <View className="flex-row flex-wrap gap-2 justify-center mb-6">
            {PRESETS.map((preset) => (
              <Pressable
                key={preset.label}
                className="px-4 py-2 rounded-full border border-border bg-surface-secondary"
                onPress={() => applyPreset(preset.minutes, preset.seconds)}
              >
                <Text className="text-sm font-medium text-primary">{preset.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Action buttons */}
          <View className="flex-row gap-3 justify-center">
            {currentTimer && (
              <>
                <Pressable
                  className="flex-row items-center justify-center px-4 py-3 rounded-lg gap-1.5 border bg-surface"
                  style={{ borderColor: rawColors.destructive }}
                  onPress={handleDeleteTimer}
                >
                  <MaterialCommunityIcons name="delete" size={20} color={rawColors.destructive} />
                </Pressable>
                <Pressable
                  className="flex-row items-center justify-center px-4 py-3 rounded-lg gap-1.5 bg-surface-secondary"
                  onPress={handleResetTimer}
                >
                  <MaterialCommunityIcons name="refresh" size={20} color={rawColors.foregroundSecondary} />
                </Pressable>
              </>
            )}
            <Pressable 
              className="flex-row items-center justify-center px-4 py-3 rounded-lg gap-1.5 bg-surface-secondary" 
              onPress={onClose}
            >
              <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
            </Pressable>
            <Pressable 
              className="flex-row items-center justify-center px-4 py-3 rounded-lg gap-1.5 flex-1 max-w-[120px] bg-primary" 
              onPress={handleStartTimer}
            >
              <MaterialCommunityIcons name="play" size={20} color={rawColors.surface} />
              <Text className="text-base font-semibold text-primary-foreground">
                {currentTimer ? "Update" : "Start"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
