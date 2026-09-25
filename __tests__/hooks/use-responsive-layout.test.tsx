import React from 'react';
import renderer, { act } from 'react-test-renderer';
import type { LayoutChangeEvent } from 'react-native';
import { useContainerWidth } from '@/lib/design-system/use-container-width';
import { useResponsiveLayout } from '@/lib/design-system/use-responsive-layout';

let mockDimensions = { width: 448, height: 800, scale: 3, fontScale: 1 };
let mockInsets = { top: 24, bottom: 24, left: 0, right: 0 };
jest.mock('react-native', () => ({ useWindowDimensions: () => mockDimensions }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets }));

let page: ReturnType<typeof useResponsiveLayout>;
let row: ReturnType<typeof useContainerWidth>;
let tree: ReturnType<typeof renderer.create>;

function Probe({ fallbackWidth = 404 }: { fallbackWidth?: number }) {
  page = useResponsiveLayout();
  row = useContainerWidth(fallbackWidth);
  return null;
}

function layoutEvent(width: number) {
  return { nativeEvent: { layout: { x: 0, y: 0, width, height: 44 } } } as LayoutChangeEvent;
}

describe('live responsive measurements', () => {
  beforeEach(() => {
    mockDimensions = { width: 448, height: 800, scale: 3, fontScale: 1 };
    mockInsets = { top: 24, bottom: 24, left: 0, right: 0 };
  });

  afterEach(async () => { await act(async () => tree.unmount()); });

  it('deducts horizontal safe areas and reacts to rotation and font scale changes', async () => {
    mockInsets = { ...mockInsets, left: 44, right: 44 };
    await act(async () => { tree = renderer.create(<Probe />); });
    expect(page.usableWidth).toBe(360);
    expect(page.contentWidth).toBe(328);

    mockDimensions = { width: 800, height: 448, scale: 3, fontScale: 1.4 };
    await act(async () => { tree.update(<Probe />); });
    expect(page.usableWidth).toBe(712);
    expect(page.pageWidth).toBe(700);
    expect(page.fontScale).toBe(1.4);

    mockDimensions = { width: 448, height: 800, scale: 3, fontScale: 1 };
    mockInsets = { ...mockInsets, left: 0, right: 0 };
    await act(async () => { tree.update(<Probe />); });
    expect(page.contentWidth).toBe(404);
  });

  it('uses actual row width and discards a stale measurement when its fallback changes', async () => {
    await act(async () => { tree = renderer.create(<Probe fallbackWidth={404} />); });
    expect(row.width).toBe(404);
    await act(async () => { row.onLayout(layoutEvent(380)); });
    expect(row.width).toBe(380);

    await act(async () => { tree.update(<Probe fallbackWidth={328} />); });
    expect(row.width).toBe(328);
    await act(async () => { row.onLayout(layoutEvent(310)); });
    expect(row.width).toBe(310);
  });
});
