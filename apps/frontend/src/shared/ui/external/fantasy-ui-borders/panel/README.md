# FantasyPanel

A native `div` or `span` with a default slot, using the original filled Kenney Fantasy UI Borders panels. Import through this component's public API:

```vue
<script setup lang="ts">
import { FantasyPanel } from '@/shared/ui/external/fantasy-ui-borders/panel'
import { lightUiColors } from '@/shared/ui/theme'
</script>

<template>
    <FantasyPanel
        panel="panel-026"
        appearance="solid"
        :border-color="lightUiColors.border.wood"
        :background-color="lightUiColors.panel.parchment"
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

| Prop                                             | Default        | Meaning                                                                                       |
| ------------------------------------------------ | -------------- | --------------------------------------------------------------------------------------------- |
| `as?: 'div' \| 'span'`                           | `div`          | Native element. Use `span` for a decorative layer inside a button.                            |
| `panel?: FantasyPanelVariant`                    | `panel-026`    | One of `panel-000` through `panel-031`. Unknown JavaScript values use `026`.                  |
| `appearance?: FantasyPanelAppearance`            | `solid`        | `solid`, `transparent-border` or `transparent-center`. Unknown JavaScript values use `solid`. |
| `borderColor?: string`                           | `color`        | Color of the decorative ornament.                                                             |
| `backgroundColor?: string`                       | `color`        | Color of the filled surface, including the pixels around the inner corners.                   |
| `backgroundGradient?: readonly [string, string]` |                | Optional top and bottom colors for the entire fill. Both stops use the selected fill opacity. |
| `color?: string`                                 | `currentColor` | Fallback for either color when its own prop is omitted.                                       |

All color props accept CSS colors such as HEX, RGBA, HSL, CSS variables and `currentColor`. Slotted content keeps its own color.

Each shape imports three original PNGs from the Panel, Transparent border and Transparent center folders. The `appearance` prop applies alpha 127/255 to the corresponding region. When the colors differ, the SVG filter uses the Transparent center PNG to distinguish cutouts, surface and ornament by their alpha values, then applies the requested tint and opacity to each painted region. With one tint, the filter uses the PNG for the selected appearance directly.

The filters apply only to the decorative pseudo-elements. A flat color uses a CSS background clipped to the padding box. A gradient uses the panel's full nine-slice fill mask to continue through the inner corners. Both multiply the fill opacity by the supplied color's alpha. Set `--fantasy-panel-decoration-shadow` to a CSS `drop-shadow()` to cast a shadow from the decoration. Each panel has unique filter IDs, including across separate Vue apps.

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
