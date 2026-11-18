import type { ConstellationRegion } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import {
    type ConstellationRegionObstacle,
    routeConstellationCrossLinks,
} from '../src/game/constellationEdgeRouting'
import {
    constellationGeometryProblem,
    segmentDistanceSquared,
    segmentsConflict,
    type SkyEdge,
    type SkyPoint,
} from '../src/game/constellationGeometry'
import { constellationRouteObstacles } from '../src/game/constellationRouteObstacles'
import { shortestConstellationPath } from '../src/game/constellationRouteVisibility'

const edge = { from: 'first', to: 'last', crossLink: true } as const
const endpoints = { first: { x: -1300, y: 0 }, last: { x: 1300, y: 0 } }
function region(
    id: string,
    bounds: ConstellationRegion
): ConstellationRegionObstacle {
    return { ids: [id], bounds }
}
function path(
    positions: Readonly<Record<string, SkyPoint>>,
    regions: readonly ConstellationRegionObstacle[] = []
): SkyPoint[] {
    const via = routeConstellationCrossLinks(positions, [edge], regions)[
        'first>last'
    ]
    if (via === undefined) {
        throw new Error('Missing routed prerequisite')
    }
    return [
        requiredPoint(positions['first']),
        ...via,
        requiredPoint(positions['last']),
    ]
}

describe('global constellation prerequisite corridors', () => {
    it('avoids an entire unrelated constellation even when no foreign star lies on the straight line', () => {
        const foreign = region('unrelated', {
            x: -250,
            y: -200,
            width: 500,
            height: 400,
        })
        expect(path(endpoints)).toEqual([endpoints.first, endpoints.last])
        const routed = path(endpoints, [foreign])
        expect(routed.length).toBeGreaterThan(2)
        outsideRegion(routed, foreign.bounds, 160)
        expect(
            routed.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))
        ).toBe(true)
    })

    it('exits each endpoint region while respecting foreign bodies and stars in its own region', () => {
        const positions = { ...endpoints, other: { x: -1000, y: 0 } }
        const source = {
            ids: ['first', 'other'],
            bounds: { x: -1500, y: -300, width: 800, height: 600 },
        }
        const destination = {
            ids: ['last'],
            bounds: { x: 1100, y: -200, width: 400, height: 400 },
        }
        const foreign = region('middle', {
            x: -100,
            y: -100,
            width: 200,
            height: 200,
        })
        const routed = path(positions, [source, destination, foreign])
        outsideRegion(routed, foreign.bounds, 160)
        clearOfStars(routed, positions, edge)
        const via = routed.slice(1, -1)
        expect(
            constellationGeometryProblem(positions, [{ ...edge, via }])
        ).toBeUndefined()
    })

    it('still protects other stars when both endpoints belong to the same region', () => {
        const positions = { ...endpoints, other: { x: 0, y: 0 } }
        const own = {
            ids: ['first', 'last', 'other'],
            bounds: { x: -1500, y: -500, width: 3000, height: 1000 },
        }
        const routed = path(positions, [own])
        expect(routed.length).toBeGreaterThan(2)
        clearOfStars(routed, positions, edge)
        expect(
            Math.max(...routed.map((point) => Math.abs(point.y)))
        ).toBeLessThan(200)
    })

    it('finds a finite corridor around overlapping regions and blockers on their boundary', () => {
        const regions = [
            region('left', { x: -500, y: -80, width: 300, height: 240 }),
            region('middle', { x: -100, y: -380, width: 300, height: 240 }),
            region('right', { x: 300, y: -80, width: 300, height: 240 }),
        ]
        const positions = {
            ...endpoints,
            lower: { x: 0, y: 360 },
            upper: { x: 0, y: -580 },
        }
        const routed = path(positions, regions)
        regions.forEach((obstacle) =>
            outsideRegion(routed, obstacle.bounds, 160)
        )
        clearOfStars(routed, positions, edge)
        expect(
            constellationGeometryProblem(positions, [
                { ...edge, via: routed.slice(1, -1) },
            ])
        ).toBeUndefined()
    })

    it('expands an enclosing obstacle even when every corner of the first blocker is hidden inside it', () => {
        const inner = region('a-inner', {
            x: -100,
            y: -100,
            width: 200,
            height: 200,
        })
        const outer = region('z-outer', {
            x: -300,
            y: -300,
            width: 600,
            height: 600,
        })
        const routed = path(endpoints, [inner, outer])
        outsideRegion(routed, outer.bounds, 160)
        expect(routed.length).toBeGreaterThan(2)
    })
})

