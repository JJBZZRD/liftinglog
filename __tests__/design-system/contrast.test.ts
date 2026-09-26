import { designColors } from '@/lib/design-system/tokens';
import type { RawThemeColors } from '@/lib/theme/themes';

type Role = keyof RawThemeColors;

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((index) => {
    const channel = parseInt(value.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const TEXT = 4.5;
const UI = 3;

/** [foreground role, background role, minimum ratio]. Text pairs need 4.5:1; non-text UI needs 3:1. */
const pairs: [Role, Role, number][] = [
  ['foreground', 'background', TEXT],
  ['foreground', 'surface', TEXT],
  ['foreground', 'surfaceSecondary', TEXT],
  ['foreground', 'control', TEXT],
  ['foreground', 'primaryLight', TEXT],
  ['foregroundSecondary', 'background', TEXT],
  ['foregroundSecondary', 'surface', TEXT],
  ['foregroundSecondary', 'control', TEXT],
  ['foregroundMuted', 'background', TEXT],
  ['foregroundMuted', 'surface', TEXT],
  ['foregroundMuted', 'surfaceSecondary', TEXT],
  ['primaryForeground', 'primary', TEXT],
  ['primary', 'background', TEXT],
  ['primary', 'surface', TEXT],
  ['onDestructive', 'destructive', TEXT],
  ['destructive', 'background', TEXT],
  ['destructive', 'surface', TEXT],
  ['liveInk', 'liveSoft', TEXT],
  ['pbGold', 'surface', TEXT],
  ['success', 'surface', TEXT],
  ['warning', 'background', TEXT],
  ['warning', 'surface', TEXT],
  ['live', 'background', UI],
  ['live', 'surface', UI],
];

describe.each(['light', 'dark'] as const)('Ink palette contrast (%s)', (scheme) => {
  const colors: RawThemeColors = designColors[scheme];

  it.each(pairs)('%s on %s meets %p:1', (foreground, background, minimum) => {
    expect(contrastRatio(colors[foreground], colors[background])).toBeGreaterThanOrEqual(minimum);
  });
});
