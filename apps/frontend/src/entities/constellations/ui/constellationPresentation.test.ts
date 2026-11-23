import type { ConstellationSnapshot } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { observedPathBounds } from './constellationFocusRegion'
import { constellationLabels } from './constellationLabels'
import { constellationHitTargets } from './constellationNavigation'
import { constellationEdges, constellationVisibility } from './constellationPresentation'

const view = { x: -260, y: -200, width: 520, height: 400 }
const sky: ConstellationSnapshot = {
    version: 1,
    paths: [
        { id: 'prayer', unlocked: true, name: 'Угольная Мать', color: '#fa0' },
        { id: 'blade', unlocked: false, color: '#aaa' },
    ],
    nodes: [
        {
            id: 'root',
            constellationId: 'prayer',
            x: -140,
            y: 0,
            unlocked: true,
            parents: [],
            name: 'Молитва',
        },
        { id: 'child', constellationId: 'prayer', x: 70, y: 0, unlocked: true, parents: ['root'] },
        { id: 'foreign', constellationId: 'blade', x: 145, y: 40, unlocked: false, parents: [] },
    ],
    edges: [
        { from: 'root', to: 'child', via: [{ x: 10, y: -120 }] },
        { from: 'child', to: 'foreign', via: [{ x: 10000, y: 10000 }] },
    ],
}

it('uses the earned path name and omits closed labels even when their markers appear', () => {
    const labels = (showClosed: boolean) =>
        constellationLabels(sky, 'root', false, 1, view, (node) => showClosed || node.unlocked)

    expect(labels(false).map(({ text }) => text)).toEqual(['Угольная Мать'])
    expect(labels(true).map(({ text }) => text)).toEqual(['Угольная Мать'])
    expect(sky.nodes[0]?.name).toBe('Молитва')
})

it('opens up intermediate zoom targets with nearby markers and keeps their hit circles apart', () => {
    const root = sky.nodes[0]!
    const child = sky.nodes[1]!
    const nodes = [
        { ...root, x: 0 },
        { ...child, x: 36 },
        { ...child, id: 'far', x: 300 },
        { ...child, id: 'unlearned', x: 44, unlocked: false },
    ]
    const visible = () => true
    const overview = constellationHitTargets(nodes, 2, true, false, visible)
    expect([...overview]).toEqual([[root.id, 44]])

    const intermediate = constellationHitTargets(nodes, 2, false, false, visible)
    expect([...intermediate.keys()]).toEqual([root.id, child.id, 'far'])
    const rootRadius = intermediate.get(root.id)!
    const childRadius = intermediate.get(child.id)!
    expect(rootRadius + childRadius).toBeLessThan(36)
    expect(childRadius).toBeLessThan(8)
    expect(intermediate.get('far')).toBe(44)

    const tooDense = constellationHitTargets(nodes, 2.1, false, false, visible)
    expect(tooDense.has(child.id)).toBe(false)
    expect(tooDense.has(root.id)).toBe(true)
})

it('reveals roots first, then ordinary and level-gated stars, with their lines', () => {
    const root = sky.nodes[2]!
    const unknown = { ...sky.nodes[1]!, unlocked: false }
    const gated = { ...unknown, id: 'gated', levelLocked: true as const }
    const nodes = [root, unknown, gated]
    const visibilityAt = (zoom: number) => nodes.map(constellationVisibility(zoom))

    expect(visibilityAt(1)).toEqual([0, 0, 0])
    const [rootAtFirstZoom, unknownAtFirstZoom, gatedAtFirstZoom] = visibilityAt(1.1)
    expect(rootAtFirstZoom).toBeGreaterThan(0)
    expect(unknownAtFirstZoom).toBe(0)
    expect(gatedAtFirstZoom).toBe(0)
    expect(visibilityAt(2.5)[0]).toBe(1)
    expect(visibilityAt(2.5)[1]).toBeGreaterThan(0)
    expect(visibilityAt(2.5)[2]).toBe(0)
    expect(visibilityAt(4)[1]).toBe(1)
    expect(visibilityAt(4)[2]).toBeGreaterThan(0)
    expect(visibilityAt(6)).toEqual([1, 1, 1])

    const routes = { ...sky, nodes, edges: [{ from: root.id, to: gated.id }] }
    const colors = new Map(sky.paths.map((path) => [path.id, path.color]))
    expect(constellationEdges(routes, colors, constellationVisibility(2.5))[0]?.opacity).toBe(0)
    expect(constellationEdges(routes, colors, constellationVisibility(4))[0]?.opacity).toBeCloseTo(
        0.2 * visibilityAt(4)[2]!
    )
})

it('fits received nodes and local bends without widening the view for foreign corridors', () => {
    expect(observedPathBounds(sky, 'prayer')).toEqual({ x: -140, y: -120, width: 210, height: 120 })
})
