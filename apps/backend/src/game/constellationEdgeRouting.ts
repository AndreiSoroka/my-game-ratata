import type { SkyEdge, SkyPoint } from './constellationGeometry'
import type { ConstellationTopologyNode } from './constellationLayoutTypes'
import {
    type ConstellationRegionObstacle,
    constellationRouteObstacles,
    obstacleCorners,
    pointObstructed,
    requireFinitePoint,
} from './constellationRouteObstacles'
import { shortestConstellationPath } from './constellationRouteVisibility'

export type { ConstellationRegionObstacle } from './constellationRouteObstacles'

export function constellationTopologyEdges(
    nodes: readonly ConstellationTopologyNode[]
): SkyEdge[] {
    return nodes.flatMap((node) =>
        node.parents.map((from, index) => ({
            from,
            to: node.id,
            ...(index === 0 ? {} : { crossLink: true }),
        }))
    )
}

/** Extra prerequisites avoid foreign stars and, when supplied, entire unrelated regions. */
export function routeConstellationCrossLinks(
    positions: Readonly<Record<string, SkyPoint>>,
    edges: readonly SkyEdge[],
    regions: readonly ConstellationRegionObstacle[] = []
): Record<string, SkyPoint[]> {
    return Object.fromEntries(
        edges
            .filter((edge) => edge.crossLink === true)
            .map((edge) => [
                `${edge.from}>${edge.to}`,
                route(positions, edge, regions),
            ])
    )
}

function route(
    positions: Readonly<Record<string, SkyPoint>>,
    edge: SkyEdge,
    regions: readonly ConstellationRegionObstacle[]
): SkyPoint[] {
    const start = positions[edge.from],
        end = positions[edge.to]
    if (start === undefined || end === undefined) {
        throw new Error('Unknown cross-link endpoint')
    }
    requireFinitePoint(start)
    requireFinitePoint(end)
    const obstacles = constellationRouteObstacles(positions, edge, regions)
    const points: SkyPoint[] = [start, end]
    const expanded = new Set<string>()
    for (let attempt = 0; attempt <= obstacles.length; attempt++) {
        const result = shortestConstellationPath(points, obstacles)
        if (result.path !== undefined) {
            return result.path.slice(1, -1)
        }
        let added = false
        for (const obstacle of result.blocked.values()) {
            if (expanded.has(obstacle.id)) {
                continue
            }
            expanded.add(obstacle.id)
            points.push(
                ...obstacleCorners(obstacle).filter((corner) =>
                    obstacles.every((other) => !pointObstructed(corner, other))
                )
            )
            added = true
        }
        if (!added) {
            break
        }
    }
    throw new Error(
        `Cannot route constellation prerequisite ${edge.from}>${edge.to}`
    )
}
