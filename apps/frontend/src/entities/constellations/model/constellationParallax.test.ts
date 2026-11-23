import type { ConstellationSnapshot } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { projectConstellationStars } from './constellationParallax'

const [startId, rootId, childId] = ['layer1', 'layer5', 'layer12'] as const
const viewport = {
    drag: { x: 0, y: 0 },
    center: { x: 0, y: 0 },
    unitScale: 2,
    zoomDelta: 0,
}
const sky: ConstellationSnapshot = {
    version: 1,
    paths: [],
    nodes: [
        { id: startId, constellationId: 'blade', x: 0, y: 0, unlocked: true, parents: [] },
        {
            id: rootId,
            constellationId: 'blade',
            x: 110,
            y: 160,
            unlocked: true,
            parents: [],
        },
        {
            id: childId,
            constellationId: 'blade',
            x: 160,
            y: 180,
            unlocked: false,
            parents: [rootId, startId],
        },
    ],
    edges: [
        {
            from: startId,
            to: rootId,
            via: [
                { x: 30, y: 40 },
                { x: 110, y: 40 },
            ],
            crossLink: true,
        },
        { from: rootId, to: childId, via: [{ x: 150, y: 170 }] },
        { from: 'missing', to: childId, via: [{ x: 150, y: 170 }] },
    ],
}

it('retains the authored geometry at rest', () => {
    expect(projectConstellationStars(sky, viewport)).toBe(sky)
})

it('moves stars within one constellation and interpolates bends by route distance', () => {
    const before = structuredClone(sky)
    const projected = projectConstellationStars(sky, { ...viewport, drag: { x: 100, y: 0 } })

    expect(projected.nodes.map((node) => node.x)).toEqual([0, 98, 148])
    const route = projected.edges[0]!
    expect(route.crossLink).toBe(true)
    expect(route.via![0]!.x).toBeCloseTo(27.6)
    expect(route.via![1]!.x).toBeCloseTo(103.76)
    expect(route.via!.map((point) => point.y)).toEqual([40, 40])
    expect(projected.edges[1]!.via).toEqual([{ x: 138, y: 170 }])
    expect(projected.edges[2]).toBe(sky.edges[2])
    expect(sky).toEqual(before)
})

it('gives stars five stable pan rates even when their drift is capped', () => {
    const fullSky = {
        ...sky,
        nodes: ['layer1', 'layer0', 'layer3', 'layer2', 'layer5'].map((id) => ({
            ...sky.nodes[0]!,
            id,
        })),
    }
    const drag = { ...viewport, drag: { x: 100, y: 0 } }
    const projected = projectConstellationStars(fullSky, drag)
    expect(projected.nodes.map((node) => node.x)).toEqual([0, -3, -6, -9, -12])
    const capped = projectConstellationStars(fullSky, { ...drag, drag: { x: 500, y: 0 } })
    expect(capped.nodes.map((node) => node.x)).toEqual([0, -4, -8, -12, -16])
    const reordered = projectConstellationStars(
        { ...fullSky, nodes: [...fullSky.nodes].reverse() },
        drag
    )
    expect(reordered.nodes).toEqual([...projected.nodes].reverse())
})

it('zooms radially and limits combined drift to eight screen pixels at any scale', () => {
    const unitScale = 2.5
    const zoomed = projectConstellationStars(sky, { ...viewport, unitScale, zoomDelta: 1 })
    expect(zoomed.nodes[0]).toEqual(sky.nodes[0])
    expect(zoomed.nodes[1]).toMatchObject({ x: 114.4, y: 166.4 })

    const projected = projectConstellationStars(sky, {
        ...viewport,
        drag: { x: -600, y: 800 },
        unitScale,
        zoomDelta: 1,
    })
    const original = sky.nodes[1]!
    const root = projected.nodes[1]!
    expect(root.x).toBeGreaterThan(original.x)
    expect(root.y).toBeLessThan(original.y)
    expect(Math.hypot(root.x - original.x, root.y - original.y) / unitScale).toBeCloseTo(8)
})
