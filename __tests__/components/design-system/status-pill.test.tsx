import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Icon } from '@/components/design-system/icon';
import { LiveDot, StatusPill } from '@/components/design-system/status-pill';

let mockReducedMotion = false;
const mockWithRepeat = jest.fn((animation: unknown, count: number, reverse: boolean) => ({ repeat: { animation, count, reverse } }));
const mockWithTiming = jest.fn((toValue: number, config?: unknown) => ({ toValue, config }));
const mockCancelAnimation = jest.fn();

jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Text: 'Text',
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const easing = (value: unknown) => value;
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
    withRepeat: (...args: [unknown, number, boolean]) => mockWithRepeat(...args),
    withTiming: (...args: [number, unknown]) => mockWithTiming(...args),
    cancelAnimation: (...args: unknown[]) => mockCancelAnimation(...args),
    Easing: { out: easing, quad: 'quad', linear: 'linear' },
  };
});
jest.mock('@/lib/theme/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, rawColors: new Proxy({}, { get: () => '#123456' }) }),
}));

type Node = { type: unknown; props: Record<string, any>; findAll(predicate: (node: Node) => boolean): Node[]; findAllByType(type: unknown): Node[]; findByType(type: unknown): Node };
let tree: ReturnType<typeof renderer.create>;

async function render(element: React.ReactElement) {
  await act(async () => { tree = renderer.create(element); });
  return tree;
}

const accessibleNodes = () =>
  tree.root.findAll((node: Node) => typeof node.type === 'string' && node.props.accessible === true);
const textContent = () => tree.root.findAllByType('Text' as never).map((node: Node) => node.props.children);

describe('StatusPill', () => {
  beforeEach(() => { mockReducedMotion = false; jest.clearAllMocks(); });
  afterEach(async () => { await act(async () => tree.unmount()); });

  it('shows "In progress" with a live dot for the live status', async () => {
    await render(<StatusPill status="live" />);
    expect(textContent()).toEqual(['In progress']);
    expect(tree.root.findAllByType(LiveDot)).toHaveLength(1);
  });

  it('shows "Completed" with a check for the completed status', async () => {
    await render(<StatusPill status="completed" />);
    expect(textContent()).toEqual(['Completed']);
    expect(tree.root.findByType(Icon).props.name).toBe('check');
    expect(tree.root.findAllByType(LiveDot)).toHaveLength(0);
  });

  it.each(['live', 'completed'] as const)('lets a custom label override the default for %s', async (status) => {
    await render(<StatusPill status={status} label="Resting" />);
    expect(textContent()).toEqual(['Resting']);
    expect(accessibleNodes().map((node: Node) => node.props.accessibilityLabel)).toEqual(['Resting']);
  });

  it.each([
    ['live', 'In progress'],
    ['completed', 'Completed'],
  ] as const)('exposes exactly one accessible label for %s', async (status, text) => {
    await render(<StatusPill status={status} />);
    const nodes = accessibleNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].props.accessibilityLabel).toBe(text);
  });
});

describe('LiveDot', () => {
  beforeEach(() => { mockReducedMotion = false; jest.clearAllMocks(); });
  afterEach(async () => { await act(async () => tree.unmount()); });

  it('starts an infinite repeating pulse normally and cancels it on unmount', async () => {
    await render(<LiveDot />);
    expect(mockWithRepeat).toHaveBeenCalledTimes(1);
    const [animation, count, reverse] = mockWithRepeat.mock.calls[0];
    expect(animation).toEqual({ toValue: 1, config: expect.objectContaining({ duration: 2200 }) });
    expect(count).toBe(-1);
    expect(reverse).toBe(false);
    // The ring is visible at the start of the cycle.
    expect(tree.root.findByType('AnimatedView' as never).props.style[1].opacity).toBeGreaterThan(0);

    mockCancelAnimation.mockClear();
    await act(async () => tree.unmount());
    expect(mockCancelAnimation).toHaveBeenCalledTimes(1);
    await act(async () => { tree = renderer.create(<></>); });
  });

  it('does not animate under reduced motion and hides the ring', async () => {
    mockReducedMotion = true;
    await render(<LiveDot />);
    expect(mockWithRepeat).not.toHaveBeenCalled();
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(mockCancelAnimation).toHaveBeenCalled();
    expect(tree.root.findByType('AnimatedView' as never).props.style[1].opacity).toBe(0);
  });

  it('does not animate when pulse is off', async () => {
    await render(<LiveDot pulse={false} />);
    expect(mockWithRepeat).not.toHaveBeenCalled();
    expect(tree.root.findByType('AnimatedView' as never).props.style[1].opacity).toBe(0);
  });
});
