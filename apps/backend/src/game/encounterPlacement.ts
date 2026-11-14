import type { GraveSourceDefinition, Vector2 } from '@my-game-ratata/contracts'

import { distance } from './math'
import type { NavigationService, TileCoordinate } from './navigation'

export function graveChildTile(
    navigation: NavigationService,
    source: GraveSourceDefinition,
    occupied: readonly Vector2[]
): TileCoordinate | undefined {
    const origin = navigation.worldToTile(source.position)
    for (let radius = 1; radius <= 4; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const tile = { x: origin.x + dx, y: origin.y + dy }
                const point = navigation.tileToWorld(tile)
                if (
                    !navigation.isSolidTile(tile) &&
                    occupied.every(
                        (position) => distance(position, point) >= 24
                    )
                ) {
                    return tile
                }
            }
        }
    }
    return undefined
}

export function slimeHabitatTile(
    navigation: NavigationService,
    fallback: TileCoordinate,
    occupied: readonly Vector2[]
): TileCoordinate {
    const desired = navigation.tileToWorld(fallback)
    const candidates = [...(navigation.grid.encounters?.slimeHabitats ?? [])]
        .filter(
            (point) =>
                !navigation.isSolidTile(navigation.worldToTile(point)) &&
                occupied.every((position) => distance(position, point) >= 24)
        )
        .sort((a, b) => distance(desired, a) - distance(desired, b))
    return candidates[0] === undefined
        ? fallback
        : navigation.worldToTile(candidates[0])
}
