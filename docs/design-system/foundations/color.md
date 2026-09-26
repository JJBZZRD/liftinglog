# Color and surfaces

Part of the [LiftingLog design system](../README.md).

## The Ink palette

The palette is **Ink**. Its slate neutrals come from the logo: ink `#292F3D`,
white, and a `#A3A3A3` tick. Ink is the only action colour. In light mode,
`primary` is the ink with a white label; in dark mode, `primary` flips to
near-white `#E8EBF0` with ink text.

The role values for both modes live in `designColors` in
[`lib/design-system/tokens.ts`](../../../lib/design-system/tokens.ts). Read them
there; this page does not copy them. The role type is `RawThemeColors` in
[`lib/theme/themes.ts`](../../../lib/theme/themes.ts), and the NativeWind classes are
defined in [`tailwind.config.js`](../../../tailwind.config.js).

## Semantic roles

Read colors by semantic role, never by a chosen legacy theme name. Use NativeWind
classes such as `bg-surface` and `text-foreground`, or `rawColors.surface` and
`rawColors.foreground` for native styles, icons, and charts. Both resolve through
the same provider.

| Role | NativeWind class | Use |
| --- | --- | --- |
| `background` | `background` | Page canvas: pale slate in light mode, deep slate in dark mode |
| `surface` | `surface` | Cards, grouped content, dialog base |
| `surfaceSecondary` | `surface-secondary` | Input backgrounds, set badges, metric chips |
| `control`, `controlBorder` | `control`, `control-border` | A secondary button's fill and its 1 dp border. Darker than `surfaceSecondary`, so secondary buttons stand apart from the page |
| `foreground` | `foreground` | Titles, values, essential body text |
| `foregroundSecondary` | `foreground-secondary` | Supporting labels and descriptions |
| `foregroundMuted` | `foreground-muted` | Timestamps and low-priority metadata |
| `primary`, `primaryForeground` | `primary`, `primary-foreground` | Main action fill and its label; primary also marks active state. Ink in light mode, near-white in dark mode |
| `primaryLight` | `primary-light` | Subtle accent background, such as the tint behind active items |
| `live`, `liveSoft`, `liveInk` | `live`, `live-soft`, `live-ink` | Green, reserved for in-progress state only: the status pill, the live dot, the active-workout strip, and the return pill. `liveInk` is the text colour on `liveSoft`. Never use these for ordinary actions |
| `border`, `borderLight` | `border`, `border-light` | Surface boundaries and internal dividers |
| `success`, `warning`, `destructive` | `success`, `warning`, `destructive` | Outcome and risk; pair with text or an icon |
| `onDestructive` | `on-destructive` | Text and icons on a `destructive` fill. White in light mode and near-black in dark mode, because white on the dark-mode red fails contrast |
| `pbGold` | `pb-gold` | Personal-best recognition only |
| `overlay`, `overlayDark` | none (use `rawColors`) | Context-preserving scrims, not ordinary card fills |

Keep regular list cards opaque and quiet. Use frosted glass for overlays and
scroll-edge transitions, not behind every piece of text. Use a border or surface
change before adding a shadow. Status must remain understandable without color:
for example, the workout status includes both a dot and “In progress” or “Completed”.

## No hex literals

Do not hardcode hex colors in feature components. An ESLint rule
(`no-restricted-syntax` in [`eslint.config.js`](../../../eslint.config.js))
rejects hex colour literals in `features/**` and `components/design-system/**`.
Use `useTheme().rawColors` or NativeWind classes instead. If no role fits, add a
role to `lib/design-system/tokens.ts` (and to `RawThemeColors`, the theme
variables, and `tailwind.config.js`) rather than inlining a value.

An alpha suffix appended to a role is allowed, for example
`` `${rawColors.destructive}14` `` for a faint destructive tint.

## Contrast is tested

[`__tests__/design-system/contrast.test.ts`](../../../__tests__/design-system/contrast.test.ts)
asserts WCAG AA for the key role pairs in both modes: 4.5:1 for text and 3:1 for
non-text UI.

- Anyone changing a colour must run it: `npx jest __tests__/design-system/contrast.test.ts`.
- Anyone introducing a role must add its pair (foreground role, background role,
  minimum ratio) to the test.

The test covers opaque role pairs only. Still check text and control contrast when
adding or changing combinations, especially labels over primary, gold, and
translucent surfaces in both modes. Do not solve low contrast by lowering text
opacity. A full accessibility audit remains follow-up work; see the
[migration tracker](../migration.md).

## One palette

Ink is the app's only palette. The root `ThemeProvider` supplies `designColors`
to `useTheme().rawColors` and to the NativeWind variables for every screen, in
light and dark. The seven selectable legacy palettes and the colour-theme setting
were retired in Phase 7 of the [UI redesign plan](../../ui-redesign-plan.md). The
stored `settings.color_theme` column remains for backup compatibility but is no
longer read.

`primary` flips from ink to near-white in dark mode, so never put a fixed white
label or icon on a `primary` fill: use `primaryForeground`.
