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
export interface ObservedPortal {
    from: string
    to: string
    edge: Vector2
    endpointId: string
    returnEndpointId: string
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
    crossing?: ObservedExit | ObservedPortal
    foreign?: {
        locationId: string
        entry: Vector2
        until: number
        exit: ObservedExit | ObservedPortal
    }
}
export const pursuits = new WeakMap<GameCharacter, PursuitState>()
export const territories = new WeakMap<GameCharacter, CharacterTerritory>()
const roamingHomes = new WeakMap<GameCharacter, PursuitState['home']>()

export function pursuitHome(actor: GameCharacter): PursuitState['home'] {
    const roamingHome = roamingHomes.get(actor)
    return (
        territories.get(actor) ??
        (roamingHome?.locationId === actor.locationId
            ? roamingHome
            : {
                  locationId: actor.spawnLocationId,
                  position: actor.spawnPosition,
              })
    )
}

export function settlePursuitHome(actor: GameCharacter): void {
    clearPursuit(actor)
    if (actor.locationId === actor.spawnLocationId) {
        roamingHomes.delete(actor)
    } else {
        roamingHomes.set(actor, {
            locationId: actor.locationId,
            position: { ...actor.position },
        })
    }
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
