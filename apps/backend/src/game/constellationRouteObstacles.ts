import type { ConstellationRegion } from '@my-game-ratata/contracts'

import {
    segmentDistanceSquared,
    type SkyEdge,
    type SkyPoint,
} from './constellationGeometry'

export interface ConstellationRegionObstacle {
    ids: readonly string[]
    bounds: ConstellationRegion
}
export type ConstellationRouteObstacle =
    | { id: string; kind: 'star'; point: SkyPoint }
    | { id: string; kind: 'region'; bounds: ConstellationRegion }

export const CONSTELLATION_ROUTE_REGION_MARGIN = 200
const starClearance = 40
const starCornerOffset = 52
const epsilon = 1e-7

/** Regions containing either endpoint must remain traversable; every other star stays protected. */
export function constellationRouteObstacles(
    positions: Readonly<Record<string, SkyPoint>>,
    edge: SkyEdge,
    regions: readonly ConstellationRegionObstacle[] = []
): ConstellationRouteObstacle[] {
    const stars: ConstellationRouteObstacle[] = Object.entries(positions)
        .filter(([id]) => id !== edge.from && id !== edge.to)
        .map(([id, point]) => {
            requireFinitePoint(point)
            return { id: `star:${id}`, kind: 'star', point }
        })
    const areas: ConstellationRouteObstacle[] = regions
        .filter(({ ids }) => !ids.includes(edge.from) && !ids.includes(edge.to))
        .map(({ ids, bounds }) => {
            const expanded = expandRegion(bounds)
            return {
                id: `region:${[...ids].sort().join('|')}:${JSON.stringify(expanded)}`,
                kind: 'region',
                bounds: expanded,
            }
        })
    return [
        ...new Map(
            [...stars, ...areas].map((obstacle) => [obstacle.id, obstacle])
        ).values(),
    ].sort((a, b) => a.id.localeCompare(b.id))
}

export function requireFinitePoint(point: SkyPoint): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new Error('Non-finite constellation route point')
    }
}

function expandRegion(bounds: ConstellationRegion): ConstellationRegion {
    const margin = CONSTELLATION_ROUTE_REGION_MARGIN
    const expanded = {
        x: bounds.x - margin,
        y: bounds.y - margin,
        width: bounds.width + margin * 2,
        height: bounds.height + margin * 2,
    }
    if (
        bounds.width <= 0 ||
        bounds.height <= 0 ||
        !Object.values(expanded).every(Number.isFinite) ||
        !Number.isFinite(expanded.x + expanded.width) ||
        !Number.isFinite(expanded.y + expanded.height)
    ) {
        throw new Error('Invalid constellation route region')
    }
    return expanded
}

export function obstacleCorners(
    obstacle: ConstellationRouteObstacle
): SkyPoint[] {
    const bounds =
        obstacle.kind === 'region'
            ? obstacle.bounds
            : {
                  x: obstacle.point.x - starCornerOffset,
                  y: obstacle.point.y - starCornerOffset,
                  width: starCornerOffset * 2,
                  height: starCornerOffset * 2,
              }
    return [bounds.x, bounds.x + bounds.width].flatMap((x) =>
        [bounds.y, bounds.y + bounds.height].map((y) => ({ x, y }))
    )
}

export function pointObstructed(
    point: SkyPoint,
    obstacle: ConstellationRouteObstacle
): boolean {
    if (obstacle.kind === 'star') {
        return (
            Math.hypot(point.x - obstacle.point.x, point.y - obstacle.point.y) <
            starClearance - epsilon
        )
    }
    const bounds = obstacle.bounds
    return (
        point.x > bounds.x + epsilon &&
        point.x < bounds.x + bounds.width - epsilon &&
        point.y > bounds.y + epsilon &&
        point.y < bounds.y + bounds.height - epsilon
    )
}

export function segmentObstructed(
    from: SkyPoint,
    to: SkyPoint,
    obstacle: ConstellationRouteObstacle
): boolean {
    return obstacle.kind === 'star'
        ? segmentDistanceSquared(obstacle.point, from, to) <
              starClearance * starClearance - epsilon
        : segmentCrossesRegion(from, to, obstacle.bounds)
}

/** Crossing the open interior is forbidden; visibility edges may touch its expanded boundary. */
function segmentCrossesRegion(
    from: SkyPoint,
    to: SkyPoint,
    bounds: ConstellationRegion
): boolean {
    let first = 0,
        last = 1
    const axes = [
        [from.x, to.x - from.x, bounds.x, bounds.x + bounds.width],
        [from.y, to.y - from.y, bounds.y, bounds.y + bounds.height],
    ] as const
    for (const [origin, delta, minimum, maximum] of axes) {
        if (Math.abs(delta) <= epsilon) {
            if (origin <= minimum + epsilon || origin >= maximum - epsilon) {
                return false
            }
            continue
        }
        const near = (minimum - origin) / delta,
            far = (maximum - origin) / delta
        first = Math.max(first, Math.min(near, far))
        last = Math.min(last, Math.max(near, far))
        if (first >= last - epsilon) {
            return false
        }
    }
    return last > epsilon && first < 1 - epsilon
}
