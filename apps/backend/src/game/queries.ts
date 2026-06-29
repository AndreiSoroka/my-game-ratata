import type { WorldSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import type { NavigationService } from './navigation'

export function createSnapshot(
    characters: Iterable<GameCharacter>,
    tick: number,
    now: number
): WorldSnapshot {
    return {
        characters: [...characters].map((character) => character.snapshot(now)),
        serverTime: now,
        tick,
    }
}

export function findVisiblePlayer(
    characters: Iterable<GameCharacter>,
    navigation: NavigationService,
    observer: GameCharacter,
    radius: number
): GameCharacter | undefined {
    return [...characters]
        .filter((character) => character.controllerKind === 'network_player')
        .filter((player) => player.alive && player.id !== observer.id)
        .filter(
            (player) => distance(observer.position, player.position) <= radius
        )
        .filter((player) =>
            navigation.hasLineOfSight(observer.position, player.position)
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
