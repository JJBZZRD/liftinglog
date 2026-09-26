import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { MetricStrip } from '@/components/design-system/metric-strip';

jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Text: 'Text',
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock('@/lib/theme/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, rawColors: new Proxy({}, { get: () => '#123456' }) }),
}));

type Node = { type: unknown; props: Record<string, any>; findAll(predicate: (node: Node) => boolean): Node[]; findAllByType(type: unknown): Node[]; findByType(type: unknown): Node };
let tree: ReturnType<typeof renderer.create>;

describe('MetricStrip', () => {
  afterEach(async () => { await act(async () => tree.unmount()); });

  it('renders one accessible chip per item labelled "<value> <label>"', async () => {
    await act(async () => {
      tree = renderer.create(<MetricStrip items={[
        { value: 5, label: 'exercises' },
        { value: 18, label: 'sets' },
        { value: '4.2 t', label: 'volume' },
      ]} />);
    });
    const chips = tree.root.findAll((node: Node) => typeof node.type === 'string' && node.props.accessible === true);
    expect(chips.map((chip: Node) => chip.props.accessibilityLabel)).toEqual(['5 exercises', '18 sets', '4.2 t volume']);
    expect(chips[2].findAllByType('Text' as never).map((text: Node) => text.props.children)).toEqual(['4.2 t', 'volume']);
  });

  it('renders no chips for an empty list', async () => {
    await act(async () => { tree = renderer.create(<MetricStrip items={[]} />); });
    expect(tree.root.findAll((node: Node) => typeof node.type === 'string' && node.props.accessible === true)).toHaveLength(0);
  });
});
