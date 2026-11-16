import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue'

import { useEscapeOwner } from './uiEscapeOwners'
import { focusPanelSurface } from './uiKeyboard'

/** Escape remains owned by the visible inventory even if a plain surface lost DOM focus. */
export function useInventoryFocus(panel: Ref<HTMLElement | undefined>, close: () => void) {
    useEscapeOwner({
        active: () => true,
        escape: close,
        element: panel,
    })
    onMounted(async () => {
        await nextTick()
        panel.value
            ?.querySelector<HTMLButtonElement>(
                '.inventory-slot[data-filled="true"], .inventory-slot'
            )
            ?.focus()
    })
    onBeforeUnmount(() => {
        void nextTick(() => {
            if (!document.querySelector('[role="dialog"], .inventory-overlay'))
                document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus()
        })
    })
    return (event: PointerEvent): void => {
        focusPanelSurface(event, panel.value)
    }
}
