import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { HoldProgress, usePressAndHold } from '@/components/design-system/press-and-hold';

let mockReducedMotion = false;
type TimingCallback = (finished?: boolean) => void;
const mockWithTiming = jest.fn((toValue: number, config?: unknown, callback?: TimingCallback) => ({ type: 'timing', toValue, config, callback }));
const mockWithDelay = jest.fn((delay: number, animation: unknown) => ({ type: 'delay', delay, animation }));
const mockCancelAnimation = jest.fn();

jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Text: 'Text',
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: { View: 'AnimatedView' },
    useReducedMotion: () => mockReducedMotion,
    useSharedValue: (initial: unknown) => {
      const ref = React.useRef<{ value: unknown } | null>(null);
      if (!ref.current) ref.current = { value: initial };
      return ref.current;
    },
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withTiming: (...args: [number, unknown?, TimingCallback?]) => mockWithTiming(...args),
    withDelay: (...args: [number, unknown]) => mockWithDelay(...args),
    cancelAnimation: (...args: unknown[]) => mockCancelAnimation(...args),
    runOnJS: (fn: unknown) => fn,
    Easing: { linear: 'linear', quad: 'quad', out: (value: unknown) => value },
  };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));
jest.mock('@/lib/theme/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, rawColors: new Proxy({}, { get: () => '#123456' }) }),
}));

type HookArgs = Parameters<typeof usePressAndHold>[0];
let hook: ReturnType<typeof usePressAndHold>;
let tree: ReturnType<typeof renderer.create>;
let onHold: jest.Mock;
let onPress: jest.Mock;

function Card(props: HookArgs) {
  hook = usePressAndHold(props);
  return <Pressable {...hook.pressableProps} />;
}

async function render(props: Partial<HookArgs> = {}) {
  await act(async () => {
    tree = renderer.create(<Card onHold={onHold} onPress={onPress} holdLabel="Delete workout" {...props} />);
  });
}

const card = () => tree.root.findByType('Pressable' as never);
const call = async (name: 'onPressIn' | 'onPressOut' | 'onPress') => act(async () => { card().props[name](); });
/** The completion callback of the fill timing scheduled by the latest `onPressIn`. */
const fillCallback = () => {
  const fill = mockWithTiming.mock.calls.filter(([toValue]) => toValue === 1).at(-1)!;
  return fill[2]!;
};

describe('usePressAndHold', () => {
  beforeEach(() => {
    mockReducedMotion = false;
    jest.clearAllMocks();
    onHold = jest.fn();
    onPress = jest.fn();
  });
  afterEach(async () => { await act(async () => tree.unmount()); });

  it('schedules a delayed fill on press-in; completing it fires a haptic and calls onHold', async () => {
    await render();
    await call('onPressIn');
    expect(mockWithDelay).toHaveBeenCalledTimes(1);
    const [delay, animation] = mockWithDelay.mock.calls[0];
    expect(delay).toBe(120);
    expect(animation).toMatchObject({ type: 'timing', toValue: 1, config: { duration: 500, easing: 'linear' } });
    expect(hook.progress.value).toMatchObject({ type: 'delay', delay: 120 });
    expect(onHold).not.toHaveBeenCalled();

    await act(async () => fillCallback()(true));
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('medium');
  });

  it('swallows the tap that ends a completed hold, then lets the next tap through', async () => {
    await render();
    await call('onPressIn');
    await act(async () => fillCallback()(true));
    await call('onPressOut');
    expect(hook.progress.value).toBe(0);
    await call('onPress');
    expect(onPress).not.toHaveBeenCalled();

    await call('onPress');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('lets an ordinary tap through after a completed hold whose tap never arrived', async () => {
    await render();
    await call('onPressIn');
    await act(async () => fillCallback()(true));
    await call('onPressOut');
    // A fresh press resets the swallow flag.
    await call('onPressIn');
    await call('onPressOut');
    await call('onPress');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('cancels on early release without calling onHold', async () => {
    await render();
    await call('onPressIn');
    const interrupted = fillCallback();
    await call('onPressOut');
    expect(mockCancelAnimation).toHaveBeenCalledWith(hook.progress);
    expect(hook.progress.value).toMatchObject({ type: 'timing', toValue: 0, config: { duration: 160 } });

    // Reanimated reports the cancelled fill as unfinished.
    await act(async () => interrupted(false));
    expect(onHold).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();

    await call('onPress');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does nothing on press-in when disabled', async () => {
    await render({ disabled: true });
    await call('onPressIn');
    expect(mockWithDelay).not.toHaveBeenCalled();
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(hook.progress.value).toBe(0);
  });

  it('exposes activate and a labelled longpress accessibility action', async () => {
    await render();
    expect(card().props.accessibilityActions).toEqual([
      { name: 'activate' }, { name: 'longpress', label: 'Delete workout' },
    ]);
    await act(async () => card().props.onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } }));
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    await act(async () => card().props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('ignores the longpress accessibility action when disabled', async () => {
    await render({ disabled: true });
    await act(async () => card().props.onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } }));
    expect(onHold).not.toHaveBeenCalled();
  });

  it('scales the card with progress, but not under reduced motion', async () => {
    await render();
    expect(hook.holdStyle).toEqual({ transform: [{ scale: 1 }] });
    hook.progress.value = 1;
    await act(async () => tree.update(<Card onHold={onHold} onPress={onPress} holdLabel="Delete workout" />));
    expect((hook.holdStyle as unknown as { transform: { scale: number }[] }).transform[0].scale).toBeCloseTo(0.97);

    mockReducedMotion = true;
    await act(async () => tree.update(<Card onHold={onHold} onPress={onPress} holdLabel="Delete workout" />));
    expect(hook.holdStyle).toEqual({ transform: [{ scale: 1 }] });
  });
});

describe('HoldProgress', () => {
  afterEach(async () => { await act(async () => tree.unmount()); });

  it('is hidden from touch and accessibility and tracks progress', async () => {
    await act(async () => { tree = renderer.create(<HoldProgress progress={{ value: 0.25 } as never} />); });
    const root = tree.root.findByProps({ pointerEvents: 'none' });
    expect(root.props.accessible).toBe(false);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    const [tint, bar] = tree.root.findAllByType('AnimatedView' as never);
    expect(tint.props.style[1]).toEqual({ opacity: 0.5 });
    expect(bar.props.style[1]).toEqual({ width: '25%' });
  });

  it('shows no tint at zero progress', async () => {
    await act(async () => { tree = renderer.create(<HoldProgress progress={{ value: 0 } as never} />); });
    const [tint, bar] = tree.root.findAllByType('AnimatedView' as never);
    expect(tint.props.style[1]).toEqual({ opacity: 0 });
    expect(bar.props.style[1]).toEqual({ width: '0%' });
  });
});
