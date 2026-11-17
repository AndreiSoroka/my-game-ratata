import {
    GRAVE_FOOTPRINT_SIZE,
    graveBounds,
    type Vector2,
} from '@my-game-ratata/contracts'

import { clamp } from './math'
import type { NavigationService } from './navigation'

const edgeMarginTiles = 2

/** Keep two full terrain tiles between a final grave's footprint and the map edge. */
export function finalGravePosition(
    death: Vector2,
    navigation: NavigationService
): Vector2 | undefined {
    const { tileWidth, tileHeight, worldWidth, worldHeight } =
        navigation.summary
    const half = GRAVE_FOOTPRINT_SIZE / 2
    const left = edgeMarginTiles * tileWidth + half
    const top = edgeMarginTiles * tileHeight + half
    const right = worldWidth - left
    const bottom = worldHeight - top
    const origin = navigation.worldToTile(death)
    if (left > right || top > bottom || navigation.isSolidTile(origin)) {
        return undefined
    }
    const fits = (point: Vector2) =>
        point.x >= left &&
        point.x <= right &&
        point.y >= top &&
        point.y <= bottom &&
        navigation
            .cellsInBounds(graveBounds(point))
            .every((index) => navigation.grid.solid[index] !== true)
    const clamped = {
        x: clamp(death.x, left, right),
        y: clamp(death.y, top, bottom),
    }
    if (fits(clamped) && navigation.findPathWorld(death, clamped).length > 0) {
        return clamped
    }

    // Search only connected ground, so an inward shift cannot jump a wall or river.
    const queue = [origin]
    const visited = new Set([origin.y * navigation.grid.width + origin.x])
    let nearest: Vector2 | undefined
    for (const tile of queue) {
        const point = navigation.tileToWorld(tile)
        if (fits(point) && closerToDeath(point, nearest, death)) {
            nearest = point
        }
        for (const neighbor of navigation.walkableNeighbors(tile)) {
            const index = neighbor.y * navigation.grid.width + neighbor.x
            if (!visited.has(index)) {
                visited.add(index)
                queue.push(neighbor)
            }
        }
    }
    return nearest
}

function closerToDeath(
    point: Vector2,
    current: Vector2 | undefined,
    death: Vector2
): boolean {
    if (current === undefined) {
        return true
    }
    const distance = (point.x - death.x) ** 2 + (point.y - death.y) ** 2
    const previous = (current.x - death.x) ** 2 + (current.y - death.y) ** 2
    if (distance !== previous) {
        return distance < previous
    }
    return point.y < current.y || (point.y === current.y && point.x < current.x)
}
