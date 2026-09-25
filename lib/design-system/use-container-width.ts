import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * Measure the outer row whose available width decides a responsive layout.
 * A changed fallback takes effect immediately while native layout catches up.
 */
export function useContainerWidth(initialWidth: number) {
  const fallbackWidth = Math.max(0, initialWidth);
  const [measurement, setMeasurement] = useState<{ fallbackWidth: number; width: number }>();
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.max(0, event.nativeEvent.layout.width);
    setMeasurement((current) => (
      current?.fallbackWidth === fallbackWidth && current.width === width
        ? current
        : { fallbackWidth, width }
    ));
  }, [fallbackWidth]);

  return {
    width: measurement?.fallbackWidth === fallbackWidth ? measurement.width : fallbackWidth,
    onLayout,
  };
}
