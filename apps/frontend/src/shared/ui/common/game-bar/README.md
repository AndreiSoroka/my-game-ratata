# GameBar

Import `GameBar` and `GameBarProps` from `@/shared/ui/common/game-bar`.
It composes `BarTrack` with a rounded gradient fill, gloss and optional shadows.

- `value` is required; `max` defaults to 100. Values are clamped to 0…max.
  Nonfinite values become 0; an invalid/nonpositive max falls back to 100.
- `color` controls the fill, `trackColor` the underlying track, and `textColor`
  optional value text beside the track. Each accepts any CSS color or CSS variable.
- `height` defaults to 24px, `shadow` to true and `showValue` to false.
- `label` names the native `progressbar` for assistive technology. `showValue`
  renders the normalized value/max beside the track so it remains readable with
  independently colored fill and background; a default slot can replace that text.

`lightUiColors.bar.health.color`, `.mana.color` and `.energy.color` provide shared
resource colors; `.track` provides the common recessed surface. The component
accepts supplied values only and has no knowledge of resource privacy or game
rules. Do not pass unauthorized exact numbers. Existing HUD bars migrate separately.

Resource presets match the component props: `<GameBar v-bind="lightUiColors.bar.mana" :value="64" />`.
