import {
    type GameEventPayload,
    type Vector2,
    WILDERNESS_AGGRO_POLICY,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { finishConstellationAction } from './constellations'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { visibilityRadius } from './queries'
import { canPerformSkillAction, trainSkill } from './skillProgression'

interface StealthPracticeState {
    locationId: string
    distance: number
    visited: Map<string, number>
    cells: number
    allowedAt: number
}
const progress = new WeakMap<GameCharacter, StealthPracticeState>()
const cellMemoryMs = 60_000
const normalSight = WILDERNESS_AGGRO_POLICY.sightRadius

/** Practice real unseen movement near an observer, not crouching safely or jittering in place. */
export function practiceStealthMovement(
    actor: GameCharacter,
    before: Vector2,
    characters: Iterable<GameCharacter>,
    navigation: NavigationService,
    now: number
): GameEventPayload[] {
    const moved = distance(before, actor.position)
    if (!validMovement(actor, moved, now)) {
        return []
    }
    const observers = [...characters].filter((observer) =>
        validObserver(actor, observer, now)
    )
    const close = observers.filter(
        (observer) =>
            distance(observer.position, actor.position) <= normalSight &&
            navigation.hasLineOfSight(observer.position, actor.position)
    )
    if (
        close.length === 0 ||
        close.some(
            (observer) =>
                distance(observer.position, actor.position) <=
                visibilityRadius(observer, actor, normalSight, now)
        )
    ) {
        return []
    }
    const state = stateFor(actor)
    state.distance += moved
    const tile = navigation.worldToTile(actor.position)
    const cell = `${String(tile.x)}:${String(tile.y)}`
    for (const [key, expiresAt] of state.visited) {
        if (now >= expiresAt) {
            state.visited.delete(key)
        }
    }
    if (!state.visited.has(cell)) {
        state.visited.set(cell, now + cellMemoryMs)
        state.cells += 1
    }
    if (state.distance < 64 || state.cells < 4 || now < state.allowedAt) {
        return []
    }
    state.distance = 0
    state.cells = 0
    state.allowedAt = now + 4_000
    return [
        ...trainSkill(actor, 'stealth'),
        ...finishConstellationAction(actor, { skillIds: ['stealth'], now }),
    ].map((event) => ({
        ...event,
        audienceIds: [actor.id],
    }))
}

function validMovement(
    actor: GameCharacter,
    moved: number,
    now: number
): boolean {
    return (
        moved > 0.01 &&
        moved <= 32 &&
        actor.movement.mode === 'sneaking' &&
        actor.movement.dashUntil <= now &&
        canPerformSkillAction(actor, now) &&
        actor.lastAttackAt + 1_000 <= now
    )
}

function validObserver(
    actor: GameCharacter,
    observer: GameCharacter,
    now: number
): boolean {
    if (
        actor === observer ||
        !observer.alive ||
        observer.tags.has('offline') ||
        observer.locationId !== actor.locationId ||
        observer.soul.companion?.leaderId === actor.id
    ) {
        return false
    }
    // Allied followers and human friends cannot be farmed by pacing beside them.
    return (
        canTargetByFaction(observer, actor, now) ||
        (observer.controllerKind !== 'network_player' &&
            observer.soul.controlSource !== 'human' &&
            observer.soul.canSpeak)
    )
}

function stateFor(actor: GameCharacter): StealthPracticeState {
    const existing = progress.get(actor)
    if (existing?.locationId === actor.locationId) {
        return existing
    }
    const state: StealthPracticeState = {
        locationId: actor.locationId,
        distance: 0,
        visited: new Map(),
        cells: 0,
        allowedAt: 0,
    }
    progress.set(actor, state)
    return state
}
