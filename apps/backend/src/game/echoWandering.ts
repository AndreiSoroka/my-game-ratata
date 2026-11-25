import {
    getWorldLocationDefinition,
    type Vector2,
    WILDERNESS_AGGRO_POLICY,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { visibilityRadius } from './characterSight'
import { hasAttackRelationship } from './combatTargets'
import { segmentDistanceSquared } from './constellationGeometry'
import { available } from './crimeRules'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { edgeExitDirection } from './regionalNavigation'
import { isInsideDungeonPassage } from './worldPassages'

const wanderRadiusTiles = 3

export function echoSeesHostile(
    actor: GameCharacter,
    characters: Iterable<GameCharacter>,
    navigation: NavigationService,
    now: number
): boolean {
    for (const target of characters) {
        if (
            target !== actor &&
            target.locationId === actor.locationId &&
            available(target) &&
            target.trainingTarget === undefined &&
            hasAttackRelationship(actor, target, now) &&
            distance(actor.position, target.position) <=
                visibilityRadius(
                    actor,
                    target,
                    WILDERNESS_AGGRO_POLICY.sightRadius,
                    now
                ) &&
            navigation.hasLineOfSight(actor.position, target.position)
        ) {
            return true
        }
    }
    return false
}

export function echoWanderDestination(
    actor: GameCharacter,
    origin: Vector2,
    navigation: NavigationService,
    random: () => number
): Vector2 | undefined {
    const from = actor.position
    if (!withinWanderRadius(origin, from, navigation)) {
        return undefined
    }
    const surface = getWorldLocationDefinition(actor.locationId) !== undefined
    // Both endpoints lie in the same convex radius. One cardinal tile step
    // cannot leave it or cross an intervening wall tile.
    const destinations = navigation
        .walkableNeighbors(navigation.worldToTile(from))
        .map((tile) => navigation.tileToWorld(tile))
        .filter(
            (point) =>
                withinWanderRadius(origin, point, navigation) &&
                !leavesLocation(navigation, from, point, surface)
        )
    return destinations[Math.floor(random() * destinations.length)]
}

function withinWanderRadius(
    origin: Vector2,
    point: Vector2,
    { grid }: NavigationService
): boolean {
    return (
        Math.hypot(
            (point.x - origin.x) / grid.tileWidth,
            (point.y - origin.y) / grid.tileHeight
        ) <= wanderRadiusTiles
    )
}

function leavesLocation(
    navigation: NavigationService,
    from: Vector2,
    to: Vector2,
    surface: boolean
): boolean {
    const direction = { x: to.x - from.x, y: to.y - from.y }
    if (surface && edgeExitDirection(to, direction, navigation) !== undefined) {
        return true
    }
    const { dungeonPassage } = navigation.grid
    return (
        dungeonPassage !== undefined &&
        !isInsideDungeonPassage(from, dungeonPassage) &&
        segmentDistanceSquared(dungeonPassage.position, from, to) <=
            dungeonPassage.triggerRadius ** 2
    )
}
