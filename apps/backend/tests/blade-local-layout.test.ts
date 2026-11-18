import { describe, expect, it } from 'vitest'

import { bladeLocalTemplatePositions } from '../src/game/constellationBladeTemplate'
import { constellationTopologyEdges } from '../src/game/constellationEdgeRouting'
import {
    constellationGeometryProblem,
    segmentsConflict,
    type SkyEdge,
    type SkyPoint,
} from '../src/game/constellationGeometry'
import {
    insideLocalRoute,
    localRouteBounds,
} from '../src/game/constellationLocalCorridors'
import { routeLocalConstellationLinks } from '../src/game/constellationLocalRoutes'
import { fullConstellationCatalog } from '../src/game/constellationNodes'
import { constellationTemplatePositions } from '../src/game/constellationTemplates'

const bladeNodes = fullConstellationCatalog.filter(
    (node) => node.constellationId === 'blade'
)
const bladeIds = bladeNodes.map((node) => node.id)
const bladeEdges = constellationTopologyEdges(bladeNodes).filter((edge) =>
    bladeIds.includes(edge.from)
)

describe('readable Blade local families', () => {
    it('keeps all 42 stars and gives them comparable area to the 42-star Mother', () => {
        expect(Object.keys(bladeLocalTemplatePositions).sort()).toEqual(
            [...bladeIds].sort()
        )
        expect(bladeIds).toHaveLength(42)
        expect(bladeLocalTemplatePositions['blade.root']).toEqual({
            x: 0,
            y: 0,
        })
        const mother = Object.entries(constellationTemplatePositions).filter(
            ([id]) => id.startsWith('prayer.')
        )
        expect(mother).toHaveLength(42)
        const ratio =
            area(Object.values(bladeLocalTemplatePositions)) /
            area(mother.map(([, point]) => point))
        expect(ratio).toBeGreaterThan(0.8)
        expect(ratio).toBeLessThan(1.2)
    })

    it('keeps primary families planar and prevents nearby stars from collapsing together', () => {
        expect(
            constellationGeometryProblem(
                bladeLocalTemplatePositions,
                bladeEdges.filter((edge) => edge.crossLink !== true)
            )
        ).toBeUndefined()
        const points = Object.values(bladeLocalTemplatePositions)
        const minimum = Math.min(
            ...points.flatMap((point, index) =>
                points
                    .slice(index + 1)
                    .map((other) =>
                        Math.hypot(point.x - other.x, point.y - other.y)
                    )
            )
        )
        expect(minimum).toBeGreaterThan(350)
    })

    it.each([
        ['wide_swing', 'wide_arc', 'wide_flow'],
        ['circular_swing', 'circle_ring', 'circle_axis'],
        ['lunge', 'long_lunge', 'lunge_recovery'],
        ['pommel_strike', 'pommel_stun', 'pommel_break'],
        ['defensive_stance', 'guard_strong', 'arrow_deflect'],
    ])(
        'keeps the %s technique and its upgrades in one outward chain',
        (first, second, third) => {
            const points = [first, second, third].map((id) =>
                required(bladeLocalTemplatePositions, `blade.${id}`)
            )
            for (let index = 1; index < points.length; index++) {
                const before = present(points[index - 1]),
                    point = present(points[index])
                expect(
                    Math.hypot(point.x - before.x, point.y - before.y)
                ).toBeLessThan(1000)
                expect(Math.hypot(point.x, point.y)).toBeGreaterThan(
                    Math.hypot(before.x, before.y)
                )
            }
        }
    )
})

