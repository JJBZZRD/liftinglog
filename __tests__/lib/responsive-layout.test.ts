import { getResponsiveLayout } from '@/lib/design-system/responsive-layout';

describe('responsive page spacing', () => {
  it.each([
    [0, 0],
    [320, 288],
    [360, 328],
  ])('keeps minimum spacing at %i dp without negative content width', (width, contentWidth) => {
    expect(getResponsiveLayout(width)).toEqual({
      pageWidth: width,
      contentWidth,
      pageGutter: 16,
      cardPadding: 16,
      itemGap: 12,
    });
  });

  it('interpolates an intermediate phone width without a breakpoint jump', () => {
    const layout = getResponsiveLayout(390);
    expect(layout.pageWidth).toBe(390);
    expect(layout.pageGutter).toBeCloseTo(18.04545, 5);
    expect(layout.cardPadding).toBeCloseTo(17.36364, 5);
    expect(layout.itemGap).toBeCloseTo(14.04545, 5);
    expect(layout.contentWidth).toBeCloseTo(353.90909, 5);
  });

  it('preserves the larger phone reference spacing at 448 dp', () => {
    expect(getResponsiveLayout(448)).toEqual({
      pageWidth: 448,
      contentWidth: 404,
      pageGutter: 22,
      cardPadding: 20,
      itemGap: 18,
    });
  });

  it.each([700, 800, 1200])('caps page width and spacing on a %i dp viewport', (width) => {
    expect(getResponsiveLayout(width)).toEqual({
      pageWidth: 700,
      contentWidth: 656,
      pageGutter: 22,
      cardPadding: 20,
      itemGap: 18,
    });
  });

  it('recalculates from current width when moving to landscape and back', () => {
    const portrait = getResponsiveLayout(360);
    const landscape = getResponsiveLayout(800);
    expect(landscape.pageWidth).toBe(700);
    expect(landscape.pageGutter).toBe(22);
    expect(getResponsiveLayout(360)).toEqual(portrait);
  });
});
