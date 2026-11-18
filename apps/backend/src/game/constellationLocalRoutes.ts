import {
    segmentsConflict,
    type SkyEdge,
    type SkyPoint,
} from './constellationGeometry'
import {
    insideLocalRoute,
    type LocalRouteBounds,
    localRouteBounds,
    localRouteCorridors,
} from './constellationLocalCorridors'
import {
    constellationRouteObstacles,
    obstacleCorners,
    pointObstructed,
} from './constellationRouteObstacles'
import { shortestConstellationPath } from './constellationRouteVisibility'

interface ProtectedSegment {
    from: SkyPoint
    to: SkyPoint
    edge: SkyEdge
    endpoints: Readonly<Record<string, SkyPoint>>
}
interface LocalField {
    positions: Readonly<Record<string, SkyPoint>>
    stars: Readonly<Record<string, SkyPoint>>
    bounds: LocalRouteBounds
    segments: ProtectedSegment[]
}

/** Extra AND links stay within their own field, minimizing crossings before distance. */
export function routeLocalConstellationLinks(
    positions: Readonly<Record<string, SkyPoint>>,
    edges: readonly SkyEdge[],
    nodeGroups: ReadonlyArray<readonly string[]>
): Record<string, SkyPoint[]> {
    const routes: Record<string, SkyPoint[]> = {}
    for (const ids of nodeGroups) {
        const fieldPositions = Object.fromEntries(
            ids.map((id) => [id, required(positions[id])])
        )
        const bounds = localRouteBounds(Object.values(fieldPositions))
        const obstacleBounds = {
            left: bounds.left - 80,
            right: bounds.right + 80,
            top: bounds.top - 80,
            bottom: bounds.bottom + 80,
        }
        const localEdges = edges.filter(
            (edge) => ids.includes(edge.from) && ids.includes(edge.to)
        )
        const field: LocalField = {
            positions: fieldPositions,
            bounds,
            stars: Object.fromEntries(
                Object.entries(positions).filter(([, point]) =>
                    insideLocalRoute(point, obstacleBounds)
                )
            ),
            segments: localEdges
                .filter((edge) => edge.crossLink !== true)
                .flatMap((edge) =>
                    pathSegments(edge, edgePath(fieldPositions, edge))
                ),
        }
        const extra = localEdges
            .filter((edge) => edge.crossLink === true)
            .sort((a, b) => compareLocalEdges(field, a, b))
        for (const edge of extra) {
            const path = localPath(field, edge)
            routes[edgeKey(edge)] = path.slice(1, -1)
            field.segments.push(...pathSegments(edge, path))
        }
        refineCrossedLinks(field, extra, routes)
    }
    return routes
}

function localPath(
    field: LocalField,
    edge: SkyEdge,
    previous: readonly SkyPoint[] = []
): SkyPoint[] {
    const start = required(field.positions[edge.from]),
        end = required(field.positions[edge.to])
    const obstacles = constellationRouteObstacles(field.stars, edge)
    const corridors = localRouteCorridors(
        field.positions,
        field.bounds,
        start,
        end
    ).filter((point) =>
        obstacles.every((obstacle) => !pointObstructed(point, obstacle))
    )
    const points = [start, end, ...corridors, ...previous]
    const penalty =
        Math.hypot(
            field.bounds.right - field.bounds.left,
            field.bounds.bottom - field.bounds.top
        ) * 100
    const cost = (from: SkyPoint, to: SkyPoint) =>
        crossingCount(field.segments, edge, from, to) * penalty +
        Math.hypot(to.x - from.x, to.y - from.y) +
        1
    let result = shortestConstellationPath(points, obstacles, cost)
    if (result.path === undefined) {
        const corners = [...result.blocked.values()]
            .slice(0, 2)
            .flatMap(obstacleCorners)
            .filter(
                (point) =>
                    insideLocalRoute(point, field.bounds) &&
                    obstacles.every(
                        (obstacle) => !pointObstructed(point, obstacle)
                    )
            )
        result = shortestConstellationPath(
            [...points, ...corners],
            obstacles,
            cost
        )
    }
    if (result.path === undefined) {
        throw new Error(`Cannot route local prerequisite ${edgeKey(edge)}`)
    }
    const detours = crossedBranchCorners(field, edge, result.path).filter(
        (point) =>
            insideLocalRoute(point, field.bounds) &&
            obstacles.every((obstacle) => !pointObstructed(point, obstacle))
    )
    return detours.length === 0
        ? result.path
        : (shortestConstellationPath([...points, ...detours], obstacles, cost)
              .path ?? result.path)
}

