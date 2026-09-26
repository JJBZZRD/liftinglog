import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Button, type ButtonVariant } from '@/components/design-system/button';
import { Icon } from '@/components/design-system/icon';

jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Text: 'Text', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles },
}));
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
    ['destructive-outline', 'border', 'text-destructive'],
  ])('applies the %s colour classes', async (variant, container, text) => {
    await render(<Button label="Save" variant={variant} onPress={() => { }} />);
    expect(pressable().props.className).toBe(`${container} active:opacity-70`);
    expect(label().props.className).toBe(text);
  });

  it('draws the destructive-outline border and tint inline from the destructive colour', async () => {
    await render(<Button label="Delete" variant="destructive-outline" style={{ flex: 1 }} onPress={() => { }} />);
    const [base, extra] = pressable().props.style;
    expect(base).toMatchObject({ borderColor: '#DE000066', backgroundColor: '#DE000012' });
    expect(extra).toEqual({ flex: 1 });
  });

  it.each<ButtonVariant>(['primary', 'secondary', 'destructive'])('does not add the destructive tint to %s', async (variant) => {
    await render(<Button label="Save" variant={variant} onPress={() => { }} />);
    expect(pressable().props.style[0].borderColor).toBeUndefined();
    expect(pressable().props.style[0].backgroundColor).toBeUndefined();
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
    await render(<Button label="Delete" variant="destructive" icon="trash" busy onPress={() => { }} />);
    expect(pressable().props.disabled).toBe(true);
    expect(pressable().props.accessibilityState).toEqual({ disabled: true, busy: true });
    const spinner = tree.root.findByType('ActivityIndicator' as never);
    expect(spinner.props.color).toBe('#123456');
    expect(tree.root.findAllByType(Icon)).toHaveLength(0);
    expect(label().props.children).toBe('Delete');
  });

  it('shows the icon in the variant foreground colour when not busy', async () => {
    await render(<Button label="Delete" variant="destructive-outline" icon="trash" onPress={() => { }} />);
    const icon = tree.root.findByType(Icon);
    expect(icon.props.name).toBe('trash');
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
