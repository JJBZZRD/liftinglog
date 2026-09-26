import Svg, { G, Path, Rect } from 'react-native-svg';
import { brandColors } from '@/lib/design-system/tokens';

/** The LiftingLog app mark from the mockups: barbell and check on an ink tile. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" accessible accessibilityLabel="LiftingLog logo" accessibilityRole="image">
      <Rect width={28} height={28} rx={7} fill={brandColors.tile} stroke={brandColors.tileEdge} strokeWidth={0.8} />
      <G fill={brandColors.glyph}>
        <Rect x={4.2} y={10} width={2.4} height={8} rx={0.8} />
        <Rect x={7.6} y={7} width={3.4} height={13} rx={0.8} />
        <Rect x={7.6} y={17} width={5.8} height={3} rx={0.8} />
        <Rect x={17} y={7} width={3.4} height={13} rx={0.8} />
        <Rect x={14.6} y={17} width={5.8} height={3} rx={0.8} />
        <Rect x={21.4} y={10} width={2.4} height={8} rx={0.8} />
      </G>
      <Path d="M11.8 11.6l2.1 2.4 3.4-4.3" stroke={brandColors.check} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
