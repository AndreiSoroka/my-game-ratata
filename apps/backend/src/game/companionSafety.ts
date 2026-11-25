import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import type { CompanionRuntime } from './companionMovement'
import { advanceCompanionTravel } from './companionNavigation'
import { availableLeader, release } from './companionState'
import { distance } from './math'
import type { GameRoom } from './room'

interface KaplyaSafety {
    returning: boolean
    fleeing: boolean
    plannedAt: number
}

const kaplyaSafety = new WeakMap<GameCharacter, KaplyaSafety>()

export function kaplyaSafetyActive(actor: GameCharacter): boolean {
    const safety = kaplyaSafety.get(actor)
    return safety?.returning === true || safety?.fleeing === true
}

export function visibleKaplyaThreat(
    actor: GameCharacter,
    room: GameRoom,
    now: number
): GameCharacter | undefined {
    return room.findVisibleTarget(actor, 240, now)
}

/** Survival and leader death take precedence over leases, conversations and user scenarios. */
export function prepareCompanionSafety(
    actor: GameCharacter,
    state: CompanionRuntime,
    room: GameRoom,
    now: number
): boolean {
    if (!availableLeader(actor)) {
        if (state.leaderId !== null) {
            release(actor, state)
        }
        kaplyaSafety.delete(actor)
        return false
    }
    const lostLeader = leaderLoss(state, room)
    if (lostLeader !== undefined) {
        release(actor, state)
    }
    if (actor.id !== 'npc_magic_slime_1') {
        if (lostLeader !== undefined) {
            releaseRoute(actor, state, room, now)
        }
        return false
    }
    return advanceKaplyaSafety(actor, state, room, now, lostLeader)
}

function leaderLoss(
    state: CompanionRuntime,
    room: GameRoom
): 'died' | 'unavailable' | undefined {
    if (state.leaderId === null) {
        return undefined
    }
    const leader = room.getCharacter(state.leaderId)
    if (
        leader === undefined ||
        !leader.alive ||
        leader.tags.has('state.retired') ||
        (state.leaderDeathSequence !== undefined &&
            state.leaderDeathSequence !== leader.deathSequence)
    ) {
        return 'died'
    }
    return availableLeader(leader) ? undefined : 'unavailable'
}

function advanceKaplyaSafety(
    actor: GameCharacter,
    state: CompanionRuntime,
    room: GameRoom,
    now: number,
    lostLeader: ReturnType<typeof leaderLoss>
): boolean {
    const previous = kaplyaSafety.get(actor)
    const threat = visibleKaplyaThreat(actor, room, now)
    const fleeing = threat !== undefined
    const returning = previous?.returning === true || lostLeader === 'died'
    if (!returning && !fleeing) {
        if (lostLeader !== undefined || previous !== undefined) {
            releaseRoute(actor, state, room, now)
        }
        kaplyaSafety.delete(actor)
        return false
    }
    const { safety, changed } = recordSafety(
        actor,
        previous,
        returning,
        fleeing
    )
    if (changed || lostLeader !== undefined) {
        releaseRoute(actor, state, room, now)
    }
    if (threat !== undefined) {
        flee(actor, threat, safety, room, now)
        return true
    }
    if (advanceReturn(actor, state, safety, room, now)) {
        return true
    }
    kaplyaSafety.delete(actor)
    return false
}

function recordSafety(
    actor: GameCharacter,
    previous: KaplyaSafety | undefined,
    returning: boolean,
    fleeing: boolean
): { safety: KaplyaSafety; changed: boolean } {
    const changed =
        previous?.fleeing !== fleeing || previous.returning !== returning
    const safety = {
        returning,
        fleeing,
        plannedAt: changed ? -Infinity : previous.plannedAt,
    }
    kaplyaSafety.set(actor, safety)
    return { safety, changed }
}

