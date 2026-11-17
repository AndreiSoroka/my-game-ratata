import type { Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import type { NavigationService } from '../game/navigation'
import { resolveRouteDestination } from '../game/routeDestination'

/** Shared navigation can cross at an edge on the same tick it reaches a waypoint. */
export function npcAiNavigationError(
    actor: GameCharacter,
    target: Vector2,
    navigation?: NavigationService
): string | undefined {
    if (navigation === undefined) {
        return undefined
    }
    const route = resolveRouteDestination(actor.position, target, navigation)
    if (route === undefined) {
        // The shared route command owns unreachable-destination rejection.
        return undefined
    }
    return [route.destination, ...route.path].some((point) =>
        reachesTravelEdge(point, navigation)
    )
        ? 'City-only AI routes cannot touch location travel edges'
        : undefined
}

function reachesTravelEdge(
    point: Vector2,
    navigation: NavigationService
): boolean {
    const { tileWidth, tileHeight, worldWidth, worldHeight } =
        navigation.summary
    const epsilon = 0.01
    return (
        point.x <= tileWidth / 2 + epsilon ||
        point.x >= worldWidth - tileWidth / 2 - epsilon ||
        point.y <= tileHeight / 2 + epsilon ||
        point.y >= worldHeight - tileHeight / 2 - epsilon
    )
}