describe('routing replay and validation', () => {
    it('replays the same route without depending on metadata or position insertion order', () => {
        const regions = [
            region('lower', { x: -300, y: -150, width: 300, height: 300 }),
            region('upper', { x: 100, y: -350, width: 300, height: 300 }),
        ]
        const positions = { ...endpoints, other: { x: 400, y: 400 } }
        const before = JSON.stringify({ positions, regions })
        const first = path(positions, regions)
        expect(path(positions, regions)).toEqual(first)
        expect(
            path(
                Object.fromEntries(Object.entries(positions).reverse()),
                [...regions].reverse()
            )
        ).toEqual(first)
        expect(JSON.stringify({ positions, regions })).toBe(before)
    })

    it('reports invalid endpoints, non-finite geometry and a genuinely enclosed endpoint', () => {
        expect(() => path({ first: endpoints.first })).toThrow(
            'Unknown cross-link endpoint'
        )
        expect(() =>
            path({ ...endpoints, last: { x: Infinity, y: 0 } })
        ).toThrow('Non-finite constellation route point')
        expect(() =>
            path(endpoints, [
                region('invalid', { x: 0, y: 0, width: -1, height: 1 }),
            ])
        ).toThrow('Invalid constellation route region')
        expect(() =>
            path(endpoints, [
                region('blocking', {
                    x: -1400,
                    y: -100,
                    width: 200,
                    height: 200,
                }),
            ])
        ).toThrow('Cannot route constellation prerequisite first>last')
    })
})

it('lets local routing prefer a visible corridor by an explicit nonnegative cost', () => {
    const positions = {
        first: { x: 0, y: 0 },
        last: { x: 200, y: 0 },
        other: { x: 100, y: 0 },
    }
    const points = [
        positions.first,
        positions.last,
        { x: 100, y: -100 },
        { x: 100, y: 100 },
    ]
    const obstacles = constellationRouteObstacles(positions, edge)
    const base = shortestConstellationPath(points, obstacles)
    expect(base.path?.[1]).toEqual(points[2])
    const preferred = shortestConstellationPath(
        points,
        obstacles,
        (from, to) =>
            Math.hypot(to.x - from.x, to.y - from.y) +
            (from.y < 0 || to.y < 0 ? 1000 : 0)
    )
    expect(preferred.path).toEqual([points[0], points[3], points[1]])
    expect(() =>
        shortestConstellationPath(points, obstacles, () => -1)
    ).toThrow('Invalid constellation route cost')
})

/** Independent boundary-intersection check, deliberately separate from production rectangle clipping. */
function outsideRegion(
    points: SkyPoint[],
    bounds: ConstellationRegion,
    gap: number
): void {
    const left = bounds.x - gap,
        right = bounds.x + bounds.width + gap
    const top = bounds.y - gap,
        bottom = bounds.y + bounds.height + gap
    const corners = [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
    ]
    for (const point of points) {
        expect(
            point.x > left &&
                point.x < right &&
                point.y > top &&
                point.y < bottom
        ).toBe(false)
    }
    for (let index = 1; index < points.length; index++) {
        for (let side = 0; side < corners.length; side++) {
            expect(
                segmentsConflict(
                    requiredPoint(points[index - 1]),
                    requiredPoint(points[index]),
                    requiredPoint(corners[side]),
                    requiredPoint(corners[(side + 1) % 4])
                )
            ).toBe(false)
        }
    }
}

function clearOfStars(
    points: SkyPoint[],
    positions: Readonly<Record<string, SkyPoint>>,
    link: SkyEdge
): void {
    for (const [id, point] of Object.entries(positions)) {
        if (id === link.from || id === link.to) {
            continue
        }
        for (let index = 1; index < points.length; index++) {
            expect(
                segmentDistanceSquared(
                    point,
                    requiredPoint(points[index - 1]),
                    requiredPoint(points[index])
                )
            ).toBeGreaterThanOrEqual(36 * 36)
        }
    }
}

function requiredPoint(point: SkyPoint | undefined): SkyPoint {
    if (point === undefined) {
        throw new Error('Missing test route point')
    }
    return point
}
