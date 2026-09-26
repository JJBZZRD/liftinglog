import Svg, { Circle, Path, Rect } from 'react-native-svg';

type Shape = { d: string } | { rect: [x: number, y: number, width: number, height: number, rx: number] } | { circle: [cx: number, cy: number, r: number] };

/**
 * The stroke icons drawn in the agreed mockups (docs/ui-mockups), on a 24-unit grid.
 * Use these on redesigned screens so icons match the mockups exactly.
 */
const icons = {
  'arrow-left': [{ d: 'M19 12H5M12 19l-7-7 7-7' }],
  'arrow-right': [{ d: 'M5 12h14M13 6l6 6-6 6' }],
  'arrow-up-right': [{ d: 'M7 17L17 7M8 7h9v9' }],
  book: [{ d: 'M5 4.5A1.5 1.5 0 016.5 3H19v15H6.5A1.5 1.5 0 005 19.5zM5 19.5A1.5 1.5 0 006.5 21H19' }],
  calculator: [{ rect: [5, 2.5, 14, 19, 2.5] }, { d: 'M8.5 7h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01' }],
  calendar: [{ rect: [3, 4.5, 18, 16.5, 2.5] }, { d: 'M16 2.5v4M8 2.5v4M3 10h18' }],
  chart: [{ d: 'M5 20V11M12 20V5M19 20v-6' }],
  check: [{ d: 'M5 12.5l4.5 4.5L19 7.5' }],
  'chevron-down': [{ d: 'M6 9l6 6 6-6' }],
  'chevron-left': [{ d: 'M15 18l-6-6 6-6' }],
  'chevron-right': [{ d: 'M9 18l6-6-6-6' }],
  'chevron-up': [{ d: 'M6 15l6-6 6 6' }],
  close: [{ d: 'M6 6l12 12M18 6L6 18' }],
  cog: [{ circle: [12, 12, 3.2] }, { d: 'M12 2.8v2.6M12 18.6v2.6M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.8 12h2.6M18.6 12h2.6M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8' }],
  day: [{ rect: [4, 4, 16, 16, 2.5] }, { d: 'M4 9.5h16M4 14.5h16' }],
  download: [{ d: 'M12 4v11M7 10l5 5 5-5M5 20h14' }],
  dumbbell: [{ d: 'M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11' }],
  formula: [{ d: 'M14 4h-2a3 3 0 00-3 3v13M6 11h7M15 13l5 6M20 13l-5 6' }],
  info: [{ circle: [12, 12, 9] }, { d: 'M12 11v5M12 8h.01' }],
  moon: [{ d: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z' }],
  pencil: [{ d: 'M4 20h4L19 9l-4-4L4 16v4z' }],
  play: [{ d: 'M8 5.5v13l10.5-6.5z' }],
  plus: [{ d: 'M12 5v14M5 12h14' }],
  restore: [{ d: 'M4 12a8 8 0 108-8 8 8 0 00-6 2.7M4 4v4h4' }],
  scale: [{ d: 'M5 20h14M12 4v16M5 8h14M5 8l-2.5 6h5zM19 8l-2.5 6h5z' }],
  search: [{ circle: [11, 11, 7] }, { d: 'M20 20l-3.5-3.5' }],
  sort: [{ d: 'M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5' }],
  table: [{ rect: [3.5, 4.5, 17, 15, 2] }, { d: 'M3.5 10h17M3.5 15h17M10 4.5v15' }],
  trash: [{ d: 'M3.5 6.5h17M9 6.5V4h6v2.5M18.5 6.5l-1 14h-11l-1-14M10 11v5.5M14 11v5.5' }],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof icons;

/** A mockup stroke icon. Decorative by default; label the control that contains it. */
export function Icon({ name, size = 22, color, strokeWidth = 2 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const stroke = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} importantForAccessibility="no-hide-descendants">
      {(icons[name] as Shape[]).map((shape, index) => {
        if ('d' in shape) return <Path key={index} d={shape.d} {...stroke} />;
        if ('rect' in shape) {
          const [x, y, width, height, rx] = shape.rect;
          return <Rect key={index} x={x} y={y} width={width} height={height} rx={rx} {...stroke} />;
        }
        const [cx, cy, r] = shape.circle;
        return <Circle key={index} cx={cx} cy={cy} r={r} {...stroke} />;
      })}
    </Svg>
  );
}
