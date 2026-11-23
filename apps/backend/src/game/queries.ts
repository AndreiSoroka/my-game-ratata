import type {
    WorldChestSnapshot,
    WorldItemSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canObserveRoomCharacter, visibilityRadius } from './characterSight'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import type { NavigationService } from './navigation'

export { visibilityRadius } from './characterSight'

export function createSnapshot(
    characters: Iterable<GameCharacter>,
    items: Iterable<WorldItemSnapshot>,
    chests: Iterable<WorldChestSnapshot>,
    tick: number,
    now: number,
    navigation: NavigationService,
    observerId?: string
): WorldSnapshot {
    const candidates = [...characters]
    const observer = candidates.find((character) => character.id === observerId)
    return {
        chests: [...chests],
        characters: candidates
            .filter((character) =>
                canObserveRoomCharacter(observer, character, navigation, now)
            )
            .map((character) =>
                character.snapshot(now, character.id === observerId)
            ),
        items: [...items],
        serverTime: now,
        tick,
    }
}

export function findVisibleTarget(
    characters: Iterable<GameCharacter>,
    navigation: NavigationService,
    observer: GameCharacter,
    radius: number,
    now = Date.now()
): GameCharacter | undefined {
    return [...characters]
        .filter(
            (character) =>
                character.alive &&
                character.trainingTarget === undefined &&
                !character.tags.has('offline') &&
                character.locationId === observer.locationId
        )
        .filter((character) => canTargetByFaction(observer, character, now))
        .filter(
            (target) =>
                distance(observer.position, target.position) <=
                visibilityRadius(observer, target, radius, now)
        )
        .filter((target) =>
            navigation.hasLineOfSight(observer.position, target.position)
        )
        .sort(
            (a, b) =>
                distance(observer.position, a.position) -
                distance(observer.position, b.position)
        )[0]
}

export function faceNearestTarget(
    actor: GameCharacter,
    characters: Iterable<GameCharacter>,
    radius: number,
    navigation: NavigationService,
    now = Date.now()
): void {
    const target = [...characters]
        .filter(
            (character) =>
                character.id !== actor.id &&
                character.alive &&
                character.trainingTarget === undefined &&
                canObserveRoomCharacter(actor, character, navigation, now)
        )
        .filter((character) => canTargetByFaction(actor, character))
        .map((character) => ({
            character,
            distance: distance(actor.position, character.position),
        }))
        .filter((candidate) => candidate.distance <= radius)
        .sort((a, b) => a.distance - b.distance)[0]?.character

    if (target !== undefined) {
        actor.updateFacing({
            x: target.position.x - actor.position.x,
            y: target.position.y - actor.position.y,
        })
    }
}
