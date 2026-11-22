import {
    MOVEMENT_RULES,
    type Vector2,
    WILDERNESS_AGGRO_POLICY,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import type { MovementNoise } from './movementNoise'
import type { GameRoom } from './room'
import { undeadHearingMultiplier } from './undeadTactics'

const heardByRoom = new WeakMap<GameRoom, Map<string, MovementNoise>>()

/** Capture who actually hears a sound now; later investigation never reads the source position. */
export function recordMovementNoise(
    room: GameRoom,
    noise: MovementNoise,
    characters: Iterable<GameCharacter>
): void {
    const source = room.getCharacter(noise.actorId)
    if (!activeSource(source, noise.locationId)) {
        return
    }
    const heard = heardByRoom.get(room) ?? new Map<string, MovementNoise>()
    heardByRoom.set(room, heard)
    for (const listener of characters) {
        if (!canHear(listener, source, noise, room)) {
            continue
        }
        heard.set(listener.id, { ...noise, position: { ...noise.position } })
    }
}

export function lastHeardPoint(
    actor: GameCharacter,
    room: GameRoom,
    now: number
): Vector2 | undefined {
    const heard = heardByRoom.get(room)
    const noise = heard?.get(actor.id)
    if (noise === undefined) {
        return undefined
    }
    const source = room.getCharacter(noise.actorId)
    if (
        !activeSource(actor, noise.locationId) ||
        !activeSource(source, noise.locationId) ||
        !canTargetByFaction(actor, source) ||
        now - noise.emittedAt >= MOVEMENT_RULES.investigationMs
    ) {
        heard?.delete(actor.id)
        return undefined
    }
    return { ...noise.position }
}

function canHear(
    listener: GameCharacter,
    source: GameCharacter,
    noise: MovementNoise,
    room: GameRoom
): boolean {
    if (
        !activeSource(listener, noise.locationId) ||
        !canTargetByFaction(listener, source) ||
        distance(listener.spawnPosition, noise.position) >
            WILDERNESS_AGGRO_POLICY.spawnLeashRadius
    ) {
        return false
    }
    const navigation = room.navigationFor(listener)
    const attenuation = navigation.hasLineOfSight(
        listener.position,
        noise.position
    )
        ? 1
        : MOVEMENT_RULES.occludedNoiseMultiplier
    return (
        distance(listener.position, noise.position) <=
        noise.radius * attenuation * undeadHearingMultiplier(listener, source)
    )
}

function activeSource(
    character: GameCharacter | undefined,
    locationId: string
): character is GameCharacter {
    return (
        character !== undefined &&
        character.alive &&
        !character.tags.has('offline') &&
        character.locationId === locationId
    )
}
