import {
    getWorldLocationDefinition,
    type Vector2,
    WORLD_DIRECTIONS,
    type WorldDirection,
    worldLocationNeighbor,
} from '@my-game-ratata/contracts'

import type { NavigationService } from './navigation'

export function regionalRoute(
    fromId: string,
    targetId: string
): string[] | undefined {
    if (
        getWorldLocationDefinition(fromId) === undefined ||
        getWorldLocationDefinition(targetId) === undefined
    ) {
        return undefined
    }
    const pending = [[fromId]]
    const seen = new Set([fromId])
    for (const route of pending) {
        const last = route.at(-1)
        if (last === targetId) {
            return route
        }
        for (const direction of Object.keys(
            WORLD_DIRECTIONS
        ) as WorldDirection[]) {
            const neighbor = worldLocationNeighbor(last ?? '', direction)
            if (neighbor !== undefined && !seen.has(neighbor.id)) {
                seen.add(neighbor.id)
                pending.push([...route, neighbor.id])
            }
        }
    }
    return undefined
}

export function regionalDirection(
    fromId: string,
    toId: string
): WorldDirection | undefined {
    return (Object.keys(WORLD_DIRECTIONS) as WorldDirection[]).find(
        (direction) => worldLocationNeighbor(fromId, direction)?.id === toId
    )
}

export interface RegionalExit {
    point: Vector2
    direction: WorldDirection
    nextLocationId: string
}

/** Resolve a real reachable edge on one authored side, excluding accidental corner/other-side hops. */
export function regionalExit(
    from: Vector2,
    locationId: string,
    nextLocationId: string,
    navigation: NavigationService,
    preferredPoint?: Vector2
): RegionalExit | undefined {
    const direction = regionalDirection(locationId, nextLocationId)
    if (direction === undefined) {
        return undefined
    }
    const axis = WORLD_DIRECTIONS[direction]
    const { tileWidth, tileHeight, width, height } = navigation.grid
    const horizontal = axis.x !== 0
    const length = horizontal ? height : width
    const gate = navigation.grid.landmarks?.find(
        (landmark) => landmark.direction === direction
    )
    const preferred = preferredPoint ??
        gate?.position ?? {
            x: (width * tileWidth) / 2,
            y: (height * tileHeight) / 2,
        }
    const candidates = Array.from(
        { length: Math.max(0, length - 2) },
        (_, offset) => {
            const tile = offset + 1
            return horizontal
                ? {
                      x:
                          axis.x < 0
                              ? tileWidth / 2
                              : width * tileWidth - tileWidth / 2,
                      y: tile * tileHeight + tileHeight / 2,
                  }
                : {
                      x: tile * tileWidth + tileWidth / 2,
                      y:
                          axis.y < 0
                              ? tileHeight / 2
                              : height * tileHeight - tileHeight / 2,
                  }
        }
    ).sort(
        (a, b) =>
            Math.hypot(a.x - preferred.x, a.y - preferred.y) -
            Math.hypot(b.x - preferred.x, b.y - preferred.y)
    )
    for (const point of candidates) {
        const path = navigation.findPathWorld(from, point)
        if (
            path.length > 0 &&
            path.every((waypoint) =>
                permittedExitPoint(waypoint, direction, navigation)
            )
        ) {
            return { point, direction, nextLocationId }
        }
    }
    return undefined
}

function permittedExitPoint(
    point: Vector2,
    direction: WorldDirection,
    navigation: NavigationService
): boolean {
    const { tileWidth, tileHeight, worldWidth, worldHeight } =
        navigation.summary
    return (
        (direction === 'west' || point.x > tileWidth / 2) &&
        (direction === 'east' || point.x < worldWidth - tileWidth / 2) &&
        (direction === 'north' || point.y > tileHeight / 2) &&
        (direction === 'south' || point.y < worldHeight - tileHeight / 2)
    )
}
