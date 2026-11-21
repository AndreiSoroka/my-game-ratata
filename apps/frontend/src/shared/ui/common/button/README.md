# UiButton

Import `UiButton` and its types from `@/shared/ui/common`. The root is a native button: classes, styles, ARIA, form attributes and listeners fall through unchanged. It has a default slot, `type="button"` and native `disabled` behavior. Do not nest interactive controls in its slot.

```vue
<UiButton
    appearance="ghost"
    variant="primary"
    border="border-026"
    @click="resume"
>
    Вернуться в игру
</UiButton>
```

`appearance` accepts `filled` (default), `ghost` and `panel`. All three support `variant` values `secondary` (default), `primary`, `success` and `danger`. `filled` and `ghost` take any of the 32 `FantasyBorderVariant` values in `border`. Padding uses public border metrics to keep labels clear of deeper straight rails, including `003` and `024`. Default `026` retains its compact geometry. Buttons have a minimum size of 48×48 and wrap long labels.

```vue
<UiButton appearance="panel">Продолжить</UiButton>
<UiButton
    appearance="panel"
    panel="panel-025"
    panel-appearance="transparent-center"
>
    Подробнее
</UiButton>
```

Panel buttons accept any `FantasyPanelVariant` in `panel` (default `panel-004`). `panelAppearance` accepts `solid` (default) with a light label or `transparent-center` with a half-transparent center and a dark label for light surfaces. The panel's native slices reserve space around the label.

Ghost buttons are transparent with a 60% wood-colored outline until highlighted. Standalone buttons respond to hover and keyboard focus. Passing `highlighted` explicitly makes that presentation controlled, including `false`; this lets a menu coordinate one highlight across gaps. Native focus indication remains visible. ARIA toggle state does not simulate a physically pressed button.

`focusRing` defaults to `true`. Set it to `false` when a composed menu already provides a clear keyboard highlight and should omit the additional outer outline. This does not change native focus, Tab navigation or the highlighted fill.

The optional `colors: UiButtonColors` overrides `text`, `border`, `backgroundTop` and `backgroundBottom` in `normal`, `highlighted` and `pressed`. All strings accept valid CSS colors or variables. `focus` colors the native focus ring in all modes. `shadow` colors the raised shadow and also tints the panel's shorter pressed shadow. `edge` and `pressedShadow` style the gradient box of `filled` and `ghost`. The `filled` button's rectangular edge is opt-in through `colors.edge`.

Panel buttons draw a vertical gradient through the center of `FantasyPanel`, using the state colors mixed with the theme's panel shade. The ornament uses the middle tone by default and accepts an independent `colors.*.border`. The panel casts a shadow from its artwork, and the shadow shortens while pressed.

Explicit custom normal fill colors also provide the hover fill when it is not overridden. Pressed fill inherits those custom colors in reverse order, preferring the highlighted fill; custom highlighted text and border also carry into pressing. Explicit `pressed` fields always win. Idle ghost text and its default transparent fill do not replace the readable highlighted/pressed text or preset fill.

The native button composes `FantasyBorder as="span"` as decoration or `FantasyPanel as="span"` around the label.

See **Shared/Common/UiButton** for live Default controls and focused Appearances, Variants, Borders, Colors, States and Panel States examples. Unit tests cover native behavior. Screenshot checks run through the manual headless Storybook suite.
