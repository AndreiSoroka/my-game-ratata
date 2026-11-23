import { constellationIds, type ConstellationSnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { afterEach, expect, it } from 'vitest'
import { h } from 'vue'

import { projectConstellationStars } from '../model/constellationParallax'
import { constellationHitTargets } from './constellationNavigation'
import { useConstellationViewport } from './useConstellationViewport'

const bounds = { x: -5000, y: -3000, width: 10000, height: 6000 }
const sky: ConstellationSnapshot = {
    version: 1,
    paths: [],
    nodes: [
        { id: 'life.root', constellationId: 'life', x: 4600, y: 2000, parents: [], unlocked: true },
        {
            id: 'life.child',
            constellationId: 'life',
            x: 3400,
            y: 1800,
            parents: ['life.root'],
            unlocked: true,
        },
        {
            id: 'life.branch',
            constellationId: 'life',
            x: 4000,
            y: 2200,
            parents: ['life.root'],
            unlocked: true,
        },
        {
            id: 'blade.root',
            constellationId: 'blade',
            x: -3000,
            y: -2000,
            parents: [],
            unlocked: true,
        },
    ],
    edges: [
        { from: 'life.root', to: 'life.child', via: [{ x: 3600, y: 1900 }] },
        { from: 'life.root', to: 'blade.root', via: [{ x: -4500, y: -2800 }], crossLink: true },
    ],
    layout: {
        bounds,
        minimumNodeSpacing: 48,
        regions: Object.fromEntries(constellationIds.map((id) => [id, bounds])) as NonNullable<
            ConstellationSnapshot['layout']
        >['regions'],
    },
}
const unmounts: (() => void)[] = []
afterEach(() => unmounts.splice(0).forEach((unmount) => unmount()))

function focusSky(snapshot: ConstellationSnapshot, width: number, height: number) {
    let viewport!: ReturnType<typeof useConstellationViewport>
    const host = mount({
        setup() {
            viewport = useConstellationViewport(() => snapshot)
            return () => h('svg', { ref: viewport.svg })
        },
    })
    unmounts.push(() => host.unmount())
    viewport.dimensions.value = { width, height }
    viewport.focusPath(snapshot.nodes[0]!)
    return viewport
}

function projection(
    snapshot: ConstellationSnapshot,
    viewport: ReturnType<typeof useConstellationViewport>
) {
    const view = viewport.visibleBounds.value
    return projectConstellationStars(snapshot, {
        center: { x: view.x + view.width / 2, y: view.y + view.height / 2 },
        zoom: viewport.zoom.value,
    })
}

function expectPathInside(
    snapshot: ConstellationSnapshot,
    viewport: ReturnType<typeof useConstellationViewport>
) {
    const projected = projection(snapshot, viewport)
    const view = viewport.visibleBounds.value
    const radius = constellationHitTargets(
        projected.nodes,
        viewport.unitScale.value,
        false,
        true,
        () => true
    )
    const path = projected.nodes.filter((node) => node.constellationId === 'life')
    for (const node of path) {
        const hitRadius = radius.get(node.id) ?? 12 * viewport.unitScale.value
        expect(node.x - hitRadius).toBeGreaterThanOrEqual(view.x)
        expect(node.x + hitRadius).toBeLessThanOrEqual(view.x + view.width)
        expect(node.y - hitRadius).toBeGreaterThanOrEqual(view.y)
        expect(node.y + hitRadius).toBeLessThanOrEqual(view.y + view.height)
    }
    const ids = new Set(path.map((node) => node.id))
    for (const edge of projected.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to))) {
        for (const point of edge.via ?? []) {
            expect(point.x).toBeGreaterThanOrEqual(view.x)
            expect(point.x).toBeLessThanOrEqual(view.x + view.width)
            expect(point.y).toBeGreaterThanOrEqual(view.y)
            expect(point.y).toBeLessThanOrEqual(view.y + view.height)
        }
    }
}

it.each([
    [320, 700],
    [700, 450],
])('fits the projected outer path and hit targets at %ipx × %ipx', (width, height) => {
    const viewport = focusSky(sky, width, height)
    expectPathInside(sky, viewport)
    const focused = { view: viewport.viewBox.value, zoom: viewport.zoom.value }
    viewport.reset()
    viewport.focusPath(sky.nodes[0]!)
    expect(viewport.viewBox.value).toBe(focused.view)
    expect(viewport.zoom.value).toBe(focused.zoom)
})

it('keeps a path on one plane readable without excessive empty padding', () => {
    const rigid = {
        ...sky,
        nodes: [sky.nodes[0]!, { ...sky.nodes[1]!, id: 'life.child.1' }],
        edges: [],
    }
    const viewport = focusSky(rigid, 320, 700)
    expectPathInside(rigid, viewport)
    const authoredScale = 1200 / (320 - 72)
    const baseScale = Math.max(bounds.width / 320, bounds.height / 700)
    expect(viewport.zoom.value).toBeGreaterThan((baseScale / authoredScale) * 0.92)
})

it('keeps edge-path hit targets inside the view and its camera inside the map', () => {
    const edge = {
        ...sky,
        nodes: [
            { ...sky.nodes[0]!, x: 5000, y: 3000 },
            { ...sky.nodes[1]!, x: 4900, y: 2950 },
        ],
        edges: [],
    }
    const viewport = focusSky(edge, 200, 160)
    expectPathInside(edge, viewport)
    const view = viewport.visibleBounds.value
    expect(view.x + view.width / 2).toBeLessThanOrEqual(bounds.x + bounds.width)
    expect(view.y + view.height / 2).toBeLessThanOrEqual(bounds.y + bounds.height)
})

it('ignores unreceived layout extents and foreign routes when fitting the observed path', () => {
    const viewport = focusSky(sky, 700, 450)
    const local = { ...sky, nodes: sky.nodes.slice(0, 3), edges: sky.edges.slice(0, 1) }
    const localViewport = focusSky(local, 700, 450)
    expect(viewport.zoom.value).toBe(localViewport.zoom.value)
    expect(viewport.viewBox.value).toBe(localViewport.viewBox.value)
    expect(viewport.zoom.value).toBeGreaterThan(2)
})
