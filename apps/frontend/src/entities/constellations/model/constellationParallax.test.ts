import { constellationIds, type ConstellationSnapshot } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { projectConstellationStars } from './constellationParallax'

const [startId, rootId, childId] = ['blade.root', 'life.root', 'life.child'] as const
const viewport = { center: { x: 0, y: 0 }, zoom: 4 }
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
const rootSky: ConstellationSnapshot = {
    ...sky,
    nodes: constellationIds.map((id) => ({
        ...sky.nodes[0]!,
        id,
        constellationId: id,
        x: 400,
        y: 200,
    })),
    edges: [],
}

it('retains authored geometry at overview regardless of the camera position', () => {
    for (const zoom of [0, 0.5, 1]) {
        expect(projectConstellationStars(sky, { ...viewport, zoom })).toBe(sky)
        expect(projectConstellationStars(sky, { center: { x: 1000, y: -2000 }, zoom })).toBe(sky)
    }
})

it('projects routed bends at their authored path depth without mutating the sky', () => {
    const before = structuredClone(sky)
    const projected = projectConstellationStars(sky, {
        center: { x: -120, y: -160 },
        zoom: 2,
    })

    expect(projected.nodes[0]).toEqual(sky.nodes[0])
    expect(projected.nodes[1]!.x).toBeCloseTo(84.444444)
    expect(projected.nodes[1]!.y).toBeCloseTo(124.444444)
    expect(projected.nodes[2]).toEqual(sky.nodes[2])
    const route = projected.edges[0]!
    expect(route.crossLink).toBe(true)
    const firstScale = 1 / 1.025
    const secondScale = 1 / 1.065
    expect(route.via![0]!.x).toBeCloseTo(-120 + 150 * firstScale)
    expect(route.via![0]!.y).toBeCloseTo(-160 + 200 * firstScale)
    expect(route.via![1]!.x).toBeCloseTo(-120 + 230 * secondScale)
    expect(route.via![1]!.y).toBeCloseTo(-160 + 200 * secondScale)
    const progress = Math.hypot(40, 10) / (Math.hypot(40, 10) + Math.hypot(10, 10))
    const internalScale = 1 / (1 + (1 - progress) * 0.125)
    expect(projected.edges[1]!.via![0]!.x).toBeCloseTo(-120 + 270 * internalScale)
    expect(projected.edges[1]!.via![0]!.y).toBeCloseTo(-160 + 330 * internalScale)
    expect(projected.edges[2]).toBe(sky.edges[2])
    expect(sky).toEqual(before)
})

it('uses one affine transform for every star and bend on the same plane', () => {
    const nodes = [
        sky.nodes[1]!,
        { ...sky.nodes[1]!, id: 'life.secondary', x: -300, y: -200 },
        { ...sky.nodes[2]!, id: 'life.child.1', x: 350, y: 250 },
    ]
    const authoredSky = {
        ...sky,
        nodes,
        edges: [{ from: rootId, to: 'life.child.1', via: [{ x: 0, y: 20 }] }],
    }
    const center = { x: -100, y: 150 }
    const projected = projectConstellationStars(authoredSky, { ...viewport, center })
    for (const [index, node] of projected.nodes.entries()) {
        expect(node.x).toBeCloseTo(center.x + ((nodes[index]!.x - center.x) * 16) / 19)
        expect(node.y).toBeCloseTo(center.y + ((nodes[index]!.y - center.y) * 16) / 19)
    }
    expect(projected.nodes[1]!.x - projected.nodes[0]!.x).toBeCloseTo(
        ((nodes[1]!.x - nodes[0]!.x) * 16) / 19
    )
    expect(projected.nodes[1]!.y - projected.nodes[0]!.y).toBeCloseTo(
        ((nodes[1]!.y - nodes[0]!.y) * 16) / 19
    )
    expect(projected.edges[0]!.via![0]!.x).toBeCloseTo(-100 + (100 * 16) / 19)
    expect(projected.edges[0]!.via![0]!.y).toBeCloseTo(150 - (130 * 16) / 19)
})

it('keeps exactly five global planes when the stars are reordered', () => {
    const projected = projectConstellationStars(rootSky, viewport)
    expect(new Set(projected.nodes.map((node) => node.x)).size).toBe(5)
    expect(projected.nodes[0]).toEqual(rootSky.nodes[0])
    expect(projected.nodes[4]!.x).toBeCloseTo((400 * 16) / 19)
    for (const [index, node] of projected.nodes.entries()) {
        expect(node.x).toBe(projected.nodes[index % 5]!.x)
    }
    expect(
        projectConstellationStars({ ...rootSky, nodes: [...rootSky.nodes].reverse() }, viewport)
            .nodes
    ).toEqual([...projected.nodes].reverse())
})

