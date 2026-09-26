# LiftingLog design system

Status: **v1 foundations, adopted in the Workouts redesign; migration in progress.**
See the [migration tracker](migration.md).

This is the visual and interaction contract for new features. The reference is
the redesigned Workouts page and its detail flow. The app is **LiftingLog**.
The design uses clear slate surfaces from the **Ink** palette, a single ink action
colour, compact information hierarchy, and restrained translucency and motion.

## Source of truth

| Responsibility | Source |
| --- | --- |
| Light/dark semantic colors, spacing, type, radii, motion, glass | [`lib/design-system/tokens.ts`](../../lib/design-system/tokens.ts) |
| Color role type (`RawThemeColors`) and legacy palettes | [`lib/theme/themes.ts`](../../lib/theme/themes.ts) |
| NativeWind classes for the color roles | [`tailwind.config.js`](../../tailwind.config.js) |
| WCAG AA contrast checks for the palette | [`__tests__/design-system/contrast.test.ts`](../../__tests__/design-system/contrast.test.ts) |
| Responsive gutters, card padding, and gaps | [`useResponsiveLayout`](../../lib/design-system/use-responsive-layout.ts), [`getResponsiveLayout`](../../lib/design-system/responsive-layout.ts) |
| Actual width available to a nested row | [`useContainerWidth`](../../lib/design-system/use-container-width.ts) |
| Scroll-position-driven edge fades | [`useScrollEdgeFades`](../../lib/design-system/use-scroll-edge-fades.ts) |
| Slate theme scope, shared by inline styles and NativeWind | [`DesignSystemProvider`](../../components/design-system/design-system-provider.tsx) |
| Current scoped colors in a component | `useTheme().rawColors` from [`ThemeContext`](../../lib/theme/ThemeContext.tsx) |
| Generic icon action | [`IconButton`](../../components/design-system/icon-button.tsx) |
| Numeric summary | [`Metric`](../../components/design-system/metric.tsx) |
| Logged set presentation | [`SetItem`](../../components/lists/SetItem.tsx); `workout` variant for redesigned workout detail |
| Dialog presentation | [`BaseModal`](../../components/modals/BaseModal.tsx), [`FrostedModal`](../../components/modals/frosted-modal.tsx) |
| Dialog blur target | [`FrostedModalProvider`](../../components/modals/frosted-modal-context.tsx) |
| Logo asset | [`liftinglog-logo.svg`](../../assets/branding/liftinglog-logo.svg) |
| Working page composition | [`workouts-home-screen.tsx`](../../features/workouts/screens/workouts-home-screen.tsx) |

Tokens define values; shared components define reusable behavior; these pages
define when to use them. Change the canonical token or component when changing
a shared rule. Do not copy a palette or modal shell into another feature.

The installed NativeWind, Expo Blur, Reanimated, Expo Image, safe-area, icon, and
calendar libraries already support this system. Reuse them before introducing
another UI framework. There is no separate Figma library or interactive component
catalog maintained by this repository yet.

## Using the system in a new feature

Keep routes small. Put feature screens, components, and state hooks in
`features/<feature>/`; put truly reusable presentation in `components/design-system/`.
Pure visual constants belong in `lib/design-system/`. UI primitives must not import
database access, workout controllers, or feature state.

Until the whole application is migrated, wrap a new or redesigned screen in
`DesignSystemProvider` underneath the app's existing `ThemeProvider`:

```tsx
import { DesignSystemProvider } from '@/components/design-system/design-system-provider';
import { IconButton } from '@/components/design-system/icon-button';
import { useTheme } from '@/lib/theme/ThemeContext';
import { View } from 'react-native';

function FeatureContent({ onClose }: { onClose: () => void }) {
  const { rawColors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: rawColors.background }}>
      <IconButton icon="close" label="Close" onPress={onClose} />
    </View>
  );
}

export function FeatureScreen({ onClose }: { onClose: () => void }) {
  return (
    <DesignSystemProvider>
      <FeatureContent onClose={onClose} />
    </DesignSystemProvider>
  );
}
```

Call `useTheme` in a descendant of the provider, not the component returning the
provider. Use `useDesignSystemTheme` only when a boundary needs the slate values
before it mounts. The provider preserves the user's light/dark preference and
does not rewrite their stored legacy color-theme selection.

NativeWind scans `app`, `components`, and `features`. Use complete, statically
written class names rather than constructing a color class at runtime. Prefer
classes for modal actions and semantic color roles; use typed tokens for native
layout, motion, and inline styles. Avoid assigning the same style property through
both mechanisms on one element.

Read [Color](foundations/color.md) before choosing any color: hex literals are
rejected by lint in `features/**` and `components/design-system/**`.

## Index

Foundations

- [Color](foundations/color.md): the Ink palette, semantic roles, contrast testing, and the no-hex rule
- [Layout and type](foundations/layout-and-type.md): spacing, typography, radii, responsive sizing, and alignment
- [Motion](foundations/motion.md): durations, reduced motion, and content-driven height

Components

- [Buttons and interaction](components/buttons-and-interaction.md): `IconButton`, `Metric`, actions, pressed/pending states, and accessibility
- [Set rows](components/set-rows.md): `SetItem` and its `workout` variant
- [Dialogs and glass](components/dialogs-and-glass.md): `BaseModal`, `FrostedModal`, blur targets, and modal action rows
- [Scroll fades](components/scroll-fades.md): `ScrollFade` and `useScrollEdgeFades()`
- [Active-workout shortcut](components/active-workout-shortcut.md): the Exercises return action

Patterns

- [Fixed controls and bounded scrolling](patterns/fixed-controls-and-bounded-scrolling.md)

Adoption

- [Migration tracker](migration.md): screen status, remaining work, and the change checklist
- [UI redesign plan](../ui-redesign-plan.md): the agreed phased plan
