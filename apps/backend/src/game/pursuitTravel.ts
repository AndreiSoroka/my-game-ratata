import {
    getWorldLocationDefinition,
    PURSUIT_RULES,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { pursuits, type PursuitState, returnFromPursuit } from './pursuitState'

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

/** A travel gate prevents a continuing dash or corner input from spending a second hop. */
export function canPursuitTravel(
    actor: GameCharacter,
    to: string,
    now: number
): boolean {
    const state = pursuits.get(actor)
    if (state === undefined) {
        return true
    }
    if (state.phase === 'return') {
        return (
            actor.locationId !== state.home.locationId &&
            to === state.home.locationId
        )
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
        now < exit.expiresAt
    ) {
        return true
    }
    returnFromPursuit(actor)
    return false
}

function cityBornMonster(actor: GameCharacter, state: PursuitState): boolean {
    return (
        actor.faction === 'monsters' &&
        getWorldLocationDefinition(state.home.locationId)?.biome === 'city'
    )
}

export function recordPursuitEntry(actor: GameCharacter, now: number): void {
    const state = pursuits.get(actor)
    if (state === undefined) {
        return
    }
    if (
        state.phase === 'chase' &&
        state.foreign === undefined &&
        state.crossing !== undefined
    ) {
        state.foreign = {
            locationId: actor.locationId,
            entry: { ...actor.position },
            until: now + PURSUIT_RULES.foreignDurationMs,
            exit: structuredClone(state.crossing),
        }
        state.lastKnown = { ...actor.position }
        delete state.crossing
    }
    actor.movement.dashUntil = 0
    actor.setMoveInput({ x: 0, y: 0 })
    state.lastPlanAt = -Infinity
}
