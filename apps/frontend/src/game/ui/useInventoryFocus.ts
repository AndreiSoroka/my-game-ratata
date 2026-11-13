import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue'

import { focusPanelSurface } from './uiKeyboard'

/** Escape remains owned by the visible inventory even if a plain surface lost DOM focus. */
export function useInventoryFocus(panel: Ref<HTMLElement | undefined>, close: () => void) {
    const onEscape = (event: KeyboardEvent): void => {
        if (event.code !== 'Escape' && event.key !== 'Escape') return
        const target = event.target
        if (target instanceof HTMLElement && !panel.value?.contains(target)) {
            if (
                target.closest(
                    '[role="dialog"], [role="menu"], input, textarea, select, [contenteditable="true"]'
                ) ||
                document.querySelector('.chat-input')
            )
                return
        }
        event.preventDefault()
        event.stopImmediatePropagation()
        close()
    }
    onMounted(async () => {
        window.addEventListener('keydown', onEscape, true)
        await nextTick()
        panel.value
            ?.querySelector<HTMLButtonElement>(
                '.inventory-slot[data-filled="true"], .inventory-slot'
            )
            ?.focus()
    })
    onBeforeUnmount(() => {
        window.removeEventListener('keydown', onEscape, true)
        void nextTick(() => {
            if (!document.querySelector('[role="dialog"], .inventory-overlay'))
                document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus()
        })
    })
    return (event: PointerEvent): void => {
        focusPanelSurface(event, panel.value)
    }
}
