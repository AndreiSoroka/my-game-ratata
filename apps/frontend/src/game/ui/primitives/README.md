# Shared game interface

Use these production primitives for new UI and when editing existing controls. Their focused examples live in **Shared/Primitives** in Storybook. Windows and HUDs compose the same components; stories must not reproduce a separate skin.

| Component         | Interface                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GameButton`      | Native button root; `variant="secondary\|primary\|success\|danger\|slot"`, optional `skin="fantasy"`, `size="default\|compact"`, `icon`, `type` (default `button`). Native attributes, listeners and slots pass through. |
| `GameInput`       | Native input root; `type` (default `text`), normal `v-model`, `.number`, `.trim`, `.lazy`; text/number/radio/checkbox and controlled `:value` + `@input`.                                                                |
| `GameSelect`      | Native select root, option slots; `v-model`/`.number` or controlled `:value` + `@change`.                                                                                                                                |
| `GameTextarea`    | Native textarea root; `v-model`, `.trim`, `.lazy` or controlled `:value` + native listeners.                                                                                                                             |
| `GameFrame`       | Decorative aria-hidden child; `variant="window\|panel\|inset\|speech"`, optional `skin="parchment"`. Does not own layout or focus.                                                                                       |
| `GameItemSlot`    | Native span by default, `as="button"` for interaction; `selected`, `empty`, `disabled`, `quantity`; arbitrary content slot.                                                                                              |
| `GameRibbon`      | Native `div` with an arbitrary content slot and a red Kenney ribbon. Native attributes pass through.                                                                                                                     |
| `GameResourceBar` | Native `span` progressbar; `value: HealthSnapshot`, `kind="hp\|mana\|energy"`. Shows exact text only when authorized by the snapshot; pass a native accessible label.                                                    |

Use the existing `ItemIcon` for catalog-backed item images; it composes `GameItemSlot`. Trade consent uses the existing two-state `ExchangeConsentIcon` (`accepted`, `name`), demonstrated under **Shared/Exchange/Consent**. Reuse these components rather than drawing another item frame or handshake.

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

## Kenney HUD surfaces

**Shared/Kenney HUD primitives** demonstrates the legacy `GameFrame skin="parchment"`, `GameRibbon` and `GameResourceBar`. The live HUD uses one lightly translucent dark green frame with an inset beige `FantasyBorder` (`border-017`). **Widgets/Player status** shows resources and faith, and **Widgets/Player effects** shows active effects and law statuses with a compact disclosure in the game. **Game/Player HUD/Dark Palettes** previews the full HUD in three dark palettes.

For a parchment frame, keep a transparent physical border on the native host and set `--game-frame-border-width` to that same width. The filled Kenney frame is painted behind content and outsets across that border. Parchment hosts expose local `--game-panel-text`, `--game-panel-muted`, `--game-panel-divider` and `--game-panel-warning` tokens.

The ribbon accepts arbitrary accessible content, such as a heading and identity icons. Its dimensions are controlled by `--game-ribbon-height` and `--game-ribbon-cap-width`. The surrounding layout controls truncation and icon placement.

`GameResourceBar` consumes the projected snapshot directly and renders current/max only for an exact snapshot. Style its dimensions with `--game-resource-height`, `--game-resource-border-width` and `--game-resource-font-size`. Use `.game-resource-bar__fill` and `.game-resource-bar__text` when inspecting the legacy primitive in tests.

## Fantasy buttons on parchment

Use `GameButton skin="fantasy"` for wooden controls with the original **Kenney Fantasy UI Borders** ornament. The opt-in skin supports the same semantic variants, sizes, icon mode and native interactions as the default button. Its nine-slice border keeps the corner ornaments at a fixed size while the button grows or wraps. All fills, border sources and hover/pressed/selected/disabled/focus states belong to `gameUi.css`.

Compose it with `GameFrame skin="parchment"` and the `game-fantasy-surface` host class for warm, readable panel text. Keep layout and button dimensions in the owning window.

```vue
<section class="my-window game-frame-host game-fantasy-surface">
    <GameFrame skin="parchment" />
    <GameButton skin="fantasy" variant="primary" @click="resume">Вернуться в игру</GameButton>
    <GameButton skin="fantasy">Персонаж · P</GameButton>
    <GameButton skin="fantasy" variant="danger" @click="leave">Выйти из игры</GameButton>
</section>
```

See **Shared/Fantasy buttons** for the menu composition, semantic variants, sizes and interactive states. Verify the skin with the manual headless `fantasy-buttons.visual.spec.ts` screenshots at 1280, 390 and 320px.

Fields preserve native event targets and composition behavior. Existing controlled handlers continue to validate/clamp values; the skin does not introduce game rules. Radio and checkbox `v-model` use native Vue behavior. Native attrs including `disabled`, `checked`, `maxlength`, `min`, `max`, labels and `aria-invalid` remain supported. Field refs expose `focus()`, `select()` where relevant and the native `element`; owning window refs remain HTML elements.

Verify changes with unit tests for control contracts, plus the affected headless gameplay scenarios. Run visual comparisons explicitly with `bun run test:e2e:storybook`; do not add that browser suite to `check` or pre-commit. Wait for fonts and image decoding before captures. Add focused stories and screenshots for new variants, including focus/hover/pressed, disabled, invalid, selected and empty states as applicable, then inspect updated baselines at desktop and narrow mobile widths.
