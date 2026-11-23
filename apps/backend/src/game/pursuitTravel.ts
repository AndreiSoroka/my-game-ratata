import {
    getWorldLocationDefinition,
    PURSUIT_RULES,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { PortalPassage } from './cityPortals'
import { available } from './crimeRules'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import { canMobFleeTravel, recordMobFleeArrival } from './mobFlee'
import type { NavigationService } from './navigation'
import {
    pursuits,
    type PursuitState,
    returnFromPursuit,
    territories,
} from './pursuitState'
import { visibilityRadius } from './queries'
import { regionalRoute } from './regionalNavigation'

/** Called at the real exit while observers still occupy the source map. */
export function rememberPursuitExit(
    target: GameCharacter,
    from: string,
    edge: Vector2,
    direction: Vector2,
    characters: Iterable<GameCharacter>,
    navigation: NavigationService,
    now: number
): void {
    for (const actor of characters) {
        const state = pursuits.get(actor)
        if (
            state?.phase !== 'chase' ||
            state.targetId !== target.id ||
            state.lastSeenAt !== now ||
            actor.locationId !== from ||
            distance(actor.position, edge) > state.sightRadius ||
            !navigation.hasLineOfSight(actor.position, edge)
        ) {
            continue
        }
        if (state.foreign !== undefined) {
            returnFromPursuit(actor)
            continue
        }
        state.crossing = {
            from,
            to: target.locationId,
            edge: { ...edge },
            direction: { ...direction },
            expiresAt: now + PURSUIT_RULES.observedExitMs,
        }
    }
}

export function rememberPursuitPortal(
    target: GameCharacter,
    passage: PortalPassage,
    characters: Iterable<GameCharacter>,
    navigation: NavigationService,
    now: number
): void {
    const { source, destination } = passage
    for (const actor of characters) {
        const state = pursuits.get(actor)
        if (
            state?.phase !== 'chase' ||
            state.targetId !== target.id ||
            actor.locationId !== source.locationId ||
            !available(actor) ||
            !canTargetByFaction(actor, target, now) ||
            !seesPortalCrossing(
                actor,
                target,
                source.position,
                state.sightRadius,
                navigation,
                now
            )
        ) {
            continue
        }
        if (state.foreign !== undefined) {
            returnFromPursuit(actor)
            continue
        }
        state.crossing = {
            from: source.locationId,
            to: destination.locationId,
            edge: { ...source.position },
            endpointId: source.id,
            returnEndpointId: destination.id,
            expiresAt: Math.min(
                source.expiresAt,
                now + PURSUIT_RULES.observedExitMs
            ),
        }
    }
}

function seesPortalCrossing(
    observer: GameCharacter,
    target: GameCharacter,
    point: Vector2,
    radius: number,
    navigation: NavigationService,
    now: number
): boolean {
    return (
        distance(observer.position, target.position) <=
            visibilityRadius(observer, target, radius, now) &&
        distance(observer.position, point) <= radius &&
        navigation.hasLineOfSight(observer.position, target.position) &&
        navigation.hasLineOfSight(observer.position, point)
    )
}

/** A travel gate prevents a continuing dash or corner input from spending a second hop. */
export function canPursuitTravel(
    actor: GameCharacter,
    to: string,
    now: number
): boolean {
    if (canMobFleeTravel(actor, to, now)) {
        return true
    }
    const state = pursuits.get(actor)
    if (state === undefined) {
        return !territories.has(actor)
    }
    if (state.phase === 'return') {
        return canReturnByEdge(actor, state, to)
    }
    if (cityBornMonster(actor, state)) {
        returnFromPursuit(actor)
        return false
    }
    const exit = state.crossing
    if (
        state.foreign === undefined &&
        actor.locationId === state.home.locationId &&
        exit?.from === actor.locationId &&
        exit.to === to &&
        !('endpointId' in exit) &&
        now < exit.expiresAt
    ) {
        return true
    }
    returnFromPursuit(actor)
    return false
}

function canReturnByEdge(
    actor: GameCharacter,
    state: PursuitState,
    to: string
): boolean {
    const exit = state.foreign?.exit
    if (exit !== undefined && 'endpointId' in exit) {
        return (
            regionalRoute(actor.locationId, state.home.locationId)?.[1] === to
        )
    }
    return (
        actor.locationId !== state.home.locationId &&
        to === state.home.locationId
    )
}

function cityBornMonster(actor: GameCharacter, state: PursuitState): boolean {
    return (
        actor.faction === 'monsters' &&
        getWorldLocationDefinition(state.home.locationId)?.biome === 'city'
    )
}

export function recordPursuitEntry(actor: GameCharacter, now: number): void {
    if (recordMobFleeArrival(actor, now)) {
        return
    }
    const state = pursuits.get(actor)
    if (state === undefined) {
        return
    }
    if (
        state.phase === 'chase' &&
        state.foreign === undefined &&
        state.crossing !== undefined &&
        !('endpointId' in state.crossing)
    ) {
        recordForeignEntry(actor, state, state.crossing, now)
    }
    actor.movement.dashUntil = 0
    actor.setMoveInput({ x: 0, y: 0 })
    state.lastPlanAt = -Infinity
}

export function recordPursuitPortalEntry(
    actor: GameCharacter,
    passage: PortalPassage,
    now: number
): void {
    const state = pursuits.get(actor)
    const crossing = state?.crossing
    if (
        state?.phase === 'chase' &&
        state.foreign === undefined &&
        crossing !== undefined &&
        'endpointId' in crossing &&
        crossing.endpointId === passage.source.id &&
        now < crossing.expiresAt
    ) {
        recordForeignEntry(actor, state, crossing, now)
    }
    if (state !== undefined) {
        state.lastPlanAt = -Infinity
    }
}

export function pursuitPortalHomecoming(
    actor: GameCharacter,
    to: string
): boolean {
    const state = pursuits.get(actor)
    const exit = state?.foreign?.exit
    return (
        state?.phase === 'return' &&
        state.home.locationId === to &&
        exit !== undefined &&
        'endpointId' in exit
    )
}

function recordForeignEntry(
    actor: GameCharacter,
    state: PursuitState,
    exit: NonNullable<PursuitState['crossing']>,
    now: number
): void {
    state.foreign = {
        locationId: actor.locationId,
        entry: { ...actor.position },
        until: now + PURSUIT_RULES.foreignDurationMs,
        exit: structuredClone(exit),
    }
    state.lastKnown = { ...actor.position }
    delete state.crossing
}
