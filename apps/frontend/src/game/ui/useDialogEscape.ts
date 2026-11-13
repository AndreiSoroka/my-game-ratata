import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/** Escape remains owned after a canvas click, but never closes another focused dialog. */
export function useDialogEscape(panel: Ref<HTMLElement | undefined>, close: () => void): void {
    const escape = (event: KeyboardEvent): void => {
        const owner = panel.value
        if (!owner || event.code !== 'Escape') return
        const target = event.target instanceof HTMLElement ? event.target : document.activeElement
        if (target instanceof Node && owner.contains(target)) return
        if (target instanceof HTMLElement && target.closest('[role="dialog"], [role="menu"]'))
            return
        event.preventDefault()
        event.stopImmediatePropagation()
        if (!event.repeat) close()
    }
    onMounted(() => window.addEventListener('keydown', escape, true))
    onBeforeUnmount(() => window.removeEventListener('keydown', escape, true))
}
