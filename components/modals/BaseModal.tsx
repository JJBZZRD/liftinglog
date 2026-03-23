/**
 * Base Modal Component
 * 
 * A reusable modal wrapper that provides consistent styling and behavior
 * for all modals in the app. This consolidates the modal backdrop and
 * content container patterns used across:
 * - exercises.tsx (5 modals)
 * - RecordTab.tsx
 * - edit-workout.tsx
 * - HistoryTab.tsx
 */
import { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface BaseModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Called when the modal should close (backdrop press or back button) */
  onClose: () => void;
  /** Modal content */
  children: ReactNode;
  /** Animation type (default: 'fade') */
  animationType?: "none" | "slide" | "fade";
  /** Optional custom styles for the content container */
  contentStyle?: ViewStyle;
  /** Maximum width of the content container (default: 420) */
  maxWidth?: number;
  /** Whether to center content vertically (default: true) */
  centerContent?: boolean;
}

/**
 * BaseModal provides a consistent modal experience with:
 * - Semi-transparent backdrop that closes modal on press
 * - Centered content container with rounded corners
 * - Consistent padding and maximum width
 * - Back button support (Android)
 */
export default function BaseModal({
  visible,
  onClose,
  children,
  animationType = "fade",
  contentStyle,
  maxWidth = 420,
  centerContent = true,
}: BaseModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Pressable
          style={StyleSheet.absoluteFill}
          className="bg-overlay"
          onPress={onClose}
        />
        <View
          pointerEvents="box-none"
          style={[
            styles.contentContainer,
            centerContent ? styles.centeredContent : null,
            {
              paddingTop: centerContent ? 16 : Math.max(insets.top + 20, 36),
              paddingBottom: Math.max(insets.bottom + 16, 16),
              paddingHorizontal: 16,
            },
          ]}
        >
          <View
            className="w-full rounded-xl p-4 bg-surface"
            style={[{ maxWidth }, contentStyle]}
          >
            {children}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    alignItems: "center",
  },
  centeredContent: {
    justifyContent: "center",
  },
});

export { BaseModal };
