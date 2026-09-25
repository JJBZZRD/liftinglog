import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getResponsiveLayout } from './responsive-layout';

/** Live page sizing in dp; callers center the capped page within the safe area. */
export function useResponsiveLayout() {
  const { width, fontScale } = useWindowDimensions();
  const { left, right } = useSafeAreaInsets();
  const usableWidth = Math.max(0, width - left - right);

  return { ...getResponsiveLayout(usableWidth), usableWidth, fontScale };
}
