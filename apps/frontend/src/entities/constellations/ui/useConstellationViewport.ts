import type {
    ConstellationNodeSnapshot,
    ConstellationSnapshot,
    Vector2,
} from '@my-game-ratata/contracts'
import { computed, onBeforeUnmount, onMounted, type Ref, ref } from 'vue'

import { constellationViewportFocus } from './constellationViewportFocus'

export function useConstellationViewport(snapshot: () => ConstellationSnapshot) {
    const svg = ref<SVGSVGElement>()
    const zoom = ref(1)
    const offset = ref<Vector2>({ x: 0, y: 0 })
    const dragOffset = ref<Vector2>({ x: 0, y: 0 })
    const dimensions = ref({ width: 700, height: 450 })
    const bounds = computed(() => snapshot().layout?.bounds ?? fallbackBounds(snapshot().nodes))
    const baseScale = computed(() =>
        Math.max(
            bounds.value.width / dimensions.value.width,
            bounds.value.height / dimensions.value.height
        )
    )
    const unitScale = computed(() => baseScale.value / zoom.value)
    const visibleBounds = computed(() =>
        viewportBounds(bounds.value, dimensions.value, unitScale.value, offset.value)
    )
    const viewBox = computed(() => formatViewBox(visibleBounds.value))
    const minimumSpacing = computed(() => snapshot().layout?.minimumNodeSpacing ?? 48)
    const detailed = computed(() => unitScale.value <= minimumSpacing.value / 52)
    const maximumZoom = computed(() => Math.max(8, (unitScale.value * zoom.value) / 0.4))
    const gestures = viewportGestures(
        svg,
        zoom,
        offset,
        dragOffset,
        () => maximumZoom.value,
        () => unitScale.value
    )
    function reset(): void {
        zoom.value = 1
        offset.value = { x: 0, y: 0 }
        dragOffset.value = { x: 0, y: 0 }
    }
    function centerOn(point: { x: number; y: number }): void {
        dragOffset.value = { x: 0, y: 0 }
        offset.value = {
            x: point.x - bounds.value.x - bounds.value.width / 2,
            y: point.y - bounds.value.y - bounds.value.height / 2,
        }
    }
    const { focusPath, focusStar } = constellationViewportFocus({
        snapshot,
        dimensions,
        minimumSpacing,
        baseScale,
        zoom,
        maximumZoom,
        centerOn,
    })
    function ensureVisible(node: ConstellationNodeSnapshot, position: Vector2): void {
        const margin = 32 * unitScale.value
        const { x, y, width, height } = visibleBounds.value
        if (
            position.x < x + margin ||
            position.x > x + width - margin ||
            position.y < y + margin ||
            position.y > y + height - margin
        )
            centerOn(node)
    }
    observeDimensions(svg, dimensions)
    return {
        svg,
        zoom,
        dragOffset,
        dimensions,
        viewBox,
        visibleBounds,
        unitScale,
        detailed,
        reset,
        focusPath,
        focusStar,
        ensureVisible,
        ...gestures,
    }
}

function formatViewBox({ x, y, width, height }: ReturnType<typeof viewportBounds>): string {
    return `${x} ${y} ${width} ${height}`
}

function viewportGestures(
    svg: Ref<SVGSVGElement | undefined>,
    zoom: Ref<number>,
    offset: Ref<Vector2>,
    dragOffset: Ref<Vector2>,
    maximumZoom: () => number,
    unitScale: () => number
) {
    const pointers = new Map<number, { x: number; y: number }>()
    const origins = new Map<number, { x: number; y: number }>()
    let dragged = false
    function scale(factor: number): void {
        const next = Math.max(1, Math.min(maximumZoom(), zoom.value * factor))
        zoom.value = next
    }
    function down(event: PointerEvent): void {
        if (event.button !== 0) return
        if (pointers.size === 0) dragged = false
        else dragged = true
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
        origins.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (!(event.target instanceof Element && event.target.closest('.constellation-node')))
            svg.value?.setPointerCapture?.(event.pointerId)
    }
    function move(event: PointerEvent): void {
        const previous = pointers.get(event.pointerId),
            rect = svg.value?.getBoundingClientRect()
        if (!previous || !rect) return
        const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1]
        if (other) {
            dragged = true
            const old = Math.hypot(previous.x - other.x, previous.y - other.y)
            if (old > 0) scale(Math.hypot(event.clientX - other.x, event.clientY - other.y) / old)
        } else {
            const dx = event.clientX - previous.x,
                dy = event.clientY - previous.y
            const origin = origins.get(event.pointerId)!
            if (Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y) > 2) {
                dragged = true
                svg.value?.setPointerCapture?.(event.pointerId)
            }
            offset.value = {
                x: offset.value.x - dx * unitScale(),
                y: offset.value.y - dy * unitScale(),
            }
            dragOffset.value = { x: dragOffset.value.x + dx, y: dragOffset.value.y + dy }
        }
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }
    return {
        scale,
        down,
        move,
        up: (event: PointerEvent) => {
            if (event.type === 'pointercancel') dragged = true
            pointers.delete(event.pointerId)
            origins.delete(event.pointerId)
        },
        didDrag: () => dragged,
    }
}

function fallbackBounds(nodes: ConstellationNodeSnapshot[]) {
    const x = Math.min(0, ...nodes.map((node) => node.x)) - 110
    const y = Math.min(0, ...nodes.map((node) => node.y)) - 80
    return {
        x,
        y,
        width: Math.max(400, ...nodes.map((node) => node.x + 140)) - x,
        height: Math.max(260, ...nodes.map((node) => node.y + 90)) - y,
    }
}
function observeDimensions(
    svg: Ref<SVGSVGElement | undefined>,
    dimensions: Ref<{ width: number; height: number }>
): void {
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
}

function viewportBounds(
    bounds: { x: number; y: number; width: number; height: number },
    dimensions: { width: number; height: number },
    unitScale: number,
    offset: { x: number; y: number }
) {
    const width = dimensions.width * unitScale,
        height = dimensions.height * unitScale
    return {
        x: bounds.x + bounds.width / 2 + offset.x - width / 2,
        y: bounds.y + bounds.height / 2 + offset.y - height / 2,
        width,
        height,
    }
}
