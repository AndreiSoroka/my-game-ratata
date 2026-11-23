import {
    type HeardFootstepSnapshot,
    MOVEMENT_RULES,
    type Vector2,
    WILDERNESS_AGGRO_POLICY,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canObserveRoomCharacter, usesStealthSight } from './characterSight'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import type { MovementNoise } from './movementNoise'
import type { NavigationService } from './navigation'
import type { GameRoom } from './room'
import { undeadHearingMultiplier } from './undeadTactics'

const heardByRoom = new WeakMap<GameRoom, Map<string, MovementNoise>>()
const playerHearingByRoom = new WeakMap<
    GameRoom,
    WeakMap<GameCharacter, PlayerHearing>
>()
const maxHeardFootsteps = 4
const footstepCellSize = 32
const footstepIntervalMs = 900

interface HeardFootstep {
    source: GameCharacter
    locationId: string
    snapshot: HeardFootstepSnapshot
}

interface PlayerHearing {
    nextId: number
    footsteps: HeardFootstep[]
    lastMarkerAt: WeakMap<GameCharacter, number>
}

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
    const sneaking = usesStealthSight(source, noise.emittedAt)
    for (const listener of characters) {
        if (canHear(listener, source, noise, room)) {
            heard.set(listener.id, {
                ...noise,
                position: { ...noise.position },
            })
        }
        if (
            sneaking &&
            listener !== source &&
            activePlayer(listener, noise.locationId)
        ) {
            recordPlayerFootstep(room, listener, source, noise)
        }
    }
}

export function heardFootsteps(
    room: GameRoom,
    listener: GameCharacter,
    now: number
): HeardFootstepSnapshot[] {
    const hearing = playerHearingByRoom.get(room)?.get(listener)
    if (hearing === undefined) {
        return []
    }
    if (!activePlayer(listener, listener.locationId)) {
        hearing.footsteps = []
        return []
    }
    const navigation = room.navigationFor(listener)
    hearing.footsteps = hearing.footsteps.filter(
        ({ source, locationId, snapshot }) =>
            snapshot.expiresAt > now &&
            listener.locationId === locationId &&
            activeSource(source, locationId) &&
            !canObserveRoomCharacter(listener, source, navigation, now)
    )
    return hearing.footsteps.map(({ snapshot }) => ({
        ...snapshot,
        position: { ...snapshot.position },
    }))
}

function recordPlayerFootstep(
    room: GameRoom,
    listener: GameCharacter,
    source: GameCharacter,
    noise: MovementNoise
): void {
    const navigation = room.navigationFor(listener)
    const radius =
        MOVEMENT_RULES.playerFootstepHearingRadius *
        Math.sqrt(noise.radius / MOVEMENT_RULES.walkingNoiseRadius)
    const range = distance(listener.position, noise.position)
    if (
        range > radius ||
        range > radius * occlusionMultiplier(listener, noise, navigation) ||
        canObserveRoomCharacter(listener, source, navigation, noise.emittedAt)
    ) {
        return
    }
    const byListener =
        playerHearingByRoom.get(room) ??
        new WeakMap<GameCharacter, PlayerHearing>()
    playerHearingByRoom.set(room, byListener)
    const hearing = byListener.get(listener) ?? {
        nextId: 1,
        footsteps: [],
        lastMarkerAt: new WeakMap<GameCharacter, number>(),
    }
    byListener.set(listener, hearing)
    if (
        noise.emittedAt - (hearing.lastMarkerAt.get(source) ?? -Infinity) <
        footstepIntervalMs
    ) {
        return
    }
    hearing.lastMarkerAt.set(source, noise.emittedAt)
    hearing.footsteps.push({
        source,
        locationId: noise.locationId,
        snapshot: {
            id: hearing.nextId++,
            position: {
                x: footstepCellCenter(noise.position.x),
                y: footstepCellCenter(noise.position.y),
            },
            expiresAt: noise.emittedAt + MOVEMENT_RULES.heardFootstepMs,
        },
    })
    hearing.footsteps = hearing.footsteps.slice(-maxHeardFootsteps)
}

function footstepCellCenter(coordinate: number): number {
    return (
        Math.floor(coordinate / footstepCellSize) * footstepCellSize +
        footstepCellSize / 2
    )
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
    return (
        distance(listener.position, noise.position) <=
        noise.radius *
            occlusionMultiplier(listener, noise, room.navigationFor(listener)) *
            undeadHearingMultiplier(listener, source)
    )
}

function occlusionMultiplier(
    listener: GameCharacter,
    noise: MovementNoise,
    navigation: NavigationService
): number {
    return navigation.hasLineOfSight(listener.position, noise.position)
        ? 1
        : MOVEMENT_RULES.occludedNoiseMultiplier
}

function activePlayer(character: GameCharacter, locationId: string): boolean {
    return (
        character.controllerKind === 'network_player' &&
        character.connected &&
        !character.tags.has('state.retired') &&
        activeSource(character, locationId)
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
