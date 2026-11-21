import { focusWorldInput, isConfirmationKey, isWorldHudButton } from './keyboardOwnership'

export const worldHudButtonAttrs = {
    tabindex: -1,
    'data-world-hud-button': '',
    onMousedown: (event: MouseEvent) => event.preventDefault(),
    onClickCapture(event: MouseEvent): void {
        // Native keyboard clicks have neither a click count nor a pointer type.
        if (event.detail === 0 && !hasPointerType(event)) {
            event.preventDefault()
            event.stopImmediatePropagation()
            return
        }
        if (isWorldHudButton(document.activeElement)) focusWorldInput()
    },
    onContextmenuCapture(event: MouseEvent): void {
        if (event.button === 2 || hasPointerType(event)) return
        event.preventDefault()
        event.stopImmediatePropagation()
    },
}

function hasPointerType(event: MouseEvent): boolean {
    return 'pointerType' in event && Boolean(event.pointerType)
}

/** Confirm only the focused button; letters use physical codes for every keyboard layout. */
export function activateFocusedButton(
    event: KeyboardEvent,
    panel: HTMLElement | undefined
): boolean {
    if (!isConfirmationKey(event)) return false
    const focused = document.activeElement
    if (!(focused instanceof HTMLButtonElement) || !panel?.contains(focused)) return false
    if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, select, [contenteditable="true"]')
    )
        return false
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat && !focused.disabled) focused.click()
    return true
}

export function focusPanelSurface(event: PointerEvent, panel: HTMLElement | undefined): void {
    const target = event.target
    if (
        !(target instanceof HTMLElement) ||
        target.closest('button, input, textarea, select, a, [contenteditable="true"]')
    )
        return
    event.preventDefault()
    ;(target.closest<HTMLElement>('[data-chest-pane]') ?? panel)?.focus()
}
