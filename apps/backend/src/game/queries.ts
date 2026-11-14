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
    radius: number,
    now = Date.now()
): GameCharacter | undefined {
    return [...characters]
        .filter(
            (character) =>
                character.alive &&
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

export function visibilityRadius(
    observer: GameCharacter,
    target: GameCharacter,
    radius: number,
    now: number
): number {
    if (
        target.movement.mode !== 'sneaking' ||
        target.movement.dashUntil > now ||
        target.lastAttackAt + 1_000 > now
    ) {
        return radius
    }
    const vector = {
        x: target.position.x - observer.position.x,
        y: target.position.y - observer.position.y,
    }
    const facing = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
    }[observer.facing]
    const length = Math.max(1, Math.hypot(vector.x, vector.y))
    const dot = (vector.x * facing.x + vector.y * facing.y) / length
    const factor = dot >= 0.4 ? 0.65 : dot <= -0.4 ? 0.35 : 0.5
    const learned = 1 - (target.progression.skills.stealth.level - 1) * 0.03
    return Math.min(radius, Math.max(28, radius * factor * learned))
}