describe('bounded mandatory local links', () => {
    it('routes every local AND link, preserves primary edges and reduces crossings', () => {
        const before = JSON.stringify({
            positions: bladeLocalTemplatePositions,
            edges: bladeEdges,
        })
        const routes = routeLocalConstellationLinks(
            bladeLocalTemplatePositions,
            bladeEdges,
            [bladeIds]
        )
        expect(Object.keys(routes).sort()).toEqual(
            bladeEdges
                .filter((edge) => edge.crossLink === true)
                .map((edge) => `${edge.from}>${edge.to}`)
                .sort()
        )
        const routed = withRoutes(bladeEdges, routes)
        expect(
            constellationGeometryProblem(bladeLocalTemplatePositions, routed)
        ).toBeUndefined()
        expect(
            crossings(bladeLocalTemplatePositions, routed)
        ).toBeLessThanOrEqual(8)
        expect(crossings(bladeLocalTemplatePositions, routed)).toBeLessThan(
            crossings(bladeLocalTemplatePositions, bladeEdges)
        )
        const bounds = localRouteBounds(
            Object.values(bladeLocalTemplatePositions)
        )
        expect(
            Object.values(routes)
                .flat()
                .every((point) => insideLocalRoute(point, bounds))
        ).toBe(true)
        expect(
            JSON.stringify({
                positions: bladeLocalTemplatePositions,
                edges: bladeEdges,
            })
        ).toBe(before)
        expect(
            routeLocalConstellationLinks(
                bladeLocalTemplatePositions,
                bladeEdges,
                [bladeIds]
            )
        ).toEqual(routes)
    })

    it('does not reroute cross-school prerequisites as local lines', () => {
        const positions = {
            ...bladeLocalTemplatePositions,
            'life.energy2': { x: -10_000, y: 0 },
        }
        const edges = constellationTopologyEdges(bladeNodes)
        const routes = routeLocalConstellationLinks(positions, edges, [
            bladeIds,
            ['life.energy2'],
        ])
        expect(routes).not.toHaveProperty('life.energy2>blade.long_frontier')
        expect(routes).not.toHaveProperty('life.hp2>blade.steel_sinew')
    })

    it('uses the same rule for an arbitrary field and avoids both branches and foreign stars', () => {
        const positions = {
            'field.root': { x: 0, y: 0 },
            a: { x: -200, y: -200 },
            b: { x: 200, y: -200 },
            c: { x: -200, y: 200 },
            d: { x: 200, y: 200 },
            foreign: { x: 0, y: -300 },
        }
        const ids = ['field.root', 'a', 'b', 'c', 'd']
        const edges: SkyEdge[] = [
            ...ids.slice(1).map((to) => ({ from: 'field.root', to })),
            { from: 'a', to: 'd', crossLink: true },
        ]
        const routes = routeLocalConstellationLinks(positions, edges, [ids])
        const routed = withRoutes(edges, routes)
        expect(routes['a>d']?.length).toBeGreaterThan(0)
        expect(constellationGeometryProblem(positions, routed)).toBeUndefined()
        expect(crossings(positions, routed)).toBe(0)
    })
})

function area(points: readonly SkyPoint[]): number {
    return (
        (Math.max(...points.map((point) => point.x)) -
            Math.min(...points.map((point) => point.x))) *
        (Math.max(...points.map((point) => point.y)) -
            Math.min(...points.map((point) => point.y)))
    )
}
function required(
    positions: Readonly<Record<string, SkyPoint>>,
    id: string
): SkyPoint {
    const point = positions[id]
    if (point === undefined) {
        throw new Error(`Missing point ${id}`)
    }
    return point
}
function withRoutes(
    edges: readonly SkyEdge[],
    routes: Readonly<Record<string, SkyPoint[]>>
): SkyEdge[] {
    return edges.map((edge) => ({
        ...edge,
        via: routes[`${edge.from}>${edge.to}`] ?? [],
    }))
}
function crossings(
    positions: Readonly<Record<string, SkyPoint>>,
    edges: readonly SkyEdge[]
): number {
    let count = 0
    for (let index = 0; index < edges.length; index++) {
        const first = present(edges[index])
        const a = [
            required(positions, first.from),
            ...(first.via ?? []),
            required(positions, first.to),
        ]
        for (const second of edges.slice(index + 1)) {
            const b = [
                required(positions, second.from),
                ...(second.via ?? []),
                required(positions, second.to),
            ]
            const shared = [first.from, first.to]
                .filter((id) => id === second.from || id === second.to)
                .map((id) => required(positions, id))
            for (let x = 1; x < a.length; x++) {
                for (let y = 1; y < b.length; y++) {
                    if (
                        segmentsConflict(
                            present(a[x - 1]),
                            present(a[x]),
                            present(b[y - 1]),
                            present(b[y]),
                            shared
                        )
                    ) {
                        count++
                    }
                }
            }
        }
    }
    return count
}

function present<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error('Missing local geometry fixture value')
    }
    return value
}
