import type { Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'

export function canAutoOpenDoors(actor: GameCharacter): boolean {
    return (
        actor.controllerKind === 'scripted' &&
        actor.soul.controlSource === 'script' &&
        actor.creatureType === 'humanoid'
    )
}

export function findActorPath(
    navigation: NavigationService,
    actor: GameCharacter,
    target: Vector2,
    from = actor.position
): Vector2[] {
    return navigation.findPathWorld(from, target, canAutoOpenDoors(actor))
}
