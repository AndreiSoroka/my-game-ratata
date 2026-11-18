import type { SkyPoint } from './constellationGeometry'
import {
    type ConstellationRouteObstacle,
    segmentObstructed,
} from './constellationRouteObstacles'

export interface ConstellationRouteSearch {
    path: SkyPoint[] | undefined
    blocked: Map<string, ConstellationRouteObstacle>
}
export type ConstellationRouteCost = (from: SkyPoint, to: SkyPoint) => number

/** Deterministic visibility search; callers may add nonnegative crossing penalties. */
export function shortestConstellationPath(
    points: readonly SkyPoint[],
    obstacles: readonly ConstellationRouteObstacle[],
    edgeCost: ConstellationRouteCost = (from, to) =>
        Math.hypot(to.x - from.x, to.y - from.y)
): ConstellationRouteSearch {
    const distances = points.map(() => Infinity),
        previous = points.map(() => -1)
    distances[0] = 0
    const done = new Set<number>(),
        blocked = new Map<string, ConstellationRouteObstacle>()
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
            { points, obstacles, distances, previous, done, blocked, edgeCost },
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
    obstacles: readonly ConstellationRouteObstacle[]
    distances: number[]
    previous: number[]
    done: ReadonlySet<number>
    blocked: Map<string, ConstellationRouteObstacle>
    edgeCost: ConstellationRouteCost
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
        const obstructions = obstacles.filter((obstacle) =>
            segmentObstructed(from, to, obstacle)
        )
        if (obstructions.length > 0) {
            obstructions.forEach((obstacle) =>
                blocked.set(obstacle.id, obstacle)
            )
            continue
        }
        const cost = state.edgeCost(from, to)
        if (!Number.isFinite(cost) || cost < 0) {
            throw new Error('Invalid constellation route cost')
        }
        const distance = (distances[current] ?? Infinity) + cost
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
