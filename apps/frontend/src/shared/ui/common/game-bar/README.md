# GameBar

Import `GameBar` and `GameBarProps` from `@/shared/ui/common`.
It composes `BarTrack` with `BarFill` and adds progress semantics.

- `value` is required; `max` defaults to 100. Values are clamped to 0…max.
  Nonfinite values become 0; an invalid/nonpositive max falls back to 100.
- `segments` takes a list of positive widths in percent totaling 100. With
  `:segments="[40, 20, 20, 20]"`, rounded segments appear as progress passes 0%, 40%, 60% and 80%.
  Empty positions expose the page background, and `shadow` applies to the filled segments.
  An empty or invalid list falls back to the continuous bar.
- `color` controls the fill, `trackColor` the underlying track, and `textColor`
  the optional centered value. Each accepts any CSS color or CSS variable.
- `height` defaults to 24px. `shadow` enables the track's inset rim and the edge
  at the end of a partial fill. It defaults to true. `showValue` defaults to false.
- `label` names the native `progressbar` for assistive technology. `showValue`
  renders the normalized value/max at the center of the full track; a default
  slot can replace that text.

`lightUiColors.bar.health.color`, `.mana.color` and `.energy.color` provide shared
resource colors; `.track` provides the common recessed surface. The component
accepts supplied values only and has no knowledge of resource privacy or game
rules. Do not pass unauthorized exact numbers. Existing HUD bars migrate separately.

Resource presets match the component props: `<GameBar v-bind="lightUiColors.bar.mana" :value="64" />`.
