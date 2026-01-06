import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
  const { themeColors } = useTheme();
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
      <Pressable style={[styles.modalOverlay, { backgroundColor: themeColors.overlayDark }]} onPress={onClose}>
        <View style={[styles.timerModalContent, { backgroundColor: themeColors.surface }]} onStartShouldSetResponder={() => true}>
          <Text style={[styles.modalTitle, { color: themeColors.text }]}>Rest Timer</Text>

          {/* Current timer status if exists */}
          {currentTimer && (
            <View style={[styles.currentTimerStatus, { backgroundColor: themeColors.surfaceSecondary }]}>
              <Text style={[styles.currentTimerLabel, { color: themeColors.textSecondary }]}>
                {currentTimer.isRunning ? "Running" : "Paused"}
              </Text>
              <Text style={[styles.currentTimerTime, { color: themeColors.primary }]}>
                {formatTime(currentTimer.remainingSeconds)}
              </Text>
            </View>
          )}

          {/* Time input */}
          <View style={styles.timerInputContainer}>
            <View style={styles.timerInputGroup}>
              <Text style={[styles.timerInputLabel, { color: themeColors.textSecondary }]}>Minutes</Text>
              <TextInput
                style={[styles.timerInput, { backgroundColor: themeColors.surfaceSecondary, color: themeColors.text }]}
                value={minutes}
                onChangeText={onMinutesChange}
                placeholder="0"
                placeholderTextColor={themeColors.textPlaceholder}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <Text style={[styles.timerSeparator, { color: themeColors.text }]}>:</Text>
            <View style={styles.timerInputGroup}>
              <Text style={[styles.timerInputLabel, { color: themeColors.textSecondary }]}>Seconds</Text>
              <TextInput
                style={[styles.timerInput, { backgroundColor: themeColors.surfaceSecondary, color: themeColors.text }]}
                value={seconds}
                onChangeText={onSecondsChange}
                placeholder="0"
                placeholderTextColor={themeColors.textPlaceholder}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
          </View>

          {/* Quick presets */}
          <View style={styles.timerPresetsContainer}>
            {PRESETS.map((preset) => (
              <Pressable
                key={preset.label}
                style={[styles.timerPreset, { backgroundColor: themeColors.surfaceSecondary, borderColor: themeColors.border }]}
                onPress={() => applyPreset(preset.minutes, preset.seconds)}
              >
                <Text style={[styles.timerPresetText, { color: themeColors.primary }]}>{preset.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Action buttons */}
          <View style={styles.timerModalButtons}>
            {currentTimer && (
              <>
                <Pressable
                  style={[styles.modalButton, styles.deleteTimerButton, { backgroundColor: themeColors.surface, borderColor: themeColors.error }]}
                  onPress={handleDeleteTimer}
                >
                  <MaterialCommunityIcons name="delete" size={20} color={themeColors.error} />
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.resetTimerButton, { backgroundColor: themeColors.surfaceSecondary }]}
                  onPress={handleResetTimer}
                >
                  <MaterialCommunityIcons name="refresh" size={20} color={themeColors.textSecondary} />
                </Pressable>
              </>
            )}
            <Pressable style={[styles.modalButton, styles.cancelButton, { backgroundColor: themeColors.surfaceSecondary }]} onPress={onClose}>
              <Text style={[styles.cancelButtonText, { color: themeColors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalButton, styles.startTimerButton, { backgroundColor: themeColors.primary }]} onPress={handleStartTimer}>
              <MaterialCommunityIcons name="play" size={20} color={themeColors.surface} />
              <Text style={[styles.startTimerButtonText, { color: themeColors.surface }]}>
                {currentTimer ? "Update" : "Start"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  timerModalContent: {
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 20,
    textAlign: "center",
  },
  currentTimerStatus: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: "center",
  },
  currentTimerLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  currentTimerTime: {
    fontSize: 32,
    fontWeight: "700",
  },
  timerInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  timerInputGroup: {
    alignItems: "center",
  },
  timerInputLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  timerInput: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    width: 80,
  },
  timerSeparator: {
    fontSize: 32,
    fontWeight: "600",
    marginTop: 16,
  },
  timerPresetsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginBottom: 24,
  },
  timerPreset: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  timerPresetText: {
    fontSize: 14,
    fontWeight: "500",
  },
  timerModalButtons: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },
  modalButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  deleteTimerButton: {
    borderWidth: 1,
  },
  resetTimerButton: {},
  cancelButton: {},
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  startTimerButton: {
    flex: 1,
    maxWidth: 120,
  },
  startTimerButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});

