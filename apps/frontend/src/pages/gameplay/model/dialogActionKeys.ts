import { type NavigationDirection, navigationDirection } from '@/shared/lib/input'

import { activateFocusedButton } from './uiKeyboard'

/** Returns whether directional navigation moved focus. */
export function dialogActionKeys(
    event: KeyboardEvent,
    panel: HTMLElement | undefined,
    close: () => void
): boolean {
    if (event.code === 'Escape' || event.key === 'Escape') {
        event.preventDefault()
        close()
        return false
    }
    if (activateFocusedButton(event, panel)) return false
    const direction = navigationDirection(event)
    const previous = document.activeElement
    const switchedPane =
        (direction === 'left' || direction === 'right') && switchPane(event, panel, direction)
    if (!switchedPane) moveDialogFocus(event, panel, direction)
    return direction !== undefined && document.activeElement !== previous
}
function moveDialogFocus(
    event: KeyboardEvent,
    panel: HTMLElement | undefined,
    direction: NavigationDirection | undefined
): void {
    const target =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const scope = navigationScope(event, panel, target)
    const buttons = actionsIn(scope)
    const current = buttons.findIndex((button) => button === target)
    const step = actionStep(event, direction)
    if (step) {
        event.preventDefault()
        const start = current < 0 ? (step > 0 ? -1 : 0) : current
        buttons[(start + step + buttons.length) % buttons.length]?.focus()
    } else if (event.code === 'Home' || event.code === 'End') {
        event.preventDefault()
        ;(event.code === 'Home' ? buttons[0] : buttons.at(-1))?.focus()
    }
}
function actionsIn(panel: HTMLElement | undefined): HTMLButtonElement[] {
    return Array.from(
        panel?.querySelectorAll<HTMLButtonElement>('[data-dialog-action]:not(:disabled)') ?? []
    )
}
function switchPane(
    event: KeyboardEvent,
    panel: HTMLElement | undefined,
    direction: 'left' | 'right'
): boolean {
    const panes = Array.from(panel?.querySelectorAll<HTMLElement>('[data-chest-pane]') ?? [])
    if (panes.length < 2) return false
    event.preventDefault()
    const target = panes[direction === 'left' ? 0 : 1]
    if (!target) return true
    const focused = document.activeElement
    const source =
        focused instanceof HTMLElement
            ? focused.closest<HTMLElement>('[data-chest-pane]')
            : undefined
    const index = actionsIn(source ?? undefined).findIndex((button) => button === focused)
    const buttons = actionsIn(target)
    ;(buttons[Math.min(Math.max(0, index), buttons.length - 1)] ?? target).focus()
    return true
}
function actionStep(event: KeyboardEvent, direction: NavigationDirection | undefined): number {
    if (event.code === 'Tab') return event.shiftKey ? -1 : 1
    if (direction === 'down' || direction === 'right') return 1
    if (direction === 'up' || direction === 'left') return -1
    return 0
}

function navigationScope(
    event: KeyboardEvent,
    panel: HTMLElement | undefined,
    target: HTMLElement | undefined
): HTMLElement | undefined {
    return event.code === 'Tab'
        ? panel
        : (target?.closest<HTMLElement>('[data-chest-pane]') ?? panel)
}
