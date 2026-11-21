# FantasyDivider

A horizontal separator using the original Kenney Fantasy UI Borders artwork. Import the component and its types through this directory's public API:

```vue
<script setup lang="ts">
import { FantasyDivider } from '@/shared/ui/external'
import { lightUiColors } from '@/shared/ui/theme'
</script>

<template>
    <FantasyDivider divider="divider-000" :color="lightUiColors.border.cream" />
    <FantasyDivider
        divider="divider-004"
        fade
        ends="both"
        color="rgb(120 80 40)"
    />
</template>
```

`FantasyDividerProps` accepts:

| Prop                              | Default        | Meaning                                                                                   |
| --------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `divider?: FantasyDividerVariant` | `divider-000`  | One of `divider-000` through `divider-005`; unknown JavaScript values fall back to `000`. |
| `fade?: boolean`                  | `false`        | Use the matching original fading PNG, including its ornament's authored alpha.            |
| `ends?: FantasyDividerEnds`       | `right`        | Ornaments on the `left`, `right` or `both` ends. Unknown JavaScript values use `right`.   |
| `color?: string`                  | `currentColor` | Any valid CSS color, including HEX, RGB/RGBA, HSL and `var(...)`.                         |

The native root is a `div` with `role="separator"` and `aria-orientation="horizontal"`. Native attrs, classes, styles and listeners fall through. Use `aria-label` to name a meaningful separator or `aria-hidden="true"` for purely decorative artwork. The component has no slot or input handling.

The separator defaults to its parent's full width. Consumer classes own width, margins and layout; its source height remains 22, 22, 10, 18, 14 or 18px depending on the variant. Ornaments are never stretched: only the source's line region grows or shrinks. Its minimum width reserves one full cap plus one line pixel (17, 3, 3, 21, 25 or 25px), doubled for `both`. There is no vertical or scale API. Keep the root positioned so its pseudo-elements stay anchored.

With `both`, two non-overlapping halves face outward. Solid lines meet continuously in the middle; with `fade`, each original fading line becomes transparent toward the center. Their alpha is never doubled by overlapping layers.

Color is applied only to the decoration through a local SVG `feFlood`/`feComposite` filter in sRGB, multiplying the color alpha by the original PNG alpha. Mirroring the left end also affects only the decoration. The zero-size, non-focusable SVG stays rendered but is hidden from accessibility. Filter identities remain independent between instances, including separate Vue apps and `FantasyBorder` instances. The component imports neither the theme nor game code.

See **Shared/External/fantasy-ui-borders/FantasyDivider** for Default, Variants, Directions, Colors and Sizes. Default provides live Controls; fixed catalogs hide Controls because their examples already define every setting. All examples use the single native Storybook background selector. Run manual headless visual coverage with `bun run test:e2e:storybook -- e2e/fantasy-divider.visual.spec.ts`; wait for the canvas background, fonts and images before captures. Browser suites stay outside `check` and pre-commit.
