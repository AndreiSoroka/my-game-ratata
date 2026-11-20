# BarTrack

Native `div` with a default slot, 4px corner radius and an optional crisp inset rim.
Import it through `@/shared/ui/common/bar-track`.

`color` accepts any CSS color, including variables and `currentColor`. `height`
defaults to 24 CSS pixels, with a minimum of 8; `shadow` defaults to `true`.
The inner `.bar-track__content` leaves a 1px rim on every side and clips its contents to the
rounded well. Layout width, classes, styles, attributes and events remain with
the consumer. Use `GameBar` for a complete accessible progress indicator.
