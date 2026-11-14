const editorSelector = 'input, textarea, select, [contenteditable="true"], .speech-text'
const windowSelector = '[role="dialog"], [role="menu"], [role="alertdialog"], .adventure-window'

export function isTextEntry(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest(editorSelector) !== null)
    )
}
export function isOwnedUiTarget(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (isTextEntry(target) || target.closest(windowSelector) !== null)
    )
}
export function isConfirmationKey(event: KeyboardEvent): boolean {
    return ['Enter', 'Space', 'KeyE'].includes(event.code) || ['Enter', ' '].includes(event.key)
}
export function worldKeyboardOwned(): boolean {
    return document.querySelector(windowSelector) !== null || isTextEntry(document.activeElement)
}
/** A placement tool may own canvas clicks; other visible windows still block them. */
export function worldPointerBlocked(): boolean {
    const windows = Array.from(document.querySelectorAll<HTMLElement>(windowSelector))
    return (
        windows.some((window) => !window.hasAttribute('data-world-pointer-owner')) ||
        isTextEntry(document.activeElement)
    )
}
/** A HUD button owns confirmation, but its focus does not disable unrelated game shortcuts. */
export function gameKeyBlocked(event: KeyboardEvent): boolean {
    if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
    )
        return true
    if (worldKeyboardOwned() || isOwnedUiTarget(event.target)) return true
    const focus = event.target instanceof HTMLElement ? event.target : document.activeElement
    return (
        focus instanceof HTMLElement && focus.closest('button') !== null && isConfirmationKey(event)
    )
}
