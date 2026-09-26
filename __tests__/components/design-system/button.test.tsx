import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Button, type ButtonVariant } from '@/components/design-system/button';

jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Text: 'Text', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/lib/theme/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    rawColors: new Proxy({}, { get: (_target, key) => (key === 'destructive' ? '#DE0000' : '#123456') }),
  }),
}));

let tree: ReturnType<typeof renderer.create>;

async function render(element: React.ReactElement) {
  await act(async () => { tree = renderer.create(element); });
  return tree;
}

const pressable = () => tree.root.findByType('Pressable' as never);
const label = () => tree.root.findByType('Text' as never);

describe('Button', () => {
  afterEach(async () => { await act(async () => tree.unmount()); });

  it.each<[ButtonVariant, string, string]>([
    ['primary', 'bg-primary', 'text-primary-foreground'],
    ['secondary', 'bg-control border border-control-border', 'text-foreground-secondary'],
    ['destructive', 'bg-destructive', 'text-on-destructive'],
    ['destructive-outline', 'border border-destructive', 'text-destructive'],
  ])('applies the %s colour classes', async (variant, container, text) => {
    await render(<Button label="Save" variant={variant} onPress={() => { }} />);
    expect(pressable().props.className).toBe(`${container} active:opacity-70`);
    expect(label().props.className).toBe(text);
  });

  it('defaults to the primary variant', async () => {
    await render(<Button label="Save" onPress={() => { }} />);
    expect(pressable().props.className).toContain('bg-primary');
  });

  it('calls onPress when enabled and reports an idle accessibility state', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} />);
    expect(pressable().props.disabled).toBe(false);
    expect(pressable().props.accessibilityState).toEqual({ disabled: false, busy: false });
    await act(async () => pressable().props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks presses and reports disabled when disabled', async () => {
    await render(<Button label="Save" disabled onPress={() => { }} />);
    expect(pressable().props.disabled).toBe(true);
    expect(pressable().props.accessibilityState).toEqual({ disabled: true, busy: false });
    expect(pressable().props.style[0].opacity).toBe(0.35);
    expect(tree.root.findAllByType('ActivityIndicator' as never)).toHaveLength(0);
  });

  it('blocks presses, reports busy and shows a spinner instead of the icon when busy', async () => {
    await render(<Button label="Delete" variant="destructive" icon="trash-can-outline" busy onPress={() => { }} />);
    expect(pressable().props.disabled).toBe(true);
    expect(pressable().props.accessibilityState).toEqual({ disabled: true, busy: true });
    const spinner = tree.root.findByType('ActivityIndicator' as never);
    expect(spinner.props.color).toBe('#123456');
    expect(tree.root.findAllByType('MaterialCommunityIcons' as never)).toHaveLength(0);
    expect(label().props.children).toBe('Delete');
  });

  it('shows the icon in the variant foreground colour when not busy', async () => {
    await render(<Button label="Delete" variant="destructive-outline" icon="trash-can-outline" onPress={() => { }} />);
    const icon = tree.root.findByType('MaterialCommunityIcons' as never);
    expect(icon.props.name).toBe('trash-can-outline');
    expect(icon.props.color).toBe('#DE0000');
  });

  it('uses the label as the default accessibility label, and allows an override', async () => {
    await render(<Button label="Save" onPress={() => { }} />);
    expect(pressable().props.accessibilityRole).toBe('button');
    expect(pressable().props.accessibilityLabel).toBe('Save');
    await act(async () => tree.update(<Button label="Save" accessibilityLabel="Save workout" accessibilityHint="Stores it" onPress={() => { }} />));
    expect(pressable().props.accessibilityLabel).toBe('Save workout');
    expect(pressable().props.accessibilityHint).toBe('Stores it');
  });

  it('uses the large sizing and merges the caller style', async () => {
    await render(<Button label="Start" size="large" style={{ flex: 1 }} onPress={() => { }} />);
    const [base, extra] = pressable().props.style;
    expect(base).toMatchObject({ minHeight: 48, borderRadius: 16 });
    expect(extra).toEqual({ flex: 1 });
  });
});
