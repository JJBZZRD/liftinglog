import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SegmentedControl } from '@/components/design-system/segmented-control';

jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Text: 'Text',
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock('@/lib/theme/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, rawColors: new Proxy({}, { get: () => '#123456' }) }),
}));

type Theme = 'system' | 'light' | 'dark';
const options = [
  { value: 'system' as const, label: 'System' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
];

type Node = { type: unknown; props: Record<string, any>; findAll(predicate: (node: Node) => boolean): Node[]; findAllByType(type: unknown): Node[]; findByType(type: unknown): Node };
let tree: ReturnType<typeof renderer.create>;
const radios = () => tree.root.findAllByType('Pressable' as never);

describe('SegmentedControl', () => {
  let onChange: jest.Mock<void, [Theme]>;

  beforeEach(async () => {
    onChange = jest.fn();
    await act(async () => {
      tree = renderer.create(<SegmentedControl<Theme> options={options} value="light" onChange={onChange} accessibilityLabel="Theme" />);
    });
  });
  afterEach(async () => { await act(async () => tree.unmount()); });

  it('exposes a labelled radiogroup of radios with checked state on the selection', () => {
    const group = tree.root.findByProps({ accessibilityRole: 'radiogroup' });
    expect(group.type).toBe('View');
    expect(group.props.accessibilityLabel).toBe('Theme');
    expect(radios().map((radio: Node) => radio.props.accessibilityRole)).toEqual(['radio', 'radio', 'radio']);
    expect(radios().map((radio: Node) => radio.props.accessibilityLabel)).toEqual(['System', 'Light', 'Dark']);
    expect(radios().map((radio: Node) => radio.props.accessibilityState)).toEqual([
      { checked: false }, { checked: true }, { checked: false },
    ]);
  });

  it('calls onChange with the value of another option when pressed', async () => {
    await act(async () => radios()[2].props.onPress());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('does not call onChange when the selected option is pressed', async () => {
    await act(async () => radios()[1].props.onPress());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stretches segments to equal widths when asked', async () => {
    expect(radios()[0].props.style.flex).toBeUndefined();
    await act(async () => {
      tree.update(<SegmentedControl<Theme> options={options} value="light" onChange={onChange} accessibilityLabel="Theme" stretch />);
    });
    expect(radios().every((radio: Node) => radio.props.style.flex === 1)).toBe(true);
  });
});
