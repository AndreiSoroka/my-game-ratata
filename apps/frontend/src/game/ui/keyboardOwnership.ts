const editorSelector = 'input, textarea, select, [contenteditable="true"], .speech-text'
const publicChatEditorSelector = 'input[data-public-chat-input]'
const windowSelector =
    'dialog[open], [role="dialog"], [role="menu"], [role="alertdialog"], .adventure-window'

export function isTextEntry(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest(editorSelector) !== null)
    )
}
export function isWorldHudButton(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('button[data-world-hud-button]') !== null
}
export function isOwnedUiTarget(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (isTextEntry(target) ||
            target.closest(windowSelector) !== null ||
            (!isWorldHudButton(target) && target.closest('[data-game-input-owner]') !== null))
    )
}
export function isConfirmationKey(event: KeyboardEvent): boolean {
    return ['Enter', 'Space', 'KeyF'].includes(event.code) || ['Enter', ' '].includes(event.key)
}
export function hasOpenGameWindow(): boolean {
    return document.querySelector(windowSelector) !== null
}
export function worldKeyboardOwned(): boolean {
    return hasOpenGameWindow() || isOwnedUiTarget(document.activeElement)
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
/** The public draft accepts confirmation from its editor or read-only history. */
export function publicChatOwnsKey(event: KeyboardEvent): boolean {
    if (
        reservedKey(event) ||
        isForeignTextEntry(event.target) ||
        isForeignTextEntry(document.activeElement) ||
        hasOpenGameWindow()
    )
        return false
    const target = event.target instanceof HTMLElement ? event.target : document.activeElement
    if (!(target instanceof HTMLElement)) return true
    if (isWorldHudButton(target)) return true
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
    if (hasOpenGameWindow() || editorOwnsFocus) return
    document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus()
}

function isForeignTextEntry(target: EventTarget | null): boolean {
    return isTextEntry(target) && !isPublicChatEditor(target)
}

export function isPublicChatEditor(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement && target.matches(publicChatEditorSelector)
}

export function gameKeyBlocked(event: KeyboardEvent): boolean {
    if (reservedKey(event)) return true
    if (worldKeyboardOwned() || isOwnedUiTarget(event.target)) return true
    const focus = event.target instanceof HTMLElement ? event.target : document.activeElement
    return (
        focus instanceof HTMLElement &&
        focus.closest('button') !== null &&
        !isWorldHudButton(focus) &&
        isConfirmationKey(event)
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
