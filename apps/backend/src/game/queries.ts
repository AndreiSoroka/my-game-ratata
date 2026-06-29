import type {
    WorldChestSnapshot,
    WorldItemSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import type { NavigationService } from './navigation'

export function createSnapshot(
    characters: Iterable<GameCharacter>,
    items: Iterable<WorldItemSnapshot>,
    chests: Iterable<WorldChestSnapshot>,
    tick: number,
    now: number
): WorldSnapshot {
    return {
        chests: [...chests],
        characters: [...characters].map((character) => character.snapshot(now)),
        items: [...items],
        serverTime: now,
        tick,
    }
}

export function findVisibleTarget(
    characters: Iterable<GameCharacter>,
    navigation: NavigationService,
    observer: GameCharacter,
    radius: number
): GameCharacter | undefined {
    return [...characters]
        .filter((character) => character.alive)
        .filter((character) => canTargetByFaction(observer, character))
        .filter(
            (target) => distance(observer.position, target.position) <= radius
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
    radius: number
): void {
    const target = [...characters]
        .filter((character) => character.id !== actor.id && character.alive)
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
