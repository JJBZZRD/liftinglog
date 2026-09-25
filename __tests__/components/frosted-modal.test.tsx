import React, { createRef } from 'react';
import renderer, { act } from 'react-test-renderer';
import { View } from 'react-native';
import { BaseModal } from '@/components/modals/BaseModal';
import { FrostedModalProvider } from '@/components/modals/frosted-modal-context';

let mockReducedMotion = false;
jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal', Platform: { OS: 'ios' }, StyleSheet: { absoluteFill: { position: 'absolute' }, create: (styles: unknown) => styles },
  useWindowDimensions: () => ({ width: 448, height: 998, scale: 3, fontScale: 1 }),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('react-native-reanimated', () => {
  const entrance = { duration: () => entrance, reduceMotion: () => entrance };
  return {
    __esModule: true, default: { View: 'AnimatedView' }, FadeInDown: entrance,
    ReduceMotion: { System: 'system' }, useReducedMotion: () => mockReducedMotion
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 12, left: 0, right: 0 }) }));
jest.mock('@/lib/theme/ThemeContext', () => ({
  useTheme: () => ({
    isDark: true,
    rawColors: { surface: '#19232F', border: '#354354', overlay: 'rgba(7,13,23,0.35)' }
  })
}));

let tree: ReturnType<typeof renderer.create>;
const target = createRef<View>();

describe('scoped frosted modal presentation', () => {
  beforeEach(() => { mockReducedMotion = false; });
  afterEach(async () => { await act(async () => tree.unmount()); });

  it('retains the legacy surface and caller animation outside the opt-in scope', async () => {
    await act(async () => { tree = renderer.create(<BaseModal visible onClose={() => { }} animationType="slide"><View /></BaseModal>); });
    expect(tree.root.findAllByType('BlurView')).toHaveLength(0);
    expect(tree.root.findAllByType('AnimatedView')).toHaveLength(0);
    expect(tree.root.findByType('Modal').props.animationType).toBe('slide');
    expect(tree.root.findAll((node: { props: Record<string, unknown> }) => node.props.className === 'w-full rounded-xl p-4 bg-surface')).toHaveLength(1);
  });

  it('uses the supplied page target and keeps backdrop/hardware close handlers intact', async () => {
    const close = jest.fn();
    await act(async () => {
      tree = renderer.create(
        <FrostedModalProvider blurTarget={target}><BaseModal visible onClose={close}><View testID="contents" /></BaseModal></FrostedModalProvider>
      );
    });
    const blur = tree.root.findByType('BlurView');
    expect(blur.props.blurTarget).toBe(target);
    expect(blur.props.blurMethod).toBe('dimezisBlurViewSdk31Plus');
    expect(blur.props.tint).toBe('dark');
    expect(tree.root.findByType('AnimatedView').props.accessibilityViewIsModal).toBe(true);
    await act(async () => {
      tree.root.findByType('Modal').props.onRequestClose();
      tree.root.findByType('Pressable').props.onPress();
    });
    expect(close).toHaveBeenCalledTimes(2);
    expect(tree.root.findByProps({ testID: 'contents' })).toBeTruthy();
  });

  it('turns off both native and content transitions when reduced motion is enabled', async () => {
    mockReducedMotion = true;
    await act(async () => {
      tree = renderer.create(
        <FrostedModalProvider blurTarget={target}><BaseModal visible onClose={() => { }}><View /></BaseModal></FrostedModalProvider>
      );
    });
    expect(tree.root.findByType('Modal').props.animationType).toBe('none');
    expect(tree.root.findByType('AnimatedView').props.entering).toBeUndefined();
  });

  it('keeps tall content scrollable and keyboard-aware within the safe area', async () => {
    await act(async () => {
      tree = renderer.create(
        <FrostedModalProvider blurTarget={target}><BaseModal visible onClose={() => { }} maxWidth={480}><View /></BaseModal></FrostedModalProvider>
      );
    });
    const keyboard = tree.root.findByType('KeyboardAvoidingView');
    expect(keyboard.props.behavior).toBe('padding');
    expect(keyboard.props.style).toMatchObject({ paddingTop: 40, paddingBottom: 36 });
    expect(tree.root.findByType('ScrollView').props.keyboardShouldPersistTaps).toBe('handled');
    expect(tree.root.findByType('AnimatedView').props.style[0]).toMatchObject({ maxWidth: 480, maxHeight: '100%', flexShrink: 1 });
  });
});
