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
        (isTextEntry(target) ||
            target.closest(windowSelector) !== null ||
            target.closest('[data-game-input-owner]') !== null)
    )
}
export function isConfirmationKey(event: KeyboardEvent): boolean {
    return ['Enter', 'Space', 'KeyF'].includes(event.code) || ['Enter', ' '].includes(event.key)
}
export function worldKeyboardOwned(): boolean {
    return (
        document.querySelector(windowSelector) !== null || isOwnedUiTarget(document.activeElement)
    )
}
/** A placement tool may own canvas clicks; other visible windows still block them. */
export function worldPointerBlocked(): boolean {
    const windows = Array.from(document.querySelectorAll<HTMLElement>(windowSelector))
    return (
        windows.some((window) => !window.hasAttribute('data-world-pointer-owner')) ||
        isTextEntry(document.activeElement)
    )
}
/** A reading panel may explicitly pass physical movement through without granting other game keys. */
export function permitsWorldMovement(event: KeyboardEvent): boolean {
    if (
        !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code) ||
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTextEntry(event.target) ||
        isTextEntry(document.activeElement)
    )
        return false
    const windows = Array.from(document.querySelectorAll<HTMLElement>(windowSelector))
    return windows.length > 0 && windows.every((window) => window.dataset.worldMovement === 'wasd')
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
    if (permitsWorldMovement(event)) return false
    if (worldKeyboardOwned() || isOwnedUiTarget(event.target)) return true
    const focus = event.target instanceof HTMLElement ? event.target : document.activeElement
    return (
        focus instanceof HTMLElement && focus.closest('button') !== null && isConfirmationKey(event)
    )
}
