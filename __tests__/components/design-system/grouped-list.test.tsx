import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { GroupedList, GroupLabel, ListRow } from '@/components/design-system/grouped-list';

jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Text: 'Text',
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/lib/theme/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    rawColors: new Proxy({}, { get: (_target, key) => (key === 'destructive' ? '#DE0000' : '#123456') }),
  }),
}));

type Node = { type: unknown; props: Record<string, any>; findAll(predicate: (node: Node) => boolean): Node[]; findAllByType(type: unknown): Node[]; findByType(type: unknown): Node };
let tree: ReturnType<typeof renderer.create>;

async function render(element: React.ReactElement) {
  await act(async () => { tree = renderer.create(element); });
  return tree;
}

const separatorsIn = (node: Node) => node.findAll((child: Node) =>
  child.type === 'View' && child.props.style?.position === 'absolute' && child.props.style?.height === 1);

describe('GroupedList and ListRow', () => {
  afterEach(async () => { await act(async () => tree.unmount()); });

  it('draws no separator on the first row and one on each later row', async () => {
    await render(<GroupedList>
      <ListRow title="One" />
      <ListRow title="Two" />
      {false}
      <ListRow title="Three" />
    </GroupedList>);
    const rows = tree.root.findAllByType(ListRow);
    expect(rows.map((row: Node) => separatorsIn(row).length)).toEqual([0, 1, 1]);
  });

  it('insets the separator to the text (62) with an icon and 16 without', async () => {
    await render(<GroupedList>
      <ListRow title="First" icon="dumbbell" />
      <ListRow title="With icon" icon="dumbbell" />
      <ListRow title="With leading" leading={<></>} />
      <ListRow title="Plain" />
    </GroupedList>);
    const rows = tree.root.findAllByType(ListRow);
    expect(rows.slice(1).map((row: Node) => separatorsIn(row)[0].props.style.left)).toEqual([62, 62, 16]);
  });

  it('renders a plain View, not a Pressable, when the row has no press handlers', async () => {
    await render(<GroupedList><ListRow title="Static" subtitle="Info" /></GroupedList>);
    expect(tree.root.findAllByType('Pressable' as never)).toHaveLength(0);
  });

  it.each([
    ['onPress', { onPress: jest.fn() }],
    ['onLongPress', { onLongPress: jest.fn() }],
  ] as const)('renders a button when the row has %s', async (_name, handlers) => {
    await render(<GroupedList><ListRow title="Squat" subtitle="3 sets" {...handlers} /></GroupedList>);
    const pressable = tree.root.findByType('Pressable' as never);
    expect(pressable.props.accessibilityRole).toBe('button');
    expect(pressable.props.accessibilityLabel).toBe('Squat, 3 sets');
    // The pressed state is a NativeWind class, not a function style, so the layout survives the interop.
    expect(pressable.props.className).toBe('active:bg-pressed');
    expect(typeof pressable.props.style).toBe('object');
    expect(pressable.props.style).toMatchObject({ flexDirection: 'row', minHeight: 60, paddingHorizontal: 14 });
  });

  it('forwards the press handlers', async () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    await render(<ListRow title="Row" onPress={onPress} onLongPress={onLongPress} accessibilityLabel="Custom" />);
    const pressable = tree.root.findByType('Pressable' as never);
    expect(pressable.props.accessibilityLabel).toBe('Custom');
    await act(async () => { pressable.props.onPress(); pressable.props.onLongPress(); });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('uses the destructive colour for a destructive title', async () => {
    await render(<GroupedList>
      <ListRow title="Delete" destructive />
      <ListRow title="Keep" />
    </GroupedList>);
    const [destructive, normal] = tree.root.findAllByType(ListRow).map((row: Node) => row.findAllByType('Text' as never)[0]);
    expect(destructive.props.style.color).toBe('#DE0000');
    expect(normal.props.style.color).toBe('#123456');
  });

  it('renders string trailing content as text and a chevron when asked', async () => {
    await render(<ListRow title="Units" trailing="kg" chevron />);
    expect(tree.root.findAllByType('Text' as never).map((text: Node) => text.props.children)).toEqual(['Units', 'kg']);
    expect(tree.root.findByType('MaterialCommunityIcons' as never).props.name).toBe('chevron-right');
  });
});

describe('GroupLabel', () => {
  afterEach(async () => { await act(async () => tree.unmount()); });

  it('renders the title as a header with the detail', async () => {
    await render(<GroupLabel title="Today" detail="3" />);
    const texts = tree.root.findAllByType('Text' as never);
    expect(texts.map((text: Node) => text.props.children)).toEqual(['Today', '3']);
    expect(texts[0].props.accessibilityRole).toBe('header');
  });

  it('shows the accessory in place of the detail when given', async () => {
    await render(<GroupLabel title="Today" detail="3" accessory={<Accessory />} />);
    expect(tree.root.findAllByType('Text' as never).map((text: Node) => text.props.children)).toEqual(['Today']);
    expect(tree.root.findAllByType(Accessory)).toHaveLength(1);
  });

  it('renders only the title when there is no detail or accessory', async () => {
    await render(<GroupLabel title="Today" />);
    expect(tree.root.findAllByType('Text' as never)).toHaveLength(1);
  });
});

function Accessory() {
  return <>{null}</>;
}
