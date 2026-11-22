import { constellationIds, type ConstellationSnapshot } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { projectConstellationBranches } from './constellationParallax'

const farthestBranch = constellationIds.at(-1)!
const sky: ConstellationSnapshot = {
    version: 1,
    paths: [],
    nodes: [
        { id: 'start', constellationId: 'blade', x: 0, y: 0, unlocked: true, parents: [] },
        {
            id: 'root',
            constellationId: farthestBranch,
            x: 110,
            y: 160,
            unlocked: true,
            parents: [],
        },
        {
            id: 'child',
            constellationId: farthestBranch,
            x: 160,
            y: 180,
            unlocked: false,
            parents: ['root', 'start'],
        },
    ],
    edges: [
        {
            from: 'start',
            to: 'root',
            via: [
                { x: 30, y: 40 },
                { x: 110, y: 40 },
            ],
            crossLink: true,
        },
        { from: 'root', to: 'child', via: [{ x: 150, y: 170 }] },
        { from: 'missing', to: 'child', via: [{ x: 150, y: 170 }] },
    ],
}

it('retains the authored geometry at rest', () => {
    expect(projectConstellationBranches(sky, { x: 0, y: 0 }, 2)).toBe(sky)
})

it('moves branches at different rates and interpolates cross-branch bends by route distance', () => {
    const before = structuredClone(sky)
    const projected = projectConstellationBranches(sky, { x: 100, y: 0 }, 2)

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

it('limits diagonal drift to eight screen pixels at any scale', () => {
    const scale = 2.5
    const projected = projectConstellationBranches(sky, { x: -600, y: 800 }, scale)
    const original = sky.nodes[1]!
    const root = projected.nodes[1]!
    expect(root.x - original.x).toBeCloseTo(12)
    expect(root.y - original.y).toBeCloseTo(-16)
    expect(Math.hypot(root.x - original.x, root.y - original.y) / scale).toBeCloseTo(8)
})
