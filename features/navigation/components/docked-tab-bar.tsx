import { router } from 'expo-router';
import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useContext, useEffect, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/design-system/icon';
import { DesignSystemProvider } from '@/components/design-system/design-system-provider';
import { appCapabilities } from '@/lib/config/releaseProfile';
import { radius, sizes, space } from '@/lib/design-system/tokens';
import { useTheme } from '@/lib/theme/ThemeContext';
import { setSelectedWorkoutId } from '@/lib/workouts/selection-store';
import { LiveWorkoutStrip } from '@/features/workouts/components/live-workout-strip';
import { useLiveWorkout } from '@/features/workouts/hooks/use-live-workout';

const tabIcons: Record<string, IconName> = {
  index: 'day', exercises: 'dumbbell', programs: 'book', settings: 'cog',
};

/**
 * Tabs that show the live-workout strip. Workouts lists the active workout itself and
 * Exercises has its own return path, so the strip would only repeat them there.
 */
const liveStripRoutes = new Set(['programs', 'settings']);

function useKeyboardVisible() {
  const [visible, setVisible] = useState(() => Keyboard.isVisible?.() ?? false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
}

function DockedTabBarContent({ state, descriptors, navigation }: BottomTabBarProps) {
  const { rawColors } = useTheme();
  const insets = useSafeAreaInsets();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const keyboardVisible = useKeyboardVisible();
  const focusedRoute = state.routes[state.index];
  const liveWorkout = useLiveWorkout(liveStripRoutes.has(focusedRoute.name));

  // Leave the screen the whole height while typing, as tabBarHideOnKeyboard did.
  if (keyboardVisible) return null;

  return (
    <View onLayout={(event) => reportHeight?.(event.nativeEvent.layout.height)}>
      {liveWorkout && <LiveWorkoutStrip workout={liveWorkout} onPress={() => {
        setSelectedWorkoutId(liveWorkout.id);
        router.push({ pathname: '/workout-session/[id]', params: { id: String(liveWorkout.id) } });
      }} />}
      <View accessibilityRole="tablist" style={{
        flexDirection: 'row', justifyContent: 'space-around', backgroundColor: rawColors.surface,
        borderTopWidth: 1, borderColor: rawColors.border,
        paddingTop: space[8], paddingBottom: Math.max(insets.bottom, space[12]),
        paddingLeft: insets.left + 6, paddingRight: insets.right + 6,
      }}>
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const options = descriptors[route.key].options;
          const label = typeof options.title === 'string' ? options.title : route.name;
          const soon = route.name === 'programs' && appCapabilities.programsExperience === 'coming-soon';
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }}
              accessibilityLabel={soon ? `${label}, coming soon` : label} onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              className="active:opacity-70"
              style={{ flex: 1, maxWidth: 96, minHeight: sizes.dockBar - space[8], alignItems: 'center', gap: space[4] }}>
              <View style={{
                width: sizes.dockPillWidth, height: sizes.dockPill, borderRadius: sizes.dockPill / 2,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {/* Always mounted with a fixed colour and radius; only its opacity changes.
                    Android drew the pill square when its background changed after mount. */}
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: sizes.dockPill / 2,
                  backgroundColor: rawColors.primary, opacity: focused ? 1 : 0 }} />
                <Icon name={tabIcons[route.name] ?? 'day'} size={22}
                  color={focused ? rawColors.primaryForeground : rawColors.foregroundSecondary} />
              </View>
              <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: focused ? '700' : '500', color: focused ? rawColors.foreground : rawColors.foregroundSecondary }}>{label}</Text>
              {soon && <Text importantForAccessibility="no" accessibilityElementsHidden style={{
                position: 'absolute', top: -3, right: 4, paddingHorizontal: 5, paddingVertical: 1, borderRadius: radius.badge,
                overflow: 'hidden', backgroundColor: rawColors.surfaceSecondary, color: rawColors.foregroundSecondary,
                fontSize: 9, fontWeight: '700', letterSpacing: 0.3,
              }}>SOON</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The docked navigation bar with an ink pill behind the active icon. It sits below
 * the screens rather than floating over them, so screens need no bottom offset for it;
 * `useBottomTabBarHeight()` still reports its height (including any live strip).
 */
export function DockedTabBar(props: BottomTabBarProps) {
  // The scope must size to the bar; its default flex: 1 would take height from the screens.
  return <DesignSystemProvider style={{ flex: 0 }}><DockedTabBarContent {...props} /></DesignSystemProvider>;
}
