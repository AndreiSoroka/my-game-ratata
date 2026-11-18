# Shared game interface

Use these production primitives for new UI and when editing existing controls. Their focused examples live in **Interface/Primitives** in Storybook. Windows and HUDs compose the same components; stories must not reproduce a separate skin.

| Component      | Interface                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GameButton`   | Native button root; `variant="secondary\|primary\|success\|danger\|slot"`, `size="default\|compact"`, `icon`, `type` (default `button`). Native attributes, listeners and slots pass through. |
| `GameInput`    | Native input root; `type` (default `text`), normal `v-model`, `.number`, `.trim`, `.lazy`; text/number/radio/checkbox and controlled `:value` + `@input`.                                     |
| `GameSelect`   | Native select root, option slots; `v-model`/`.number` or controlled `:value` + `@change`.                                                                                                     |
| `GameTextarea` | Native textarea root; `v-model`, `.trim`, `.lazy` or controlled `:value` + native listeners.                                                                                                  |
| `GameFrame`    | Decorative aria-hidden child; `variant="window\|panel\|inset\|speech"`. Does not own layout or focus.                                                                                         |
| `GameItemSlot` | Native span by default, `as="button"` for interaction; `selected`, `empty`, `disabled`, `quantity`; arbitrary content slot.                                                                   |

Use the existing `ItemIcon` for catalog-backed item images; it composes `GameItemSlot`. Trade consent uses the existing two-state `ExchangeConsentIcon` (`accepted`, `name`), demonstrated under **Interface/Exchange/Consent**. Reuse these components rather than drawing another item frame or handshake.

Keep the native parent element, its `ref`, roles, data attributes and input ownership when adding a frame:

```vue
<section
    ref="panel"
    class="my-window game-frame-host"
    role="dialog"
    tabindex="-1"
>
    <GameFrame variant="window" />
    <h2>Обмен</h2>
    <GameButton variant="primary" @click="propose">Предложить</GameButton>
</section>
```

The host gets `position: relative` at zero specificity and `isolation: isolate`. Existing absolute/fixed/sticky positioning wins. The frame fills the host without taking space or intercepting input. Remove legacy host backgrounds, border colors and shadows; retain their structural sizes and padding. Override `--game-frame-fill` on a host when an authored background or semantic surface must be retained. Use `transparent` for overlays above existing art.

`gameUi.css` owns the dark-green surfaces, brass palette, fonts, Kenney outline sources and all common states. It tints only decorative layers, never item sprites or text. Use layout classes for positioning, dimensions, gaps and scrolling. Do not add descendant rules that reskin `button`, `input`, `select` or the shared frame. Resource colors, speech contrast and world/SVG graphics retain their semantics.

An item slot defaults to 40px. Override `--game-item-slot-size` or the component's layout class; inventory grids may use `width:100%; height:auto; aspect-ratio:1`. The quantity overlay is aria-hidden: include quantities in the control's accessible label. Keep images pixelated and reuse the existing item catalog. Do not put an interactive item slot inside a button.

Fields preserve native event targets and composition behavior. Existing controlled handlers continue to validate/clamp values; the skin does not introduce game rules. Radio and checkbox `v-model` use native Vue behavior. Native attrs including `disabled`, `checked`, `maxlength`, `min`, `max`, labels and `aria-invalid` remain supported. Field refs expose `focus()`, `select()` where relevant and the native `element`; owning window refs remain HTML elements.

Verify changes with unit tests for control contracts, plus the affected headless gameplay scenarios. Run visual comparisons explicitly with `bun run test:e2e:storybook`; do not add that browser suite to `check` or pre-commit. Wait for fonts and image decoding before captures. Add focused stories and screenshots for new variants, including focus/hover/pressed, disabled, invalid, selected and empty states as applicable, then inspect updated baselines at desktop and narrow mobile widths.
