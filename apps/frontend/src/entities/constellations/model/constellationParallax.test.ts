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

it('moves stars inside a constellation at different depths and interpolates both kinds of links', () => {
    const before = structuredClone(sky)
    const projected = projectConstellationStars(sky, { ...viewport, drag: { x: 60, y: 80 } })

    expect(projected.nodes[0]).toEqual(sky.nodes[0])
    expect(projected.nodes[1]).toMatchObject({ x: 86, y: 128 })
    expect(projected.nodes[2]).toEqual(sky.nodes[2])
    const route = projected.edges[0]!
    expect(route.crossLink).toBe(true)
    expect(route.via![0]!.x).toBeCloseTo(25.2)
    expect(route.via![0]!.y).toBeCloseTo(33.6)
    expect(route.via![1]!.x).toBeCloseTo(97.52)
    expect(route.via![1]!.y).toBeCloseTo(23.36)
    const internalBend = projected.edges[1]!.via![0]!
    const endWeight = Math.hypot(40, 10) / (Math.hypot(40, 10) + Math.hypot(10, 10))
    expect(internalBend.x).toBeCloseTo(150 - 24 * (1 - endWeight))
    expect(internalBend.y).toBeCloseTo(170 - 32 * (1 - endWeight))
    expect(projected.edges[2]).toBe(sky.edges[2])
    expect(sky).toEqual(before)
})

it('keeps five root pan rates after long drags and when reversing direction', () => {
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
    const panOffsets = [0, -10, -20, -30, -40]
    expect(projected.nodes.map((node) => node.x)).toEqual(
        fullSky.nodes.map((_, index) => panOffsets[index % panOffsets.length])
    )
    const far = projectConstellationStars(fullSky, { ...drag, drag: { x: 500, y: 0 } })
    const farther = projectConstellationStars(fullSky, { ...drag, drag: { x: 600, y: 0 } })
    for (const [index, node] of far.nodes.entries()) {
        const offset = panOffsets[index % panOffsets.length]!
        expect(farther.nodes[index]!.x - node.x).toBeCloseTo(offset)
    }
    const reversed = projectConstellationStars(fullSky, { ...drag, drag: { x: -100, y: 0 } })
    for (const [index, node] of reversed.nodes.entries()) {
        expect(node.x).toBeCloseTo(-panOffsets[index % panOffsets.length]!)
    }
    const reordered = projectConstellationStars(
        { ...fullSky, nodes: [...fullSky.nodes].reverse() },
        drag
    )
    expect(reordered.nodes).toEqual([...projected.nodes].reverse())
})

it('caps the zoom offset in screen pixels and adds pan independently', () => {
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

    const farZoom = {
        ...viewport,
        center: { x: -1500, y: -2000 },
        unitScale,
        zoomDelta: 1,
    }
    const capped = projectConstellationStars(authoredSky, farZoom)
    const projected = projectConstellationStars(authoredSky, {
        ...farZoom,
        drag: { x: -600, y: 800 },
    })
    const original = sky.nodes[1]!
    const root = capped.nodes[1]!
    expect(Math.hypot(root.x - original.x, root.y - original.y) / unitScale).toBeCloseTo(8)
    expect(projected.nodes[1]!.x - root.x).toBeCloseTo(300)
    expect(projected.nodes[1]!.y - root.y).toBeCloseTo(-400)
    expect(projected.nodes[2]).toEqual(capped.nodes[2])
})

it('keeps the depth of a star when it is learned', () => {
    const pan = { ...viewport, drag: { x: 250, y: 0 } }
    const learned = {
        ...sky,
        nodes: sky.nodes.map((node) => ({ ...node, unlocked: true })),
    }
    expect(projectConstellationStars(learned, pan).nodes[2]).toEqual({
        ...projectConstellationStars(sky, pan).nodes[2],
        unlocked: true,
    })
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