function releaseRoute(
    actor: GameCharacter,
    state: CompanionRuntime,
    room: GameRoom,
    now: number
): void {
    room.cancelNpcModelTurn(actor.id, now)
    room.adventureForWorkers().closeConversations(actor.id)
    const exchange = room.social.exchanges.snapshot(actor.id)
    if (exchange?.status === 'invited' || exchange?.status === 'active') {
        room.social.exchanges.handle(
            actor,
            { type: 'exchange_cancel', exchangeId: exchange.id },
            now
        )
    }
    cancelCharacterControl(actor)
    actor.setMoveInput({ x: 0, y: 0 })
    actor.clearPath()
    delete state.regionalLeg
    state.lastPlanAt = -Infinity
}

function advanceReturn(
    actor: GameCharacter,
    state: CompanionRuntime,
    safety: KaplyaSafety,
    room: GameRoom,
    now: number
): boolean {
    if (actor.locationId !== CENTER_LOCATION_ID) {
        advanceCompanionTravel(actor, CENTER_LOCATION_ID, state, room, now)
        return true
    }
    const navigation = room.navigationFor(actor)
    const { width, height } = navigation.grid
    const home = navigation.findWalkableTileNear(
        navigation.worldToTile(actor.spawnPosition),
        (tile) =>
            tile.x > 0 &&
            tile.y > 0 &&
            tile.x < width - 1 &&
            tile.y < height - 1
    )
    const destination =
        home === undefined ? undefined : navigation.tileToWorld(home)
    if (
        destination === undefined ||
        distance(actor.position, destination) <= 8
    ) {
        actor.setPath([])
        return false
    }
    if (!actor.hasPath() && now >= safety.plannedAt + 500) {
        safety.plannedAt = now
        actor.setPath(navigation.findPathWorld(actor.position, destination))
    }
    return true
}

function flee(
    actor: GameCharacter,
    threat: GameCharacter,
    safety: KaplyaSafety,
    room: GameRoom,
    now: number
): void {
    if (now < safety.plannedAt + 400) {
        return
    }
    const navigation = room.navigationFor(actor)
    safety.plannedAt = now
    const separation = distance(actor.position, threat.position)
    const { tileWidth, tileHeight, worldWidth, worldHeight } =
        navigation.summary
    const away = (point: GameCharacter['position']) =>
        distance(point, threat.position) >= separation - tileWidth / 2
    const remaining = actor.remainingPath()
    const existingEnd = remaining.at(-1)
    if (
        existingEnd !== undefined &&
        distance(existingEnd, threat.position) > separation + tileWidth &&
        remaining.every(away)
    ) {
        return
    }
    const angle = Math.atan2(
        actor.position.y - threat.position.y,
        actor.position.x - threat.position.x
    )
    const options = [
        0,
        Math.PI / 4,
        -Math.PI / 4,
        Math.PI / 2,
        -Math.PI / 2,
        Math.PI,
        Math.PI / 4,
        -Math.PI / 4,
    ]
        .map((offset, index) => {
            const stride = index >= 6 ? 3 : 6
            return {
                x: Math.min(
                    worldWidth - tileWidth,
                    Math.max(
                        tileWidth,
                        actor.position.x +
                            Math.cos(angle + offset) * tileWidth * stride
                    )
                ),
                y: Math.min(
                    worldHeight - tileHeight,
                    Math.max(
                        tileHeight,
                        actor.position.y +
                            Math.sin(angle + offset) * tileHeight * stride
                    )
                ),
            }
        })
        .flatMap((point) => {
            const path = navigation.findPathWorld(actor.position, point)
            return distance(point, threat.position) > separation + tileWidth &&
                path.length > 0 &&
                path.every(away)
                ? [{ point, path }]
                : []
        })
    const sheltered = options.find(
        ({ point }) => !navigation.hasLineOfSight(threat.position, point)
    )
    actor.setPath((sheltered ?? options[0])?.path ?? [])
}
