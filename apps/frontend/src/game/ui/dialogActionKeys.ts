import { activateFocusedButton } from './uiKeyboard'

/** A modal owns confirmations, vertical selection, side switching and Tab focus. */
export function dialogActionKeys(
    event: KeyboardEvent,
    panel: HTMLElement | undefined,
    close: () => void
): void {
    if (event.code === 'Escape' || event.key === 'Escape') {
        event.preventDefault()
        close()
        return
    }
    if (activateFocusedButton(event, panel) || switchPane(event, panel)) return
    moveDialogFocus(event, panel)
}
function moveDialogFocus(event: KeyboardEvent, panel: HTMLElement | undefined): void {
    const target =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const scope = navigationScope(event, panel, target)
    const buttons = actionsIn(scope)
    const current = buttons.findIndex((button) => button === target)
    const direction = actionDirection(event)
    if (direction) {
        event.preventDefault()
        const start = current < 0 ? (direction > 0 ? -1 : 0) : current
        buttons[(start + direction + buttons.length) % buttons.length]?.focus()
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
function switchPane(event: KeyboardEvent, panel: HTMLElement | undefined): boolean {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.code)) return false
    const panes = Array.from(panel?.querySelectorAll<HTMLElement>('[data-chest-pane]') ?? [])
    if (panes.length < 2) return false
    event.preventDefault()
    const target = panes[event.code === 'ArrowLeft' ? 0 : 1]
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
function actionDirection(event: KeyboardEvent): number {
    if (event.code === 'Tab') return event.shiftKey ? -1 : 1
    if (['ArrowDown', 'KeyS'].includes(event.code)) return 1
    if (['ArrowUp', 'KeyW'].includes(event.code)) return -1
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
