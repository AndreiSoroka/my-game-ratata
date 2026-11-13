/** Confirm only the focused button; letters use physical codes for every keyboard layout. */
export function activateFocusedButton(
    event: KeyboardEvent,
    panel: HTMLElement | undefined
): boolean {
    if (!['Enter', 'Space', 'KeyE'].includes(event.code) && !['Enter', ' '].includes(event.key))
        return false
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
