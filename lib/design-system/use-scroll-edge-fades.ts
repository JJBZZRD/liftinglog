import type { LayoutChangeEvent } from 'react-native';
import { useAnimatedScrollHandler, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { sizes } from './tokens';

/**
 * Drives `ScrollFade` opacity from the distance scrolled away from each edge.
 * Spread `scrollProps` onto an `Animated.ScrollView`; pass `topOpacity` and
 * `bottomOpacity` to the matching fades.
 */
export function useScrollEdgeFades() {
  const offset = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    offset.value = event.contentOffset.y;
  });
  // Opacity follows distance on the UI thread. No threshold, timer, or JS render
  // can leave the fade catching up after a fast swipe or a direction change.
  const topOpacity = useDerivedValue(() => {
    const overflow = Math.max(0, contentHeight.value - viewportHeight.value);
    const distance = Math.max(0, Math.min(offset.value, overflow));
    return viewportHeight.value > 0 ? Math.min(1, distance / sizes.scrollFade) : 0;
  });
  const bottomOpacity = useDerivedValue(() => {
    const overflow = Math.max(0, contentHeight.value - viewportHeight.value);
    const distance = Math.max(0, overflow - Math.max(0, offset.value));
    return viewportHeight.value > 0 ? Math.min(1, distance / sizes.scrollFade) : 0;
  });

  return {
    topOpacity,
    bottomOpacity,
    scrollProps: {
      onScroll,
      scrollEventThrottle: 16,
      onLayout: (event: LayoutChangeEvent) => { viewportHeight.value = event.nativeEvent.layout.height; },
      onContentSizeChange: (_width: number, height: number) => { contentHeight.value = height; },
    },
  };
}
