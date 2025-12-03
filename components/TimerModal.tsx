import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { timerStore, type Timer } from "../lib/timerStore";

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
}: TimerModalProps) {
  const handleStartTimer = async () => {
    const mins = parseInt(minutes, 10) || 0;
    const secs = parseInt(seconds, 10) || 0;
    const totalSeconds = mins * 60 + secs;

    if (totalSeconds <= 0) return;

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
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.timerModalContent} onStartShouldSetResponder={() => true}>
          <Text style={styles.modalTitle}>Rest Timer</Text>

          {/* Current timer status if exists */}
          {currentTimer && (
            <View style={styles.currentTimerStatus}>
              <Text style={styles.currentTimerLabel}>
                {currentTimer.isRunning ? "Running" : "Paused"}
              </Text>
              <Text style={styles.currentTimerTime}>
                {formatTime(currentTimer.remainingSeconds)}
              </Text>
            </View>
          )}

          {/* Time input */}
          <View style={styles.timerInputContainer}>
            <View style={styles.timerInputGroup}>
              <Text style={styles.timerInputLabel}>Minutes</Text>
              <TextInput
                style={styles.timerInput}
                value={minutes}
                onChangeText={onMinutesChange}
                placeholder="0"
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <Text style={styles.timerSeparator}>:</Text>
            <View style={styles.timerInputGroup}>
              <Text style={styles.timerInputLabel}>Seconds</Text>
              <TextInput
                style={styles.timerInput}
                value={seconds}
                onChangeText={onSecondsChange}
                placeholder="0"
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
                style={styles.timerPreset}
                onPress={() => applyPreset(preset.minutes, preset.seconds)}
              >
                <Text style={styles.timerPresetText}>{preset.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Action buttons */}
          <View style={styles.timerModalButtons}>
            {currentTimer && (
              <>
                <Pressable
                  style={[styles.modalButton, styles.deleteTimerButton]}
                  onPress={handleDeleteTimer}
                >
                  <MaterialCommunityIcons name="delete" size={20} color="#FF3B30" />
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.resetTimerButton]}
                  onPress={handleResetTimer}
                >
                  <MaterialCommunityIcons name="refresh" size={20} color="#666" />
                </Pressable>
              </>
            )}
            <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalButton, styles.startTimerButton]} onPress={handleStartTimer}>
              <MaterialCommunityIcons name="play" size={20} color="#fff" />
              <Text style={styles.startTimerButtonText}>
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
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  timerModalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000",
    marginBottom: 20,
    textAlign: "center",
  },
  currentTimerStatus: {
    backgroundColor: "#f8f8f8",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: "center",
  },
  currentTimerLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  currentTimerTime: {
    fontSize: 32,
    fontWeight: "700",
    color: "#007AFF",
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
    color: "#666",
    marginBottom: 4,
  },
  timerInput: {
    backgroundColor: "#f5f5f5",
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
    color: "#000",
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
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e5e5ea",
  },
  timerPresetText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#007AFF",
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
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#FF3B30",
  },
  resetTimerButton: {
    backgroundColor: "#f5f5f5",
  },
  cancelButton: {
    backgroundColor: "#f5f5f5",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  startTimerButton: {
    backgroundColor: "#007AFF",
    flex: 1,
    maxWidth: 120,
  },
  startTimerButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});

