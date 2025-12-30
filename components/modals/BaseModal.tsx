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
import { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../../lib/theme/colors';

interface BaseModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Called when the modal should close (backdrop press or back button) */
  onClose: () => void;
  /** Modal content */
  children: ReactNode;
  /** Animation type (default: 'fade') */
  animationType?: 'none' | 'slide' | 'fade';
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
  animationType = 'fade',
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
        style={[
          styles.overlay,
          centerContent && styles.overlayCenter,
        ]}
        onPress={onClose}
      >
        <Pressable
          style={[
            styles.content,
            { maxWidth },
            contentStyle,
          ]}
          // Prevent closing when pressing on content
          onPress={(e) => e.stopPropagation()}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    padding: 16,
  },
  overlayCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
  },
});

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


