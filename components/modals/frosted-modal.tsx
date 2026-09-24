import { BlurView } from 'expo-blur';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { BaseModalProps } from './BaseModal';
import type { ModalBlurTarget } from './frosted-modal-context';

type Props = BaseModalProps & {
  blurTarget: ModalBlurTarget;
  /** Distance below the safe-area top for top-aligned tool panels. */
  topOffset?: number;
};

/** Shared native-modal chrome. The referenced page target never contains this native window. */
export function FrostedModal({
  visible, onClose, children, blurTarget, contentStyle, maxWidth = 420,
  centerContent = true, topOffset = 20, animationType = 'fade',
}: Props) {
  const { rawColors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const animate = !reducedMotion && animationType !== 'none';

  return (
    <Modal visible={visible} transparent presentationStyle="overFullScreen" statusBarTranslucent
      animationType={animate ? animationType : 'none'} onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <BlurView pointerEvents="none" accessible={false} blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus" intensity={42} tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill} />
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss dialog" onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: rawColors.overlay }]} />
        <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{
            flex: 1, alignItems: 'center',
            justifyContent: centerContent ? 'center' : 'flex-start', paddingHorizontal: 16,
            paddingTop: insets.top + (centerContent ? 16 : topOffset), paddingBottom: insets.bottom + 24
          }}>
          <Animated.View accessibilityViewIsModal
            entering={animate ? FadeInDown.duration(260).reduceMotion(ReduceMotion.System) : undefined}
            style={[{
              width: '100%', maxWidth, flexShrink: 1, maxHeight: '100%', borderRadius: 24,
              borderWidth: 1, borderColor: `${rawColors.border}B3`, backgroundColor: `${rawColors.surface}EB`,
              overflow: 'hidden', padding: 22
            }, contentStyle]}>
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}
              style={{ flexGrow: 0, flexShrink: 1 }}>
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
