# FantasyBorder

A native `div` (or opt-in `span`) with a default slot and a decorative Kenney Fantasy UI Borders outline. Import its production component and types through this directory's public API:

```vue
<script setup lang="ts">
import { FantasyBorder } from '@/shared/ui/external/fantasy-ui-borders/border'
import { lightUiColors } from '@/shared/ui/theme'
</script>

<template>
    <FantasyBorder
        border="border-026"
        :color="lightUiColors.border.gold"
        class="my-panel"
    >
        <h2>Ваше предложение</h2>
        <p>Обычное содержимое слота сохраняет свои цвета.</p>
    </FantasyBorder>
</template>
```

`FantasyBorderProps` accepts `as?: 'div' | 'span'` (default `div`), `border?: FantasyBorderVariant` (`border-000` through `border-031`, default `border-026`) and `color?: string` (default `currentColor`). Unknown border keys received from JavaScript fall back to `026`. Colors use normal CSS syntax: HEX, RGB/RGBA, HSL, `var(...)` and `currentColor`; callers provide valid values and define any referenced custom properties. `currentColor` inherits the root's text color. The component never imports the theme or game code.

All native attributes, classes, styles and listeners fall through to the selected root. This wrapper does not become a button or own keyboard behavior. Interactive content in the slot retains its normal event targets and focus order. Use `as="span"` for an aria-hidden decorative layer inside a native button; a block wrapper must not be nested there. Give an inline `span` a block/inline-block or positioned layout when setting explicit dimensions. The existing game button retains its own implementation.

The transparent physical border reserves room for the native corner ornament. Its width is the selected image's slice (2–20px); the minimum border box is twice that width. A positioned, isolated pseudo-element paints across that physical border, below content, with `stretch` and pixelated rendering. Consumer classes own width, height, extra padding, layout, background and typography. Keep the root positioned (`relative`, `absolute`, `fixed` or `sticky`) so its decoration remains anchored. Put scrolling or clipped content in an inner slot container: `overflow: hidden/auto` on the frame root would clip its decoration at the padding edge. There is no scale API.

The SVG filter belongs only to the decoration. `feFlood` and `feComposite` in sRGB multiply the requested color's alpha by the PNG alpha. The zero-size SVG remains rendered, with a unique filter ID per component instance, but is hidden from accessibility and cannot receive focus or pointer input. Text, images and nested borders are not tinted.

The 32 Default PNG imports and their exact nine-slice metadata are private. Other pack families, double-size exports and previews remain original asset sources. Shared palette values live separately under `shared/ui/theme` and are loaded by the app/Storybook's `base.css`.

`getFantasyBorderMetrics(border)` exposes only native layout measurements: `cornerSize` is the reserved nine-slice corner and `edgeSize` is the artwork depth along the stretched straight edges. Controls can reserve text clearance without importing private asset metadata. For example, `024` has 14px rails on its straight edges, whereas `026` has a 16px corner but only a 2px straight edge. This helper does not alter border rendering.

See **Shared/External/fantasy-ui-borders/FantasyBorder** for Default, Variants, Colors, Composition and Sizes. Visual tests run manually through `bun run test:e2e:storybook -- e2e/fantasy-border.visual.spec.ts`; they stay outside `check` and pre-commit. Existing game buttons and the restored HUD retain their current skins and screenshot baselines.

These stories use one canvas background, controlled by Storybook's standard background toolbar: **Wood** (initial), **Parchment** and **Dark**. The renderer host and story presentation stage are transparent. Text and inherited `currentColor` switch to the dark panel text on Parchment and the light button text on Wood/Dark; explicit border color props remain unchanged. White alpha-test surfaces, dark palette samples and the nested parchment composition are intentional component content, not extra canvas layers. Existing game stories retain their legacy renderer background and do not opt into this selector.
