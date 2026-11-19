# UiButton

Import `UiButton` and its types from `@/shared/ui/common/button`. The root is a native button: classes, styles, ARIA, form attributes and listeners fall through unchanged. It has a default slot, `type="button"` and native `disabled` behavior. Do not nest interactive controls in its slot.

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

`border` accepts all 32 `FantasyBorderVariant` values. `appearance` is `filled` (default) or `ghost`; `variant` is `secondary` (default), `primary`, `success` or `danger`. Original corner sizes are preserved. The minimum 48×48 button reserves room for the largest ornament and its inset; long labels wrap. Padding also uses public border metrics to keep labels clear of deeper straight rails, including `003` and `024`; default `026` retains its compact geometry.

Ghost buttons are transparent with a 60% wood-colored outline until highlighted. Standalone buttons respond to hover and keyboard focus. Passing `highlighted` explicitly makes that presentation controlled, including `false`; this lets a menu coordinate one highlight across gaps. Native focus indication remains visible. ARIA toggle state does not simulate a physically pressed button.

`focusRing` defaults to `true`. Set it to `false` when a composed menu already provides a clear keyboard highlight and should omit the additional outer outline. This does not change native focus, Tab navigation or the highlighted fill.

The optional `colors: UiButtonColors` overrides any fields in `normal`, `highlighted` and `pressed`. Each state accepts `text`, `border`, `backgroundTop` and `backgroundBottom`; `edge`, `shadow`, `pressedShadow` and `focus` customize other details. All strings accept valid CSS colors or variables. Presets come from Shared theme and preserve Fantasy Buttons gradients and shadows. Pressing reverses the gradient and changes the outer shadow to an inset shadow.

Explicit custom normal fill colors also provide the hover fill when it is not overridden. Pressed fill inherits those custom colors in reverse order, preferring the highlighted fill; custom highlighted text and border also carry into pressing. Explicit `pressed` fields always win. Idle ghost text and its default transparent fill do not replace the readable highlighted/pressed text or preset fill.

Decoration reuses `FantasyBorder as="span"` inside the button, with pointer input and accessibility disabled for the decorative layer. The component never imports game code or raw vendor assets.

See **Shared/Common/Button** for live Default controls and focused Appearances, Variants, Borders, Colors and States catalogs. Unit tests cover native behavior; screenshot checks remain manual through the headless Storybook suite, outside `check` and pre-commit.
