const editorSelector = 'input, textarea, select, [contenteditable="true"], .speech-text'
const publicChatEditorSelector = 'input[data-public-chat-input]'
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
export function worldPointerBlocked(allowPublicChat = false): boolean {
    const windows = Array.from(document.querySelectorAll<HTMLElement>(windowSelector))
    return (
        windows.some((window) => !window.hasAttribute('data-world-pointer-owner')) ||
        (allowPublicChat
            ? isForeignTextEntry(document.activeElement)
            : isTextEntry(document.activeElement))
    )
}
/** A reading panel may explicitly pass physical movement through without granting other game keys. */
export function permitsWorldMovement(event: KeyboardEvent): boolean {
    if (
        !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code) ||
        reservedKey(event) ||
        isTextEntry(event.target) ||
        isTextEntry(document.activeElement)
    )
        return false
    const windows = Array.from(document.querySelectorAll<HTMLElement>(windowSelector))
    const reader = [event.target, document.activeElement].some(
        (target) =>
            target instanceof HTMLElement && target.closest('[data-world-movement="wasd"]') !== null
    )
    return (
        (reader || windows.length > 0) &&
        windows.every((window) => window.dataset.worldMovement === 'wasd')
    )
}

/** The public draft accepts confirmation from its editor or read-only history. */
export function publicChatOwnsKey(event: KeyboardEvent): boolean {
    if (
        reservedKey(event) ||
        isForeignTextEntry(event.target) ||
        isForeignTextEntry(document.activeElement) ||
        document.querySelector(windowSelector) !== null
    )
        return false
    const target = event.target instanceof HTMLElement ? event.target : document.activeElement
    if (!(target instanceof HTMLElement)) return true
    if (target.closest('button')) return false
    return (
        isPublicChatEditor(target) ||
        target.closest('[data-public-chat-reader]') !== null ||
        !isOwnedUiTarget(target)
    )
}

/** Explicitly leaving public typing returns to the world without taking a foreign window's focus. */
export function focusWorldInput(allowPublicChat = false): void {
    const editorOwnsFocus = allowPublicChat
        ? isForeignTextEntry(document.activeElement)
        : isTextEntry(document.activeElement)
    if (document.querySelector(windowSelector) || editorOwnsFocus) return
    document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus()
}

function isForeignTextEntry(target: EventTarget | null): boolean {
    return isTextEntry(target) && !isPublicChatEditor(target)
}

export function isPublicChatEditor(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement && target.matches(publicChatEditorSelector)
}

/** A HUD button owns confirmation, but its focus does not disable unrelated game shortcuts. */
export function gameKeyBlocked(event: KeyboardEvent): boolean {
    if (reservedKey(event)) return true
    if (permitsWorldMovement(event)) return false
    if (worldKeyboardOwned() || isOwnedUiTarget(event.target)) return true
    const focus = event.target instanceof HTMLElement ? event.target : document.activeElement
    return (
        focus instanceof HTMLElement && focus.closest('button') !== null && isConfirmationKey(event)
    )
}

function reservedKey(event: KeyboardEvent): boolean {
    return (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
    )
}
