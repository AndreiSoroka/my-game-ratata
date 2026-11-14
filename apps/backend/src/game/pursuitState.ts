import { PURSUIT_RULES, type Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

export interface CharacterTerritory {
    sourceId: string
    locationId: string
    position: Vector2
}
export interface ObservedExit {
    from: string
    to: string
    edge: Vector2
    direction: Vector2
    expiresAt: number
}
export interface PursuitState {
    phase: 'chase' | 'return'
    targetId: string
    home: { locationId: string; position: Vector2 }
    lastKnown: Vector2
    lastSeenAt: number
    lastPlanAt: number
    sightRadius: number
    crossing?: ObservedExit
    foreign?: {
        locationId: string
        entry: Vector2
        until: number
        exit: ObservedExit
    }
}
export const pursuits = new WeakMap<GameCharacter, PursuitState>()
export const territories = new WeakMap<GameCharacter, CharacterTerritory>()

export function pursuitHome(actor: GameCharacter): PursuitState['home'] {
    return (
        territories.get(actor) ?? {
            locationId: actor.spawnLocationId,
            position: actor.spawnPosition,
        }
    )
}

export function clearPursuit(actor: GameCharacter): void {
    pursuits.delete(actor)
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
}

export function returnFromPursuit(actor: GameCharacter): void {
    const state = pursuits.get(actor)
    if (state !== undefined && state.phase !== 'return') {
        state.phase = 'return'
        state.lastPlanAt = -Infinity
        actor.movement.dashUntil = 0
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
    }
}

export function insideTerritory(
    actor: GameCharacter,
    point: Vector2,
    radius: number = PURSUIT_RULES.guardianChaseRadius
): boolean {
    const territory = territories.get(actor)
    return (
        territory === undefined ||
        (actor.locationId === territory.locationId &&
            Math.hypot(
                point.x - territory.position.x,
                point.y - territory.position.y
            ) <= radius)
    )
}
