import { activateFocusedButton } from './uiKeyboard'

export function inventoryKey(
    event: KeyboardEvent,
    panel: HTMLElement | undefined,
    close: () => void
): void {
    if (event.code === 'Escape' || event.key === 'Escape') {
        event.preventDefault()
        close()
        return
    }
    if (activateFocusedButton(event, panel)) return
    const target = event.target
    if (!(target instanceof HTMLButtonElement)) return
    const inGrid = target.classList.contains('inventory-slot')
    const directions: Record<string, number> = inGrid
        ? { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 10, ArrowUp: -10 }
        : { ArrowDown: 1, KeyS: 1, ArrowUp: -1, KeyW: -1 }
    const direction = directions[event.code]
    if (direction === undefined) return
    const buttons = Array.from(
        panel?.querySelectorAll<HTMLButtonElement>(
            inGrid ? '.inventory-slot' : '.inventory-actions button:not(:disabled)'
        ) ?? []
    )
    const current = buttons.indexOf(target)
    if (current < 0) return
    event.preventDefault()
    buttons[(current + direction + buttons.length) % buttons.length]?.focus()
}
