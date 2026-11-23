import {
    constellationIds,
    type ConstellationLayoutSnapshot,
    type ConstellationSnapshot,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { projectConstellationStars } from './constellationParallax'

const [startId, rootId, childId] = ['blade.root', 'life.root', 'life.child'] as const
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
            constellationId: 'life',
            x: 110,
            y: 160,
            unlocked: true,
            parents: [],
        },
        {
            id: childId,
            constellationId: 'life',
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

it('moves each constellation rigidly and interpolates links between constellations', () => {
    const before = structuredClone(sky)
    const projected = projectConstellationStars(sky, { ...viewport, drag: { x: 60, y: 80 } })

    expect(projected.nodes[0]).toEqual(sky.nodes[0])
    expect(projected.nodes[1]).toMatchObject({ x: 102.8, y: 150.4 })
    expect(projected.nodes[2]).toMatchObject({ x: 152.8, y: 170.4 })
    const route = projected.edges[0]!
    expect(route.crossLink).toBe(true)
    expect(route.via![0]!.x).toBeCloseTo(28.56)
    expect(route.via![0]!.y).toBeCloseTo(38.08)
    expect(route.via![1]!.x).toBeCloseTo(106.256)
    expect(route.via![1]!.y).toBeCloseTo(35.008)
    expect(projected.edges[1]!.via).toEqual([{ x: 142.8, y: 160.4 }])
    expect(projected.edges[2]).toBe(sky.edges[2])
    expect(sky).toEqual(before)
})

it('gives constellations five stable pan rates even when their drift is capped', () => {
    const fullSky = {
        ...sky,
        nodes: constellationIds.map((id) => ({
            ...sky.nodes[0]!,
            id,
            constellationId: id,
        })),
    }
    const drag = { ...viewport, drag: { x: 100, y: 0 } }
    const projected = projectConstellationStars(fullSky, drag)
    const panOffsets = [0, -3, -6, -9, -12]
    expect(projected.nodes.map((node) => node.x)).toEqual(
        fullSky.nodes.map((_, index) => panOffsets[index % panOffsets.length])
    )
    const capped = projectConstellationStars(fullSky, { ...drag, drag: { x: 500, y: 0 } })
    const cappedOffsets = [0, -4, -8, -12, -16]
    expect(capped.nodes.map((node) => node.x)).toEqual(
        fullSky.nodes.map((_, index) => cappedOffsets[index % cappedOffsets.length])
    )
    const reordered = projectConstellationStars(
        { ...fullSky, nodes: [...fullSky.nodes].reverse() },
        drag
    )
    expect(reordered.nodes).toEqual([...projected.nodes].reverse())
})

it('uses the authored region center for rigid zoom and caps combined drift in screen pixels', () => {
    const unitScale = 2.5
    const region = { x: 80, y: 100, width: 40, height: 50 }
    const regions = Object.fromEntries(
        constellationIds.map((id) => [id, region])
    ) as ConstellationLayoutSnapshot['regions']
    const authoredSky = { ...sky, layout: { bounds: region, regions, minimumNodeSpacing: 48 } }
    const zoomed = projectConstellationStars(authoredSky, { ...viewport, unitScale, zoomDelta: 1 })
    expect(zoomed.nodes[0]).toEqual(sky.nodes[0])
    expect(zoomed.nodes[1]).toMatchObject({ x: 114, y: 165 })
    expect(zoomed.nodes[2]).toMatchObject({ x: 164, y: 185 })
    expect(zoomed.edges[1]!.via).toEqual([{ x: 154, y: 175 }])

    const projected = projectConstellationStars(authoredSky, {
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
    expect(projected.nodes[2]!.x - root.x).toBeCloseTo(50)
    expect(projected.nodes[2]!.y - root.y).toBeCloseTo(20)
})

it('uses the same fallback anchor after nodes are reordered', () => {
    const secondRoot = { ...sky.nodes[1]!, id: 'life.secondary', x: 30, y: 50 }
    const withRoots = { ...sky, nodes: [secondRoot, ...sky.nodes] }
    const zoom = { ...viewport, zoomDelta: 1 }
    const projected = projectConstellationStars(withRoots, zoom)

    expect(projected.nodes[0]).toMatchObject({ x: 34.4, y: 56.4 })
    expect(projected.nodes[2]).toMatchObject({ x: 114.4, y: 166.4 })
    expect(projected.nodes[3]).toMatchObject({ x: 164.4, y: 186.4 })
    expect(
        projectConstellationStars({ ...withRoots, nodes: [...withRoots.nodes].reverse() }, zoom)
            .nodes
    ).toEqual([...projected.nodes].reverse())
})
