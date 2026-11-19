# FantasyPanel

A native `div` with a default slot, using the original filled Kenney Fantasy UI Borders panels. Import through this component's public API:

```vue
<script setup lang="ts">
import { FantasyPanel } from '@/shared/ui/external/fantasy-ui-borders/panel'
import { lightUiColors } from '@/shared/ui/theme'
</script>

<template>
    <FantasyPanel
        panel="panel-026"
        appearance="solid"
        :color="lightUiColors.panel.parchment"
        class="card-layout"
    >
        <div :style="{ color: lightUiColors.panel.text }">
            <h2>Письмо путешественнику</h2>
            <p>Содержимое сохраняет собственные цвета.</p>
        </div>
    </FantasyPanel>
</template>
```

The explicit public API exports `FantasyPanel`, `FantasyPanelProps`, `FantasyPanelVariant` and `FantasyPanelAppearance`. The asset registry is private; there is no dependency on game code, the theme or the Border/Divider components.

| Prop                                  | Default        | Meaning                                                                                        |
| ------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| `panel?: FantasyPanelVariant`         | `panel-026`    | One of `panel-000` through `panel-031`. Unknown JavaScript values use `026`.                   |
| `appearance?: FantasyPanelAppearance` | `solid`        | `solid`, `transparent-border` or `transparent-center`. Unknown JavaScript values use `solid`.  |
| `color?: string`                      | `currentColor` | Any valid CSS color, including HEX, RGB/RGBA, HSL, CSS variables and inherited `currentColor`. |

Each shape imports three independent original PNGs: Panel, Transparent border and Transparent center. They preserve the authored cutouts and alpha. The partially transparent regions have alpha 127/255: the ornament for `transparent-border`, the filled non-ornament region for `transparent-center`. The other filled region remains opaque. A single tint colors the artwork; the component does not assign a second background or change slot colors.

Border artwork uses an isolated SVG `feFlood` → `feComposite` filter in sRGB on the decorative pseudo-element. The original center is uniform in every asset, so its identical fill is painted as a native CSS background clipped to the padding box. `color-mix` in sRGB preserves the source center opacity (100% or exactly 127/255), multiplied by the supplied color's alpha. The image border omits `fill`; the two painted regions never overlap. Native background color also lets accessibility tools measure the real background behind slotted text. Each instance has its own filter ID, including separate Vue apps and coexistence with Border and Divider. The zero-size SVG is hidden from accessibility and cannot receive focus or pointer input.

Native attributes, classes, styles and events fall through to the root. The component does not invent a dialog role, capture keyboard input or own scrolling. Add suitable native semantics on the consumer when a region needs a name. Padding, width and scrollable children belong to the consumer. A transparent physical border reserves space for the native corners; the decorative image covers the external border box beneath the slot.

Panel artwork requires its own native slices; do not reuse the thinner Border cuts:

| Slice | Panel numbers                    |
| ----: | -------------------------------- |
|     4 | 015                              |
|     8 | 004                              |
|    10 | 001, 009                         |
|    12 | 000, 003, 010–014, 028, 030      |
|    14 | 002, 005–007, 019, 022, 023, 031 |
|    16 | 008, 018, 021, 024, 027, 029     |
|    18 | 016, 017, 026                    |
|    22 | 020, 025                         |

The source images are 48×48. `border-image` stretches only the repeat-safe edges; corners retain their native dimensions and the uniform CSS center fills the remaining area. Minimum width and height are twice the slice (44×44 for `020` and `025`). There is no scaling API.

See **Shared/External/fantasy-ui-borders/FantasyPanel** for Default, Variants, Appearances, Colors, Composition and Sizes. Default exposes live Controls; fixed catalogs hide them. Stories use the single native Storybook background selector, with intentional white probes only for inspecting transparency and color.

Manual headless coverage: `bun run test:e2e:storybook -- e2e/fantasy-panel.visual.spec.ts e2e/storybook-preview.visual.spec.ts`. Captures wait for the canvas background, fonts and decoration images. Browser suites stay outside automatic `check` and pre-commit.
