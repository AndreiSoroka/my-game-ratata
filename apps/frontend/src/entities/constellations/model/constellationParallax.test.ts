import { constellationIds, type ConstellationSnapshot } from '@my-game-ratata/contracts'
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
    expect(projected.nodes[1]).toMatchObject({ x: 106.4, y: 155.2 })
    expect(projected.nodes[2]).toEqual(sky.nodes[2])
    const route = projected.edges[0]!
    expect(route.crossLink).toBe(true)
    expect(route.via![0]!.x).toBeCloseTo(29.28)
    expect(route.via![0]!.y).toBeCloseTo(39.04)
    expect(route.via![1]!.x).toBeCloseTo(108.128)
    expect(route.via![1]!.y).toBeCloseTo(37.504)
    const internalBend = projected.edges[1]!.via![0]!
    const endWeight = Math.hypot(40, 10) / (Math.hypot(40, 10) + Math.hypot(10, 10))
    expect(internalBend.x).toBeCloseTo(150 - 3.6 * (1 - endWeight))
    expect(internalBend.y).toBeCloseTo(170 - 4.8 * (1 - endWeight))
    expect(projected.edges[2]).toBe(sky.edges[2])
    expect(sky).toEqual(before)
})

it('keeps five global depths and caps long pans instead of stretching the sky', () => {
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
    const panOffsets = [0, -1.5, -3, -4.5, -6]
    expect(projected.nodes.map((node) => node.x)).toEqual(
        fullSky.nodes.map((_, index) => panOffsets[index % panOffsets.length])
    )
    const far = projectConstellationStars(fullSky, { ...drag, drag: { x: 500, y: 0 } })
    const farther = projectConstellationStars(fullSky, { ...drag, drag: { x: 600, y: 0 } })
    expect(new Set(far.nodes.map((node) => node.x)).size).toBe(5)
    expect(farther.nodes).toEqual(far.nodes)
    expect(Math.min(...far.nodes.map((node) => node.x))).toBe(-12)
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

it('zooms individual stars from their authored coordinates using the same fixed depths', () => {
    const branch = { ...sky.nodes[2]!, id: 'life.branch' }
    const secondRoot = { ...sky.nodes[1]!, id: 'life.secondary', x: 30, y: 50 }
    const authoredSky = { ...sky, nodes: [...sky.nodes, branch, secondRoot] }
    const zoomed = projectConstellationStars(authoredSky, { ...viewport, zoomDelta: 1 })
    expect(zoomed.nodes[0]).toEqual(sky.nodes[0])
    expect(zoomed.nodes[1]).toMatchObject({ x: 111.1, y: 161.6 })
    expect(zoomed.nodes[2]).toEqual(sky.nodes[2])
    expect(zoomed.nodes[3]).toMatchObject({ x: 160.8, y: 180.9 })
    expect(zoomed.nodes[4]).toMatchObject({ x: 30.3, y: 50.5 })
    expect(
        projectConstellationStars(
            { ...authoredSky, nodes: [...authoredSky.nodes].reverse() },
            {
                ...viewport,
                zoomDelta: 1,
            }
        ).nodes
    ).toEqual([...zoomed.nodes].reverse())
    expect(projectConstellationStars(authoredSky, { ...viewport, zoomDelta: -1 })).toEqual(
        authoredSky
    )
    expect(projectConstellationStars(authoredSky, { ...viewport, zoomDelta: 20 })).toEqual(zoomed)
})

it.each([0.25, 2.5, 30])(
    'bounds the combined pan and zoom to eight screen pixels at scale %s',
    (unitScale) => {
        const original = sky.nodes[1]!
        const farViewport = {
            ...viewport,
            unitScale,
            center: { x: original.x - 300_000, y: original.y - 400_000 },
            drag: { x: -300_000, y: -400_000 },
            zoomDelta: 20,
        }
        for (const [drag, zoomDelta, limit] of [
            [farViewport.drag, 0, 6],
            [{ x: 0, y: 0 }, farViewport.zoomDelta, 2],
            [farViewport.drag, farViewport.zoomDelta, 8],
        ] as const) {
            const projected = projectConstellationStars(sky, { ...farViewport, drag, zoomDelta })
            for (const [index, node] of projected.nodes.entries()) {
                const source = sky.nodes[index]!
                const distance = Math.hypot(node.x - source.x, node.y - source.y) / unitScale
                expect(distance).toBeLessThanOrEqual(limit + 0.000_001)
            }
            const root = projected.nodes[1]!
            expect(Math.hypot(root.x - original.x, root.y - original.y) / unitScale).toBeCloseTo(
                limit
            )
        }
    }
)

it('keeps the depth of a star when it is learned or level-gated', () => {
    const pan = { ...viewport, drag: { x: 250, y: 0 } }
    const unlearned = {
        ...sky,
        nodes: [{ ...sky.nodes[2]!, id: 'life.branch' }],
    }
    const projected = projectConstellationStars(unlearned, pan).nodes[0]!
    expect(projected.x).not.toBe(unlearned.nodes[0]!.x)
    const learned = {
        ...unlearned,
        nodes: unlearned.nodes.map((node) => ({ ...node, unlocked: true })),
    }
    const gated = {
        ...unlearned,
        nodes: unlearned.nodes.map((node) => ({ ...node, levelLocked: true as const })),
    }
    expect(projectConstellationStars(learned, pan).nodes[0]).toEqual({
        ...projected,
        unlocked: true,
    })
    expect(projectConstellationStars(gated, pan).nodes[0]).toEqual({
        ...projected,
        levelLocked: true,
    })
})

it('keeps child stars on the same five layers regardless of constellation membership', () => {
    const children = Array.from({ length: 5 }, (_, index) => ({
        ...sky.nodes[2]!,
        id: `life.child.${index}`,
        x: 0,
        y: 0,
    }))
    const authoredSky = { ...sky, nodes: children }
    const pan = { ...viewport, drag: { x: 100, y: 0 } }
    const projected = projectConstellationStars(authoredSky, pan)
    expect(projected.nodes.map((node) => node.x).sort((a, b) => a - b)).toEqual([
        -6, -4.5, -3, -1.5, 0,
    ])
    const movedToAnotherPath = {
        ...authoredSky,
        nodes: children.map((node) => ({ ...node, constellationId: 'arrow' as const })),
    }
    expect(
        projectConstellationStars(movedToAnotherPath, pan).nodes.map(({ x, y }) => ({ x, y }))
    ).toEqual(projected.nodes.map(({ x, y }) => ({ x, y })))
})

it('projects from the supplied camera coordinates without accumulating past projections', () => {
    const camera = { ...viewport, drag: { x: 70, y: -50 }, zoomDelta: 0.5 }
    const expected = projectConstellationStars(sky, camera)
    for (const unitScale of [0.4, 2, 20, 0.4, 2]) {
        projectConstellationStars(sky, {
            ...camera,
            unitScale,
            drag: { x: -10_000, y: 10_000 },
            zoomDelta: 1,
        })
    }
    expect(projectConstellationStars(sky, camera)).toEqual(expected)
    expect(projectConstellationStars(sky, viewport)).toBe(sky)
})
