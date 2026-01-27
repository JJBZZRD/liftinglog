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
import { Modal, Pressable, View, ViewStyle } from "react-native";

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
  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable
        className={`flex-1 p-4 bg-overlay ${centerContent ? "justify-center items-center" : ""}`}
        onPress={onClose}
      >
        <Pressable
          className="w-full rounded-xl p-4 bg-surface"
          style={[{ maxWidth }, contentStyle]}
          // Prevent closing when pressing on content
          onPress={(e) => e.stopPropagation()}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * ConfirmModal - A specialized modal for confirmation dialogs
 */
interface ConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  destructive?: boolean;
}

export { BaseModal };
