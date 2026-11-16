import type { Vector2 } from '@my-game-ratata/contracts'

import { distance } from './math'
import type { NavigationService } from './navigation'

export const ROUTE_FALLBACK_CELLS = 2

export interface ResolvedRouteDestination {
    requestedPosition: Vector2
    destination: Vector2
    path: Vector2[]
}

/** Resolves an intention without moving the actor or changing any navigation state. */
export function resolveRouteDestination(
    from: Vector2,
    requested: Vector2,
    navigation: NavigationService
): ResolvedRouteDestination | undefined {
    if (!finitePoint(from) || !finitePoint(requested)) {
        return undefined
    }
    const requestedPosition = navigation.clampWorld(requested)
    const exact = navigation.findPathWorld(from, requestedPosition)
    if (exact.length > 0) {
        return {
            requestedPosition,
            destination: { ...requestedPosition },
            path: exact,
        }
    }
    const candidates = nearbyDestinations(requestedPosition, navigation)
    candidates.sort((a, b) =>
        compareDestinations(a, b, requestedPosition, from)
    )
    for (const destination of candidates) {
        const path = navigation.findPathWorld(from, destination)
        if (path.length > 0) {
            return { requestedPosition, destination, path }
        }
    }
    return undefined
}

function compareDestinations(
    a: Vector2,
    b: Vector2,
    requested: Vector2,
    from: Vector2
): number {
    const requestedDifference = distance(a, requested) - distance(b, requested)
    if (requestedDifference !== 0) {
        return requestedDifference
    }
    const originDifference = distance(a, from) - distance(b, from)
    if (originDifference !== 0) {
        return originDifference
    }
    return a.y !== b.y ? a.y - b.y : a.x - b.x
}

function nearbyDestinations(
    point: Vector2,
    navigation: NavigationService
): Vector2[] {
    const tile = navigation.worldToTile(point)
    const { tileWidth, tileHeight } = navigation.grid
    const candidates: Vector2[] = []
    for (let y = -ROUTE_FALLBACK_CELLS; y <= ROUTE_FALLBACK_CELLS; y++) {
        for (let x = -ROUTE_FALLBACK_CELLS; x <= ROUTE_FALLBACK_CELLS; x++) {
            const candidateTile = { x: tile.x + x, y: tile.y + y }
            const candidate = navigation.tileToWorld(candidateTile)
            const cellsSquared =
                ((candidate.x - point.x) / tileWidth) ** 2 +
                ((candidate.y - point.y) / tileHeight) ** 2
            if (
                !navigation.isSolidTile(candidateTile) &&
                cellsSquared <= ROUTE_FALLBACK_CELLS ** 2
            ) {
                candidates.push(candidate)
            }
        }
    }
    return candidates
}

function finitePoint(point: Vector2): boolean {
    return Number.isFinite(point.x) && Number.isFinite(point.y)
}
