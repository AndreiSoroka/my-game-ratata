import { type NavigationDirection, navigationDirection } from '@/shared/lib/input'

import { activateFocusedButton } from './uiKeyboard'

const bagColumns = 10
const bagStep = { left: -1, right: 1, up: -bagColumns, down: bagColumns }
const bagSlots = '.inventory-slot'
const equipmentSlots = '.equipment-slot'

export function inventoryKey(
    event: KeyboardEvent,
    panel: HTMLElement | undefined,
    close: () => void,
    onSlotChange: (fromActions: boolean) => void
): void {
    if (event.code === 'Escape' || event.key === 'Escape') {
        event.preventDefault()
        close()
        return
    }
    if (activateFocusedButton(event, panel)) return
    const direction = navigationDirection(event)
    if (!direction || !panel) return
    event.preventDefault()
    const current = panel.querySelector<HTMLButtonElement>('button:focus')
    const next = inventoryNeighbor(panel, current, direction)
    if (!next || next === current) return
    next.focus()
    if (next.matches(bagSlots) && document.activeElement === next)
        onSlotChange(current?.closest('.inventory-actions') != null)
}

function inventoryNeighbor(
    panel: HTMLElement,
    current: HTMLButtonElement | null,
    direction: NavigationDirection
): HTMLButtonElement | undefined {
    if (current?.matches(bagSlots)) return bagNeighbor(panel, current, direction)
    if (current?.matches(equipmentSlots)) return equipmentNeighbor(panel, current, direction)
    if (current?.closest('.inventory-actions')) return actionNeighbor(panel, current, direction)
    return selectedBagCell(panel)
}

function bagNeighbor(
    panel: HTMLElement,
    current: HTMLButtonElement,
    direction: NavigationDirection
): HTMLButtonElement | undefined {
    const slots = buttonsIn(panel, bagSlots)
    const index = slots.indexOf(current)
    if (direction === 'left' && index % bagColumns === 0) {
        const equipment = buttonsIn(panel, equipmentSlots)
        const row = Math.floor(index / bagColumns)
        const equipmentSlot = equipment[Math.min(row, equipment.length - 1)]
        if (equipmentSlot) return equipmentSlot
    }
    return wrappedNeighbor(slots, index, bagStep[direction])
}

function equipmentNeighbor(
    panel: HTMLElement,
    current: HTMLButtonElement,
    direction: NavigationDirection
): HTMLButtonElement | undefined {
    const equipment = buttonsIn(panel, equipmentSlots)
    const index = equipment.indexOf(current)
    if (direction === 'right') return buttonsIn(panel, bagSlots)[index * bagColumns]
    if (direction === 'up' || direction === 'down')
        return wrappedNeighbor(equipment, index, direction === 'up' ? -1 : 1)
    return undefined
}

function actionNeighbor(
    panel: HTMLElement,
    current: HTMLButtonElement,
    direction: NavigationDirection
): HTMLButtonElement | undefined {
    if (direction === 'left' || direction === 'right') {
        const slots = buttonsIn(panel, '.inventory-hotbar-slots button:not(:disabled)')
        const index = slots.indexOf(current)
        return index < 0 ? undefined : wrappedNeighbor(slots, index, bagStep[direction])
    }
    const actions = buttonsIn(panel, '.inventory-actions button:not(:disabled)')
    const index = actions.indexOf(current)
    if (direction === 'up' && index === 0) return selectedBagCell(panel)
    return wrappedNeighbor(actions, index, direction === 'up' ? -1 : 1)
}

function selectedBagCell(panel: HTMLElement): HTMLButtonElement | undefined {
    return (
        panel.querySelector<HTMLButtonElement>('.inventory-slot--selected') ??
        panel.querySelector<HTMLButtonElement>(bagSlots) ??
        undefined
    )
}

function buttonsIn(panel: HTMLElement, selector: string): HTMLButtonElement[] {
    return Array.from(panel.querySelectorAll<HTMLButtonElement>(selector))
}

function wrappedNeighbor(
    buttons: HTMLButtonElement[],
    index: number,
    step: number
): HTMLButtonElement | undefined {
    return buttons[(index + step + buttons.length) % buttons.length]
}
