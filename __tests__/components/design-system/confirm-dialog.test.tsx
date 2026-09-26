import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Button } from '@/components/design-system/button';
import { ConfirmDialog } from '@/components/design-system/confirm-dialog';

jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Text: 'Text', ActivityIndicator: 'ActivityIndicator',
  ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView', Modal: 'Modal',
  Platform: { OS: 'ios' }, StyleSheet: { absoluteFill: { position: 'absolute' }, create: (styles: unknown) => styles },
  useWindowDimensions: () => ({ width: 448, height: 998, scale: 3, fontScale: 1 }),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('react-native-reanimated', () => {
  const entrance = { duration: () => entrance, reduceMotion: () => entrance };
  return {
    __esModule: true, default: { View: 'AnimatedView' }, FadeInDown: entrance,
    ReduceMotion: { System: 'system' }, useReducedMotion: () => false,
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 12, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/lib/theme/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    rawColors: new Proxy({}, { get: (_target, key) => (key === 'destructive' ? '#DE0000' : '#123456') }),
  }),
}));

type Node = { type: unknown; props: Record<string, any>; findAll(predicate: (node: Node) => boolean): Node[]; findAllByType(type: unknown): Node[]; findByType(type: unknown): Node };
type Props = React.ComponentProps<typeof ConfirmDialog>;
let tree: ReturnType<typeof renderer.create>;
let onConfirm: jest.Mock;
let onCancel: jest.Mock;

async function render(props: Partial<Props> = {}) {
  await act(async () => {
    tree = renderer.create(<ConfirmDialog visible title="Delete workout?" message="Its 5 exercises and 18 sets will be removed."
      confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} {...props} />);
  });
}

const button = (label: string) => tree.root.findAllByType(Button).find((node: Node) => node.props.label === label)!;
const hostPressable = (node: Node) => node.findByType('Pressable' as never);
const backdrop = () => tree.root.findByProps({ className: 'bg-overlay' });
const texts = () => tree.root.findAllByType('Text' as never).map((node: Node) => node.props.children);

describe('ConfirmDialog', () => {
  beforeEach(() => { onConfirm = jest.fn(); onCancel = jest.fn(); });
  afterEach(async () => { await act(async () => tree.unmount()); });

  it('renders the title as a header, the message and the emphasis', async () => {
    await render({ emphasis: 'This can’t be undone.' });
    expect(texts()).toEqual(expect.arrayContaining([
      'Delete workout?', 'Its 5 exercises and 18 sets will be removed.', 'This can’t be undone.',
    ]));
    expect(tree.root.findByProps({ children: 'Delete workout?' }).props.accessibilityRole).toBe('header');
    expect(tree.root.findByType('Modal' as never).props.visible).toBe(true);
  });

  it('omits the emphasis when not given', async () => {
    await render();
    expect(tree.root.findAll((node: Node) => node.type === 'Text' && node.props.style?.fontWeight === '500')).toHaveLength(0);
  });

  it('calls onConfirm and onCancel from their buttons', async () => {
    await render({ cancelLabel: 'Keep' });
    await act(async () => hostPressable(button('Delete')).props.onPress());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => hostPressable(button('Keep')).props.onPress());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on backdrop press and hardware back when idle', async () => {
    await render();
    await act(async () => {
      backdrop().props.onPress();
      tree.root.findByType('Modal' as never).props.onRequestClose();
    });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('ignores dismissal and disables both actions while busy', async () => {
    await render({ busy: true });
    await act(async () => {
      backdrop().props.onPress();
      tree.root.findByType('Modal' as never).props.onRequestClose();
    });
    expect(onCancel).not.toHaveBeenCalled();

    const cancel = hostPressable(button('Cancel'));
    expect(cancel.props.disabled).toBe(true);
    expect(cancel.props.accessibilityState).toMatchObject({ disabled: true });

    const confirm = hostPressable(button('Delete'));
    expect(confirm.props.disabled).toBe(true);
    expect(confirm.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(button('Delete').findAllByType('ActivityIndicator' as never)).toHaveLength(1);
  });

  it('renders the error as an alert', async () => {
    await render({ error: 'Could not delete the workout.' });
    const alert = tree.root.findByProps({ accessibilityRole: 'alert' });
    expect(alert.type).toBe('Text');
    expect(alert.props.children).toBe('Could not delete the workout.');
  });

  it('renders no alert without an error', async () => {
    await render({ error: null });
    expect(tree.root.findAllByProps({ accessibilityRole: 'alert' })).toHaveLength(0);
  });

  it('uses the destructive variant and a bin icon for the destructive tone', async () => {
    await render();
    expect(button('Delete').props.variant).toBe('destructive');
    expect(hostPressable(button('Delete')).props.className).toContain('bg-destructive');
    expect(button('Cancel').props.variant).toBe('secondary');
    const icons = tree.root.findAllByType('MaterialCommunityIcons' as never);
    expect(icons.map((icon: Node) => icon.props.name)).toEqual(['trash-can-outline', 'trash-can-outline']);
    expect(icons[0].props.color).toBe('#DE0000');
  });

  it('uses the primary variant and no default icon for the primary tone', async () => {
    await render({ tone: 'primary', confirmLabel: 'Finish' });
    expect(button('Finish').props.variant).toBe('primary');
    expect(hostPressable(button('Finish')).props.className).toContain('bg-primary');
    expect(tree.root.findAllByType('MaterialCommunityIcons' as never)).toHaveLength(0);
  });
});
