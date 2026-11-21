import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/** Share a footer row's actual height with the game screen's overlay layout. */
export function useFooterHeight(
    element: Ref<HTMLElement | undefined>,
    property: `--${string}`
): void {
    let screen: HTMLElement | null | undefined
    let observer: ResizeObserver | undefined
    onMounted(() => {
        const row = element.value
        screen = row?.closest<HTMLElement>('.game-screen')
        if (!row || !screen) return
        const publish = () => screen?.style.setProperty(property, `${row.offsetHeight}px`)
        publish()
        if (typeof ResizeObserver === 'undefined') return
        observer = new ResizeObserver(publish)
        observer.observe(row)
    })
    onBeforeUnmount(() => {
        observer?.disconnect()
        screen?.style.removeProperty(property)
    })
}
