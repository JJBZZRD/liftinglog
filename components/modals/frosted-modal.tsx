import { BlurView } from 'expo-blur';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { glass, motion, radius, sizes, space } from '@/lib/design-system/tokens';
import { useResponsiveLayout } from '@/lib/design-system/use-responsive-layout';
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
  visible, onClose, children, blurTarget, contentStyle, maxWidth = sizes.dialogMaxWidth,
  centerContent = true, sheet = false, topOffset = space[20], animationType = 'fade',
}: Props) {
  const { rawColors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { pageGutter } = useResponsiveLayout();
  const reducedMotion = useReducedMotion();
  const animate = !reducedMotion && animationType !== 'none';

  return (
    <Modal visible={visible} transparent presentationStyle="overFullScreen" statusBarTranslucent
      animationType={animate ? animationType : 'none'} onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <BlurView pointerEvents="none" accessible={false} blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus" intensity={glass.blurIntensity} tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill} />
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss dialog" onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: rawColors.overlay }]} />
        <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{
            flex: 1, alignItems: 'center',
            justifyContent: sheet ? 'flex-end' : centerContent ? 'center' : 'flex-start',
            // A sheet sits 12 dp from the sides and 16 dp from the bottom, as in the mockups.
            paddingLeft: insets.left + (sheet ? space[12] : space[16]), paddingRight: insets.right + (sheet ? space[12] : space[16]),
            paddingTop: insets.top + (centerContent || sheet ? space[16] : topOffset), paddingBottom: insets.bottom + (sheet ? space[16] : space[24])
          }}>
          <Animated.View accessibilityViewIsModal
            entering={animate ? FadeInDown.duration(motion.dialogEnter).reduceMotion(ReduceMotion.System) : undefined}
            style={[{
              width: '100%', maxWidth, minWidth: 0, flexShrink: 1, maxHeight: '100%', borderRadius: radius.dialog,
              borderWidth: 1, borderColor: `${rawColors.border}${glass.borderAlpha}`, backgroundColor: `${rawColors.surface}${glass.surfaceAlpha}`,
              overflow: 'hidden', ...(sheet ? { paddingTop: space[20], paddingHorizontal: space[16], paddingBottom: space[16] } : { padding: pageGutter })
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
