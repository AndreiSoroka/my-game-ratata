import { type NavigationDirection, navigationDirection } from '@/shared/lib/input'

import {
    focusWorldInput,
    isConfirmationKey,
    isTextEntry,
    isWorldHudButton,
} from '../../../game/ui/keyboardOwnership'

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
    const reserved = [
        event.defaultPrevented,
        event.isComposing,
        event.altKey,
        event.ctrlKey,
        event.metaKey,
    ]
    if (reserved.some(Boolean) || !isConfirmationKey(event) || isTextEntry(event.target))
        return false
    const focused = document.activeElement
    if (!(focused instanceof HTMLButtonElement) || !panel?.contains(focused)) return false
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat && !focused.disabled) focused.click()
    return true
}

export function navigatePanelFocus(event: KeyboardEvent, panel: HTMLElement | undefined): boolean {
    if (isTextEntry(event.target)) return false
    const direction = navigationDirection(event)
    if (!direction) return false
    return (
        scrollFocusedContent(event, panel, direction) ||
        moveFocus(
            event,
            panel,
            'button, input, select, textarea, summary, a[href], [tabindex]',
            direction === 'up' || direction === 'left'
        )
    )
}

export function navigateDialogueActions(
    event: KeyboardEvent,
    panel: HTMLElement | undefined
): boolean {
    if (isTextEntry(event.target)) return false
    if (activateFocusedButton(event, panel)) return true
    const direction = navigationDirection(event)
    return (
        (direction === 'up' || direction === 'down') &&
        (scrollFocusedContent(event, panel, direction) ||
            moveFocus(event, panel, '[data-dialogue-action]', direction === 'up'))
    )
}

function scrollFocusedContent(
    event: KeyboardEvent,
    panel: HTMLElement | undefined,
    direction: NavigationDirection
): boolean {
    const focus = document.activeElement
    if (
        !panel ||
        !(focus instanceof HTMLElement) ||
        focus.tabIndex < 0 ||
        !focus.matches(
            '[tabindex]:not(button, a, input, select, textarea, summary, [role="button"], [role="tab"])'
        )
    )
        return false
    const horizontal = direction === 'left' || direction === 'right'
    const area = scrollingAncestor(panel, focus, horizontal)
    if (!area) return false
    if (event.code.startsWith('Key')) {
        event.preventDefault()
        const step = direction === 'up' || direction === 'left' ? -40 : 40
        if (horizontal) area.scrollLeft += step
        else area.scrollTop += step
    }
    return true
}

function scrollingAncestor(
    panel: HTMLElement,
    focus: HTMLElement,
    horizontal: boolean
): HTMLElement | undefined {
    for (
        let area: HTMLElement | null = focus;
        area && panel.contains(area);
        area = area.parentElement
    ) {
        const hasOverflow = horizontal
            ? area.scrollWidth > area.clientWidth
            : area.scrollHeight > area.clientHeight
        if (!hasOverflow) continue
        const style = getComputedStyle(area)
        const overflow = (horizontal ? style.overflowX : style.overflowY) || style.overflow
        if (overflow === 'auto' || overflow === 'scroll') return area
    }
    return undefined
}

function moveFocus(
    event: KeyboardEvent,
    panel: HTMLElement | undefined,
    selector: string,
    backwards: boolean
): boolean {
    const controls = Array.from(panel?.querySelectorAll<HTMLElement>(selector) ?? []).filter(
        (control) =>
            control.tabIndex >= 0 &&
            !control.matches(':disabled, [aria-disabled="true"]') &&
            !control.closest('[hidden], [inert]')
    )
    if (!controls.length) return false
    event.preventDefault()
    const current = controls.findIndex((control) => control === document.activeElement)
    const start = current < 0 && backwards ? 0 : current
    controls[(start + (backwards ? -1 : 1) + controls.length) % controls.length]?.focus()
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
