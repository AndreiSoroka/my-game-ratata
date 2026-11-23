import { constellationIds, type ConstellationSnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { h, shallowRef } from 'vue'

import { useConstellationViewport } from './useConstellationViewport'

const bounds = { x: 100, y: -300, width: 1400, height: 900 }
const sky: ConstellationSnapshot = {
    version: 1,
    paths: [],
    nodes: [
        { id: 'root', constellationId: 'prayer', x: 400, y: -50, parents: [], unlocked: true },
        {
            id: 'child',
            constellationId: 'prayer',
            x: 600,
            y: 100,
            parents: ['root'],
            unlocked: true,
        },
    ],
    edges: [],
    layout: {
        bounds,
        minimumNodeSpacing: 48,
        regions: Object.fromEntries(constellationIds.map((id) => [id, bounds])) as NonNullable<
            ConstellationSnapshot['layout']
        >['regions'],
    },
}
const unmounts: (() => void)[] = []
afterEach(() => {
    unmounts.splice(0).forEach((unmount) => unmount())
    vi.unstubAllGlobals()
})

function mountViewport(initial = sky) {
    const state = shallowRef(initial)
    let resize!: (width: number, height: number) => void
    const disconnect = vi.fn<() => void>()
    vi.stubGlobal(
        'ResizeObserver',
        class {
            constructor(callback: ResizeObserverCallback) {
                resize = (width, height) =>
                    callback([{ contentRect: { width, height } } as ResizeObserverEntry], this)
            }
            observe() {}
            unobserve() {}
            disconnect = disconnect
        }
    )
    let viewport!: ReturnType<typeof useConstellationViewport>
    const host = mount({
        setup() {
            viewport = useConstellationViewport(() => state.value)
            return () => h('svg', { ref: viewport.svg })
        },
    })
    unmounts.push(() => host.unmount())
    const pointer = (type: string, x: number, y: number, pointerId = 1) =>
        ({
            type,
            button: 0,
            clientX: x,
            clientY: y,
            pointerId,
            target: host.element,
        }) as PointerEvent
    function drag(x: number, y: number): void {
        viewport.down(pointer('pointerdown', 0, 0))
        viewport.move(pointer('pointermove', x, y))
        viewport.up(pointer('pointerup', x, y))
    }
    function center() {
        const view = viewport.visibleBounds.value
        return { x: view.x + view.width / 2, y: view.y + view.height / 2 }
    }
    return { viewport, state, resize, drag, center, pointer, disconnect }
}

it.each([
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
])('stops at 50%% overscroll toward (%i, %i) and reverses immediately', (x, y) => {
    const { viewport, drag, center, pointer } = mountViewport()
    viewport.scale(4)
    drag(x * 10_000, y * 10_000)
    const edge = center()
    expect(edge).toEqual({
        x: bounds.x + (x === 0 ? bounds.width / 2 : x < 0 ? bounds.width : 0),
        y: bounds.y + (y === 0 ? bounds.height / 2 : y < 0 ? bounds.height : 0),
    })
    const view = viewport.visibleBounds.value
    expect(bounds.x - view.x).toBeLessThanOrEqual(view.width / 2)
    expect(view.x + view.width - bounds.x - bounds.width).toBeLessThanOrEqual(view.width / 2)
    expect(bounds.y - view.y).toBeLessThanOrEqual(view.height / 2)
    expect(view.y + view.height - bounds.y - bounds.height).toBeLessThanOrEqual(view.height / 2)

    viewport.down(pointer('pointerdown', 0, 0))
    viewport.move(pointer('pointermove', x * 1000, y * 1000))
    viewport.move(pointer('pointermove', x * 990, y * 990))
    expect(center().x - edge.x).toBeCloseTo(x * 10 * viewport.unitScale.value)
    expect(center().y - edge.y).toBeCloseTo(y * 10 * viewport.unitScale.value)
})

it('uses actual camera coordinates for background pan across focus, zoom and reset', () => {
    const { viewport, drag, center } = mountViewport()
    const initial = viewport.viewBox.value
    const overviewScale = viewport.unitScale.value
    const overviewCenter = center()
    viewport.focusStar(sky.nodes[1]!)
    expect(center()).toEqual({ x: 600, y: 100 })
    expect(viewport.dragOffset.value.x).not.toBe(0)
    const focused = { pan: viewport.dragOffset.value, unitScale: viewport.unitScale.value }
    drag(25, -30)
    drag(-25, 30)
    expect(viewport.dragOffset.value.x).toBeCloseTo(focused.pan.x)
    expect(viewport.dragOffset.value.y).toBeCloseTo(focused.pan.y)
    viewport.scale(2)
    expect(viewport.dragOffset.value.x).toBeCloseTo(focused.pan.x * 2)
    expect(viewport.unitScale.value).toBeCloseTo(focused.unitScale / 2)
    viewport.scale(0.5)
    viewport.focusStar(sky.nodes[1]!)
    expect(viewport.dragOffset.value).toEqual(focused.pan)
    expect(viewport.unitScale.value).toEqual(focused.unitScale)
    viewport.reset()
    expect(viewport.viewBox.value).toEqual(initial)
    expect(viewport.dragOffset.value.x).toBeCloseTo(0)
    expect(viewport.dragOffset.value.y).toBeCloseTo(0)
    expect(center()).toEqual(overviewCenter)
    expect(viewport.unitScale.value).toBe(overviewScale)
    viewport.focusPath(sky.nodes[0]!)
    expect(center()).not.toEqual(overviewCenter)
    expect(viewport.dragOffset.value.x).not.toBe(0)
})

it('reclamps updated maps, preserves the edge on resize and cleans up its observer', () => {
    const { viewport, state, drag, center, resize, disconnect } = mountViewport()
    drag(-10_000, -10_000)
    const smaller = { ...bounds, width: 300, height: 200 }
    state.value = { ...sky, layout: { ...sky.layout!, bounds: smaller } }
    expect(center()).toEqual({ x: smaller.x + smaller.width, y: smaller.y + smaller.height })
    const beforeResize = viewport.unitScale.value
    resize(320, 700)
    expect(viewport.unitScale.value).not.toBe(beforeResize)
    viewport.scale(2)
    expect(center()).toEqual({ x: smaller.x + smaller.width, y: smaller.y + smaller.height })
    drag(10, 10)
    expect(center().x).toBeLessThan(smaller.x + smaller.width)
    expect(center().y).toBeLessThan(smaller.y + smaller.height)
    viewport.reset()
    expect(center()).toEqual({ x: 250, y: -200 })
    expect(viewport.unitScale.value).toBeCloseTo(300 / 320)
    unmounts.pop()!()
    expect(disconnect).toHaveBeenCalledOnce()
})

it('constrains focus targets and supports pinch zoom without changing the camera origin', () => {
    const { viewport, center, pointer } = mountViewport()
    viewport.focusStar({ ...sky.nodes[1]!, x: -10_000, y: 10_000 })
    expect(center()).toEqual({ x: bounds.x, y: bounds.y + bounds.height })
    const before = viewport.zoom.value
    viewport.down(pointer('pointerdown', 100, 100, 1))
    viewport.down(pointer('pointerdown', 200, 100, 2))
    viewport.move(pointer('pointermove', 250, 100, 2))
    expect(viewport.zoom.value).toBeCloseTo(before * 1.5)
    expect(center()).toEqual({ x: bounds.x, y: bounds.y + bounds.height })
})

it('limits maps without layout metadata using the existing fallback bounds', () => {
    const { viewport, drag, center } = mountViewport({ ...sky, layout: undefined })
    const overview = viewport.visibleBounds.value
    expect(center()).toEqual({ x: 315, y: 65 })
    expect(viewport.unitScale.value).toBeCloseTo(850 / 700)
    drag(10_000, 10_000)
    expect(center().x).toBeCloseTo(-110)
    expect(center().y).toBeCloseTo(-130)
    expect(viewport.viewBox.value).not.toBe(
        `${overview.x} ${overview.y} ${overview.width} ${overview.height}`
    )
})
