import type { ConstellationNodeSnapshot } from '@my-game-ratata/contracts'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export function useConstellationViewport(nodes: () => ConstellationNodeSnapshot[]) {
    const svg = ref<SVGSVGElement>()
    const zoom = ref(1)
    const offset = ref({ x: 0, y: 0 })
    const dimensions = ref({ width: 700, height: 450 })
    const bounds = computed(() => {
        const x = Math.min(0, ...nodes().map((node) => node.x)) - 110
        const y = Math.min(0, ...nodes().map((node) => node.y)) - 80
        return {
            x,
            y,
            width: Math.max(400, ...nodes().map((node) => node.x + 140)) - x,
            height: Math.max(260, ...nodes().map((node) => node.y + 90)) - y,
        }
    })
    const viewBox = computed(
        () =>
            `${bounds.value.x + offset.value.x} ${bounds.value.y + offset.value.y} ${bounds.value.width / zoom.value} ${bounds.value.height / zoom.value}`
    )
    const unitScale = computed(
        () =>
            Math.max(
                bounds.value.width / dimensions.value.width,
                bounds.value.height / dimensions.value.height
            ) / zoom.value
    )
    const gestures = viewportGestures(svg, bounds, zoom, offset)
    function reset(): void {
        zoom.value = 1
        offset.value = { x: 0, y: 0 }
    }
    function focusPath(node: ConstellationNodeSnapshot): void {
        const group = nodes().filter(
            (candidate) => candidate.constellationId === node.constellationId
        )
        const center = {
            x:
                (Math.min(...group.map((item) => item.x)) +
                    Math.max(...group.map((item) => item.x))) /
                2,
            y:
                (Math.min(...group.map((item) => item.y)) +
                    Math.max(...group.map((item) => item.y))) /
                2,
        }
        zoom.value = Math.min(
            4,
            Math.max(
                1.5,
                bounds.value.width /
                    Math.max(
                        350,
                        Math.max(...group.map((item) => item.x)) -
                            Math.min(...group.map((item) => item.x)) +
                            180
                    )
            )
        )
        offset.value = {
            x: center.x - bounds.value.x - bounds.value.width / zoom.value / 2,
            y: center.y - bounds.value.y - bounds.value.height / zoom.value / 2,
        }
    }
    let observer: ResizeObserver | undefined
    onMounted(() => {
        if (!svg.value || typeof ResizeObserver === 'undefined') return
        observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect
            if (rect && rect.width > 0 && rect.height > 0)
                dimensions.value = { width: rect.width, height: rect.height }
        })
        observer.observe(svg.value)
    })
    onBeforeUnmount(() => observer?.disconnect())
    return { svg, zoom, bounds, viewBox, unitScale, reset, focusPath, ...gestures }
}

function viewportGestures(
    svg: import('vue').Ref<SVGSVGElement | undefined>,
    bounds: import('vue').ComputedRef<{ x: number; y: number; width: number; height: number }>,
    zoom: import('vue').Ref<number>,
    offset: import('vue').Ref<{ x: number; y: number }>
) {
    const pointers = new Map<number, { x: number; y: number }>()
    let dragged = false
    function scale(factor: number): void {
        const next = Math.max(0.65, Math.min(4, zoom.value * factor))
        offset.value = {
            x: offset.value.x + (bounds.value.width * (1 / zoom.value - 1 / next)) / 2,
            y: offset.value.y + (bounds.value.height * (1 / zoom.value - 1 / next)) / 2,
        }
        zoom.value = next
    }
    function down(event: PointerEvent): void {
        if (event.button !== 0) return
        dragged = false
        if (event.target instanceof Element && event.target.closest('.constellation-node')) return
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
        svg.value?.setPointerCapture?.(event.pointerId)
    }
    function move(event: PointerEvent): void {
        const previous = pointers.get(event.pointerId),
            rect = svg.value?.getBoundingClientRect()
        if (!previous || !rect) return
        const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1]
        if (other) {
            const old = Math.hypot(previous.x - other.x, previous.y - other.y)
            if (old > 0) scale(Math.hypot(event.clientX - other.x, event.clientY - other.y) / old)
        } else {
            const dx = event.clientX - previous.x,
                dy = event.clientY - previous.y
            if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true
            offset.value = {
                x: offset.value.x - ((dx / rect.width) * bounds.value.width) / zoom.value,
                y: offset.value.y - ((dy / rect.height) * bounds.value.height) / zoom.value,
            }
        }
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }
    return {
        scale,
        down,
        move,
        up: (event: PointerEvent) => pointers.delete(event.pointerId),
        didDrag: () => dragged,
    }
}
