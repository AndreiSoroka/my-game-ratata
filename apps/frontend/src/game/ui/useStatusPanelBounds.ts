import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/** Aligns sibling world overlays with the HUD's actual height, including earned faith knowledge. */
export function useStatusPanelBounds(panel: Ref<HTMLElement | undefined>): void {
    let container: HTMLElement | undefined
    let observer: ResizeObserver | undefined
    function publish(): void {
        if (!panel.value || !container) return
        const bottom =
            panel.value.getBoundingClientRect().bottom - container.getBoundingClientRect().top
        container.style.setProperty('--ratata-player-status-bottom', `${Math.max(0, bottom) + 8}px`)
    }
    onMounted(() => {
        container = panel.value?.closest<HTMLElement>('.game-screen') ?? undefined
        if (!container || !panel.value) return
        publish()
        if (typeof ResizeObserver === 'undefined') return
        observer = new ResizeObserver(publish)
        observer.observe(panel.value)
    })
    onBeforeUnmount(() => {
        observer?.disconnect()
        container?.style.removeProperty('--ratata-player-status-bottom')
    })
}