it('responds equally to equal camera steps across the full map without waves', () => {
    const positions = [
        { x: -400, y: -300 },
        { x: -200, y: -150 },
        { x: 0, y: 0 },
        { x: 200, y: 150 },
        { x: 400, y: 300 },
    ]
    const projections = positions.map((center) =>
        projectConstellationStars(sky, { ...viewport, center })
    )
    for (let index = 1; index < projections.length; index++) {
        const previous = projections[index - 1]!.nodes[1]!
        const current = projections[index]!.nodes[1]!
        expect(current.x - previous.x).toBeCloseTo((200 * 3) / 19)
        expect(current.y - previous.y).toBeCloseTo((150 * 3) / 19)
    }
})

it.each([0, 1_000_000])(
    'increases the response to the same hundred CSS pixel drag at map offset %s',
    (offset) => {
        const baseScale = 8
        for (const [zoom, expectedDeepest, expectedArrow] of [
            [1, 0, 0],
            [2, 11.111111, 8.571429],
            [4, 15.789474, 12.328767],
            [8, 17.948718, 14.09396],
            [32, 19.496855, 15.371901],
            [205, 19.921875, 15.724563],
        ] as const) {
            const unitScale = baseScale / zoom
            const center = { x: offset + 100, y: offset - 200 }
            const before = projectConstellationStars(rootSky, { center, zoom })
            const after = projectConstellationStars(rootSky, {
                center: { x: center.x - 100 * unitScale, y: center.y },
                zoom,
            })
            const deepestResponse = (after.nodes[4]!.x - before.nodes[4]!.x) / unitScale
            const arrowResponse = (after.nodes[3]!.x - before.nodes[3]!.x) / unitScale
            expect(deepestResponse).toBeCloseTo(-expectedDeepest, 4)
            expect(arrowResponse).toBeCloseTo(-expectedArrow, 4)
        }
    }
)

it.each([2, 8, 205, 1_000_000])(
    'contracts the planes without reversing or collapsing them at zoom %s',
    (zoom) => {
        const center = { x: -1_000_000, y: 2_000_000 }
        const projected = projectConstellationStars(rootSky, { center, zoom })
        for (const [index, node] of projected.nodes.entries()) {
            const source = rootSky.nodes[index]!
            const originalX = source.x - center.x
            const originalY = source.y - center.y
            const currentX = node.x - center.x
            const currentY = node.y - center.y
            const scaleX = currentX / originalX
            const scaleY = currentY / originalY
            expect(scaleX).toBeGreaterThanOrEqual(0.8)
            expect(scaleX).toBeLessThanOrEqual(1)
            expect(scaleY).toBeCloseTo(scaleX)
            const displacement = Math.hypot(node.x - source.x, node.y - source.y)
            expect(displacement).toBeLessThanOrEqual(Math.hypot(currentX, currentY) * 0.25)
        }
    }
)

it('keeps the plane of a star when it is learned or level-gated', () => {
    const unlearned = {
        ...sky,
        nodes: [{ ...sky.nodes[2]!, id: 'life.branch' }],
    }
    const projected = projectConstellationStars(unlearned, viewport).nodes[0]!
    expect(projected.x).not.toBe(unlearned.nodes[0]!.x)
    const learned = {
        ...unlearned,
        nodes: unlearned.nodes.map((node) => ({ ...node, unlocked: true })),
    }
    const gated = {
        ...unlearned,
        nodes: unlearned.nodes.map((node) => ({ ...node, levelLocked: true as const })),
    }
    expect(projectConstellationStars(learned, viewport).nodes[0]).toEqual({
        ...projected,
        unlocked: true,
    })
    expect(projectConstellationStars(gated, viewport).nodes[0]).toEqual({
        ...projected,
        levelLocked: true,
    })
})

it('keeps child stars on the same five planes regardless of constellation membership', () => {
    const children = Array.from({ length: 5 }, (_, index) => ({
        ...sky.nodes[2]!,
        id: `life.child.${index}`,
        x: 400,
        y: 200,
    }))
    const authoredSky = { ...sky, nodes: children }
    const projected = projectConstellationStars(authoredSky, viewport)
    expect(new Set(projected.nodes.map((node) => node.x)).size).toBe(5)
    const movedToAnotherPath = {
        ...authoredSky,
        nodes: children.map((node) => ({ ...node, constellationId: 'arrow' as const })),
    }
    expect(
        projectConstellationStars(movedToAnotherPath, viewport).nodes.map(({ x, y }) => ({ x, y }))
    ).toEqual(projected.nodes.map(({ x, y }) => ({ x, y })))
})

it('reproduces a camera view after other visits and restores authored geometry on zoom out', () => {
    const camera = { center: { x: 70, y: -50 }, zoom: 8 }
    const expected = projectConstellationStars(sky, camera)
    for (const zoom of [1, 2, 205, 4, 8]) {
        projectConstellationStars(sky, { center: { x: -400, y: 300 }, zoom })
    }
    expect(projectConstellationStars(sky, camera)).toEqual(expected)
    expect(projectConstellationStars(sky, { center: camera.center, zoom: 1 })).toBe(sky)
})
