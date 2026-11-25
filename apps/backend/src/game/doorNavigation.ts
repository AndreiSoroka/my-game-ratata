import type { Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NavigationService, TileCoordinate } from './navigation'

const echoReturnPaths = new WeakSet<Vector2[]>()

export function canAutoOpenDoors(actor: GameCharacter): boolean {
    return (
        scriptedDoorControl(actor) ||
        (echoDoorControl(actor) && echoReturnPaths.has(actor.path))
    )
}

function scriptedDoorControl(actor: GameCharacter): boolean {
    return (
        actor.controllerKind === 'scripted' &&
        actor.soul.controlSource === 'script' &&
        actor.creatureType === 'humanoid'
    )
}

function echoDoorControl(actor: GameCharacter): boolean {
    return (
        actor.controllerKind === 'network_player' &&
        !actor.connected &&
        actor.soul.controlSource === 'script'
    )
}

export function findActorPath(
    navigation: NavigationService,
    actor: GameCharacter,
    target: Vector2,
    from = actor.position,
    canVisit?: (tile: TileCoordinate) => boolean
): Vector2[] {
    return navigation.findPathWorld(
        from,
        target,
        scriptedDoorControl(actor),
        canVisit
    )
}

/** Door permission is attached to the chosen return path and drops when it is replaced. */
export function pathForEchoReturn(
    navigation: NavigationService,
    actor: GameCharacter,
    target: Vector2,
    canVisit?: (tile: TileCoordinate) => boolean
): Vector2[] {
    const path = navigation.findPathWorld(
        actor.position,
        target,
        echoDoorControl(actor),
        canVisit
    )
    echoReturnPaths.add(path)
    return path
}
