import { sizes, space } from './tokens';

export interface ResponsiveLayout {
  /** Capped outer page width, including its horizontal gutters. */
  pageWidth: number;
  contentWidth: number;
  pageGutter: number;
  cardPadding: number;
  itemGap: number;
}

/**
 * Size spacing from the usable width in dp, after horizontal safe-area insets.
 * Text, icons, and touch targets retain their independent design tokens.
 */
export function getResponsiveLayout(width: number): ResponsiveLayout {
  const pageWidth = Math.min(Math.max(0, width), sizes.pageMaxWidth);
  const progress = Math.min(1, Math.max(0, (pageWidth - 360) / (448 - 360)));
  const pageGutter = space[16] + (space[22] - space[16]) * progress;

  return {
    pageWidth,
    contentWidth: Math.max(0, pageWidth - 2 * pageGutter),
    pageGutter,
    cardPadding: space[16] + (space[20] - space[16]) * progress,
    itemGap: space[12] + (space[18] - space[12]) * progress,
  };
}