/** One bounded rip-up pass can release crossings introduced by an earlier greedy choice. */
function refineCrossedLinks(
    field: LocalField,
    edges: readonly SkyEdge[],
    routes: Record<string, SkyPoint[]>
): void {
    const priorities = edges
        .map((edge) => ({
            edge,
            count: routeCrossings(
                field,
                edge,
                edgePath(field.positions, {
                    ...edge,
                    via: routes[edgeKey(edge)] ?? [],
                })
            ),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4)
    for (const { edge, count } of priorities) {
        if (count === 0) {
            continue
        }
        field.segments = field.segments.filter(
            (segment) => segment.edge !== edge
        )
        const prior = edgePath(field.positions, {
            ...edge,
            via: routes[edgeKey(edge)] ?? [],
        })
        const candidate = localPath(field, edge, prior.slice(1, -1))
        const path =
            routeCrossings(field, edge, candidate) <
            routeCrossings(field, edge, prior)
                ? candidate
                : prior
        routes[edgeKey(edge)] = path.slice(1, -1)
        field.segments.push(...pathSegments(edge, path))
    }
}

function routeCrossings(
    field: LocalField,
    edge: SkyEdge,
    path: readonly SkyPoint[]
): number {
    const other = field.segments.filter((segment) => segment.edge !== edge)
    return path
        .slice(1)
        .reduce(
            (sum, to, index) =>
                sum + crossingCount(other, edge, required(path[index]), to),
            0
        )
}

/** Only branches actually crossed by the first route add candidates; the search remains small. */
function crossedBranchCorners(
    field: LocalField,
    edge: SkyEdge,
    path: readonly SkyPoint[]
): SkyPoint[] {
    const crossed = field.segments
        .filter(
            (segment) =>
                segment.edge.crossLink !== true &&
                path
                    .slice(1)
                    .some(
                        (to, index) =>
                            crossingCount(
                                [segment],
                                edge,
                                required(path[index]),
                                to
                            ) > 0
                    )
        )
        .slice(0, 2)
    const nodes = new Map(
        crossed.flatMap((segment) => Object.entries(segment.endpoints))
    )
    return [...nodes.values()].flatMap((point) =>
        [-80, 80].flatMap((dx) =>
            [-80, 80].map((dy) => ({ x: point.x + dx, y: point.y + dy }))
        )
    )
}

function directCrossings(field: LocalField, edge: SkyEdge): number {
    return crossingCount(
        field.segments,
        edge,
        required(field.positions[edge.from]),
        required(field.positions[edge.to])
    )
}
function compareLocalEdges(field: LocalField, a: SkyEdge, b: SkyEdge): number {
    const difference = directCrossings(field, b) - directCrossings(field, a)
    return difference !== 0 ? difference : edgeKey(a).localeCompare(edgeKey(b))
}
function crossingCount(
    segments: readonly ProtectedSegment[],
    edge: SkyEdge,
    from: SkyPoint,
    to: SkyPoint
): number {
    let count = 0
    for (const segment of segments) {
        if (!boxesOverlap(from, to, segment.from, segment.to)) {
            continue
        }
        const allowed = [segment.edge.from, segment.edge.to]
            .filter((id) => id === edge.from || id === edge.to)
            .map((id) => required(segment.endpoints[id]))
        if (segmentsConflict(from, to, segment.from, segment.to, allowed)) {
            count++
        }
    }
    return count
}
function boxesOverlap(
    a: SkyPoint,
    b: SkyPoint,
    c: SkyPoint,
    d: SkyPoint
): boolean {
    return (
        Math.min(a.x, b.x) <= Math.max(c.x, d.x) &&
        Math.max(a.x, b.x) >= Math.min(c.x, d.x) &&
        Math.min(a.y, b.y) <= Math.max(c.y, d.y) &&
        Math.max(a.y, b.y) >= Math.min(c.y, d.y)
    )
}
function edgePath(
    positions: Readonly<Record<string, SkyPoint>>,
    edge: SkyEdge
): SkyPoint[] {
    return [
        required(positions[edge.from]),
        ...(edge.via ?? []),
        required(positions[edge.to]),
    ]
}
function pathSegments(
    edge: SkyEdge,
    path: readonly SkyPoint[]
): ProtectedSegment[] {
    const endpoints = {
        [edge.from]: required(path[0]),
        [edge.to]: required(path.at(-1)),
    }
    return path.slice(1).map((to, index) => ({
        from: required(path[index]),
        to,
        edge,
        endpoints,
    }))
}
function edgeKey(edge: SkyEdge): string {
    return `${edge.from}>${edge.to}`
}
function required(point: SkyPoint | undefined): SkyPoint {
    if (point === undefined) {
        throw new Error('Missing local constellation point')
    }
    return point
}
