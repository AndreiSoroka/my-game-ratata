import {
    PURSUIT_RULES,
    WILDERNESS_AGGRO_POLICY,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import { available, humanControlled } from './crimeRules'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import {
    approachPortal,
    approachPursuitExit,
    approachRegionalHome,
    homeExit,
    planHomeArrival,
    planPursuit,
} from './pursuitNavigation'
import {
    clearPursuit,
    insideTerritory,
    pursuitHome,
    pursuits,
    type PursuitState,
    returnFromPursuit,
} from './pursuitState'
import { visibilityRadius } from './queries'
import type { GameRoom } from './room'

interface PursuitDecision {
    target?: GameCharacter
    handled: boolean
    returning: boolean
}

/** Dashing skips path replanning, not the observer's ordinary perception of an exit. */
export function refreshPursuitObservation(
    actor: GameCharacter,
    room: GameRoom,
    now: number
): void {
    const state = pursuits.get(actor)
    if (state?.phase !== 'chase') {
        return
    }
    const target = room.getCharacter(state.targetId)
    if (
        target !== undefined &&
        seen(actor, target, room, now, state.sightRadius)
    ) {
        state.lastKnown = { ...target.position }
        state.lastSeenAt = now
    }
}

/** Controllers receive a legal target or an ordinary navigation intention, never a position mutation. */
export function advancePursuit(
    actor: GameCharacter,
    candidate: GameCharacter | undefined,
    room: GameRoom,
    now: number,
    sightRadius: number = WILDERNESS_AGGRO_POLICY.sightRadius
): PursuitDecision {
    if (!available(actor) || humanControlled(actor)) {
        clearPursuit(actor)
        return { handled: false, returning: false }
    }
    const state =
        pursuits.get(actor) ?? acquire(actor, candidate, room, now, sightRadius)
    if (state === undefined) {
        return { handled: false, returning: false }
    }
    const target = room.getCharacter(state.targetId)
    if (mustReturn(actor, target, state, now)) {
        returnFromPursuit(actor)
    }
    if (state.phase === 'return') {
        return returnHome(actor, candidate, state, room, now)
    }
    if (
        target !== undefined &&
        seen(actor, target, room, now, state.sightRadius)
    ) {
        if (outsideChase(actor, target, state)) {
            returnFromPursuit(actor)
            return returnHome(actor, candidate, state, room, now)
        }
        state.lastKnown = { ...target.position }
        state.lastSeenAt = now
        delete state.crossing
        return { target, handled: true, returning: false }
    }
    return investigateExit(actor, state, room, now)
}

function acquire(
    actor: GameCharacter,
    candidate: GameCharacter | undefined,
    room: GameRoom,
    now: number,
    sightRadius: number
): PursuitState | undefined {
    if (
        candidate === undefined ||
        !seen(actor, candidate, room, now, sightRadius)
    ) {
        return undefined
    }
    const state: PursuitState = {
        phase: 'chase',
        targetId: candidate.id,
        home: structuredClone(pursuitHome(actor)),
        lastKnown: { ...candidate.position },
        lastSeenAt: now,
        lastPlanAt: -Infinity,
        sightRadius,
    }
    pursuits.set(actor, state)
    return state
}

function outsideChase(
    actor: GameCharacter,
    target: GameCharacter,
    state: PursuitState
): boolean {
    return (
        (state.foreign === undefined &&
            !insideTerritory(actor, target.position)) ||
        (state.foreign !== undefined &&
            distance(target.position, state.foreign.entry) >
                PURSUIT_RULES.foreignRadius)
    )
}

function mustReturn(
    actor: GameCharacter,
    target: GameCharacter | undefined,
    state: PursuitState,
    now: number
): boolean {
    if (
        !available(target) ||
        !canTargetByFaction(actor, target, now) ||
        (state.foreign === undefined && !insideTerritory(actor, actor.position))
    ) {
        return true
    }
    if (
        target.locationId !== actor.locationId &&
        state.crossing === undefined &&
        state.foreign === undefined
    ) {
        return true
    }
    const foreign = state.foreign
    return (
        foreign !== undefined &&
        (now >= foreign.until ||
            actor.locationId !== foreign.locationId ||
            target.locationId !== actor.locationId ||
            distance(actor.position, foreign.entry) >=
                PURSUIT_RULES.foreignRadius)
    )
}

function investigateExit(
    actor: GameCharacter,
    state: PursuitState,
    room: GameRoom,
    now: number
): PursuitDecision {
    const navigation = room.navigationFor(actor)
    const exit = state.crossing
    if (exit?.from === actor.locationId && now < exit.expiresAt) {
        if (!('endpointId' in exit)) {
            approachPursuitExit(actor, exit, state, navigation, now)
            return { handled: true, returning: false }
        }
        if (approachPortal(actor, exit.endpointId, state, room, now)) {
            return { handled: true, returning: false }
        }
    }
    if (
        exit !== undefined ||
        now - state.lastSeenAt >= PURSUIT_RULES.observedExitMs ||
        distance(actor.position, state.lastKnown) <= 3
    ) {
        returnFromPursuit(actor)
        return returnHome(actor, undefined, state, room, now)
    }
    planPursuit(actor, state.lastKnown, state, navigation, now)
    return { handled: true, returning: false }
}

function returnHome(
    actor: GameCharacter,
    candidate: GameCharacter | undefined,
    state: PursuitState,
    room: GameRoom,
    now: number
): PursuitDecision {
    const navigation = room.navigationFor(actor)
    const contact = contactTarget(actor, candidate, room, now)
    if (contact !== undefined) {
        return { target: contact, handled: true, returning: true }
    }
    if (actor.locationId === state.home.locationId) {
        if (
            distance(actor.position, state.home.position) <=
            PURSUIT_RULES.homeArrivalRadius
        ) {
            clearPursuit(actor)
            return { handled: true, returning: true }
        }
        planHomeArrival(actor, state, navigation, now)
    } else if (
        state.foreign?.exit !== undefined &&
        'endpointId' in state.foreign.exit
    ) {
        if (
            !approachPortal(
                actor,
                state.foreign.exit.returnEndpointId,
                state,
                room,
                now
            )
        ) {
            approachRegionalHome(actor, state, room, now)
        }
    } else {
        const exit = homeExit(actor, state, navigation)
        if (exit !== undefined) {
            approachPursuitExit(actor, exit, state, navigation, now)
        }
    }
    return { handled: true, returning: true }
}

function contactTarget(
    actor: GameCharacter,
    candidate: GameCharacter | undefined,
    room: GameRoom,
    now: number
): GameCharacter | undefined {
    if (inContact(actor, candidate, room, now)) {
        return candidate
    }
    const nearby = room.findVisibleTarget(actor, 32)
    return inContact(actor, nearby, room, now) ? nearby : undefined
}

function inContact(
    actor: GameCharacter,
    target: GameCharacter | undefined,
    room: GameRoom,
    now: number
): target is GameCharacter {
    if (target === undefined || !seen(actor, target, room, now, 32)) {
        return false
    }
    actor.updateFacing({
        x: target.position.x - actor.position.x,
        y: target.position.y - actor.position.y,
    })
    return isTargetInAttackRange(
        actor,
        target,
        room.navigationFor(actor).grid.tileWidth
    )
}

function seen(
    actor: GameCharacter,
    target: GameCharacter,
    room: GameRoom,
    now: number,
    radius: number
): boolean {
    return (
        available(target) &&
        target.locationId === actor.locationId &&
        canTargetByFaction(actor, target, now) &&
        distance(actor.position, target.position) <=
            visibilityRadius(actor, target, radius, now) &&
        room
            .navigationFor(actor)
            .hasLineOfSight(actor.position, target.position)
    )
}
