import type { Ref } from 'vue'

import type { MenuItem } from '../model/menu'

export function menuHighlightPointer(
    mode: Ref<'keyboard' | 'pointer'>,
    hovered: Ref<string | undefined>,
    itemButton: (target: EventTarget | null) => HTMLButtonElement | undefined
) {
    function pointerEnter(event: PointerEvent): void {
        if (event.pointerType === 'touch') return
        mode.value = 'pointer'
        hovered.value = undefined
    }
    function enterButton(event: PointerEvent, item: MenuItem): void {
        if (event.pointerType === 'touch') return
        mode.value = 'pointer'
        hovered.value = item.disabled ? undefined : item.id
    }
    function pointerMove(event: PointerEvent): void {
        if (
            event.pointerType === 'touch' ||
            mode.value === 'pointer' ||
            (event.movementX === 0 && event.movementY === 0)
        )
            return
        mode.value = 'pointer'
        const button = itemButton(event.target)
        hovered.value = button && !button.disabled ? button.dataset.menuItem : undefined
    }
    function pointerLeave(): void {
        hovered.value = undefined
    }
    function pointerDown(event: PointerEvent): void {
        mode.value = 'pointer'
        if (event.pointerType === 'touch') hovered.value = undefined
    }
    return { pointerEnter, enterButton, pointerMove, pointerLeave, pointerDown }
}
