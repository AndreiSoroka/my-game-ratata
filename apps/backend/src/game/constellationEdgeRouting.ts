import {
    segmentDistanceSquared,
    type SkyEdge,
    type SkyPoint,
} from './constellationGeometry'
import type { ConstellationTopologyNode } from './constellationLayoutTypes'

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

/** AND graphs need not be planar. Every extra prerequisite still avoids all foreign stars. */
export function routeConstellationCrossLinks(
    positions: Readonly<Record<string, SkyPoint>>,
    edges: readonly SkyEdge[]
): Record<string, SkyPoint[]> {
    return Object.fromEntries(
        edges
            .filter((edge) => edge.crossLink === true)
            .map((edge) => [`${edge.from}>${edge.to}`, route(positions, edge)])
    )
}

function route(
    positions: Readonly<Record<string, SkyPoint>>,
    edge: SkyEdge
): SkyPoint[] {
    const start = positions[edge.from],
        end = positions[edge.to]
    if (start === undefined || end === undefined) {
        throw new Error('Unknown cross-link endpoint')
    }
    const obstacles = Object.entries(positions).filter(
        ([id]) => id !== edge.from && id !== edge.to
    )
    const points: SkyPoint[] = [start, end]
    const expanded = new Set<string>()
    // Expanding a foreign star adds its square corners to a small visibility graph.
    for (let attempt = 0; attempt <= obstacles.length; attempt++) {
        const result = shortestPath(points, obstacles)
        if (result.path !== undefined) {
            return result.path.slice(1, -1)
        }
        let added = false
        for (const [id, point] of result.blocked) {
            if (expanded.has(id)) {
                continue
            }
            expanded.add(id)
            for (const dx of [-52, 52]) {
                for (const dy of [-52, 52]) {
                    const corner = { x: point.x + dx, y: point.y + dy }
                    if (
                        obstacles.every(
                            ([, other]) =>
                                Math.hypot(
                                    corner.x - other.x,
                                    corner.y - other.y
                                ) >= 40
                        )
                    ) {
                        points.push(corner)
                    }
                }
            }
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

type Obstacle = [string, SkyPoint]
function shortestPath(points: readonly SkyPoint[], obstacles: Obstacle[]) {
    const distances = points.map(() => Infinity),
        previous = points.map(() => -1)
    distances[0] = 0
    const done = new Set<number>(),
        blocked = new Map<string, SkyPoint>()
    while (done.size < points.length) {
        const current = closestUndone(distances, done)
        if (current < 0 || !Number.isFinite(distances[current])) {
            break
        }
        const from = points[current]
        if (from === undefined) {
            break
        }
        if (current === 1) {
            return { path: reconstruct(points, previous), blocked }
        }
        done.add(current)
        relaxVisibleEdges(
            { points, obstacles, distances, previous, done, blocked },
            current,
            from
        )
    }
    return { path: undefined, blocked }
}

function closestUndone(
    distances: readonly number[],
    done: ReadonlySet<number>
): number {
    let current = -1
    for (const [i, value] of distances.entries()) {
        if (
            !done.has(i) &&
            (current < 0 || value < (distances[current] ?? Infinity))
        ) {
            current = i
        }
    }
    return current
}

interface SearchState {
    points: readonly SkyPoint[]
    obstacles: Obstacle[]
    distances: number[]
    previous: number[]
    done: ReadonlySet<number>
    blocked: Map<string, SkyPoint>
}
function relaxVisibleEdges(
    state: SearchState,
    current: number,
    from: SkyPoint
): void {
    const { points, obstacles, distances, previous, done, blocked } = state
    for (const [next, to] of points.entries()) {
        if (done.has(next)) {
            continue
        }
        const obstruction = obstacles.find(
            ([, point]) => segmentDistanceSquared(point, from, to) < 40 * 40
        )
        if (obstruction !== undefined) {
            blocked.set(...obstruction)
            continue
        }
        const distance =
            (distances[current] ?? Infinity) +
            Math.hypot(to.x - from.x, to.y - from.y)
        if (distance < (distances[next] ?? Infinity)) {
            distances[next] = distance
            previous[next] = current
        }
    }
}

function reconstruct(
    points: readonly SkyPoint[],
    previous: readonly number[]
): SkyPoint[] {
    const path: SkyPoint[] = []
    for (let index = 1; index >= 0; index = previous[index] ?? -1) {
        const point = points[index]
        if (point === undefined) {
            throw new Error('Invalid prerequisite route')
        }
        path.push({ ...point })
    }
    return path.reverse()
}
