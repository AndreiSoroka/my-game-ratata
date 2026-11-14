import {
    type CharacterSnapshot,
    type GameEventPayload,
    healthPercent,
    type HealthSnapshot,
    trainingAreaAt,
    type WorldGraveSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { GraveCombatTarget } from './graveRules'
import type { NavigationService } from './navigation'
import { visibilityRadius } from './queries'

export interface CombatObserver {
    observer: GameCharacter | undefined
    getCharacter: (id: string) => GameCharacter | undefined
    navigation: NavigationService | undefined
    now: number
    hasModelLease?: (character: GameCharacter, now: number) => boolean
}

export function observeCharacterCombat(
    snapshot: CharacterSnapshot,
    target: GameCharacter | undefined,
    view: CombatObserver
): CharacterSnapshot {
    const exact = exactForTarget(view, snapshot.id)
    const health: HealthSnapshot =
        target === undefined
            ? snapshot.health
            : { kind: 'exact', current: target.hp, max: target.maxHp }
    const abilities = snapshot.abilities
    return {
        ...snapshot,
        health: exact
            ? health
            : { kind: 'percent', percent: healthPercent(health) },
        ...(abilities === undefined
            ? {}
            : {
                  abilities: {
                      ...abilities,
                      barrier:
                          abilities.barrier === null
                              ? null
                              : {
                                    expiresAt: abilities.barrier.expiresAt,
                                    ...(exact &&
                                    abilities.barrier.remaining !== undefined
                                        ? {
                                              remaining:
                                                  abilities.barrier.remaining,
                                          }
                                        : {}),
                                },
                  },
              }),
    }
}

export function observeGraveCombat(
    grave: GraveCombatTarget,
    view: CombatObserver
): WorldGraveSnapshot {
    const { hp, maxHp, ...description } = grave
    const exact: HealthSnapshot = { kind: 'exact', current: hp, max: maxHp }
    return {
        ...description,
        health:
            view.observer?.exactCombatNumbers === true
                ? exact
                : { kind: 'percent', percent: healthPercent(exact) },
    }
}

/** This projection never mutates the numeric domain event used by simulation services. */
export function observeCombatEvent(
    event: GameEventPayload,
    view: CombatObserver
): GameEventPayload | undefined {
    const { audienceIds, amount, ...description } = event
    const observerId = view.observer?.id
    if (
        audienceIds !== undefined &&
        (observerId === undefined || !audienceIds.includes(observerId))
    ) {
        return undefined
    }
    const visible = {
        ...description,
        ...(amount !== undefined && amountVisible(event, view)
            ? { amount }
            : {}),
    }
    if (event.kind === 'water_drink' && !exactForTarget(view, event.actorId)) {
        visible.text = 'Пьёт воду.'
    }
    return visible
}

export function observeCombatEvents(
    events: readonly GameEventPayload[],
    view: CombatObserver
): GameEventPayload[] {
    return events.flatMap((event) => {
        const projected = observeCombatEvent(event, view)
        return projected === undefined ? [] : [projected]
    })
}

function exactForTarget(
    view: CombatObserver,
    targetId: string | undefined
): boolean {
    return (
        view.observer !== undefined &&
        (view.observer.exactCombatNumbers || view.observer.id === targetId)
    )
}

function amountVisible(event: GameEventPayload, view: CombatObserver): boolean {
    if (view.observer?.exactCombatNumbers === true) {
        return true
    }
    if (event.kind === 'damage' || event.kind === 'world_damage') {
        return trainingMeasurement(event, view)
    }
    if (
        ['heal', 'absorb', 'item_eat', 'revive'].includes(event.kind) ||
        (event.kind === 'status' && event.statusId === 'barrier')
    ) {
        return exactForTarget(view, event.targetId ?? event.actorId)
    }
    return true
}

function trainingMeasurement(
    event: GameEventPayload,
    view: CombatObserver
): boolean {
    const observer = view.observer
    const target =
        event.targetId === undefined
            ? undefined
            : view.getCharacter(event.targetId)
    if (
        !activeObserver(observer, view) ||
        target?.trainingTarget === undefined ||
        target.locationId !== observer.locationId ||
        view.navigation === undefined
    ) {
        return false
    }
    const area = trainingAreaAt(
        view.navigation.grid.training?.areas ?? [],
        observer.locationId,
        observer.position
    )
    return (
        area?.id === target.trainingTarget.areaId &&
        Math.hypot(
            target.position.x - observer.position.x,
            target.position.y - observer.position.y
        ) <= visibilityRadius(observer, target, 240, view.now) &&
        view.navigation.hasLineOfSight(observer.position, target.position)
    )
}
function activeObserver(
    observer: GameCharacter | undefined,
    view: CombatObserver
): observer is GameCharacter {
    return (
        observer !== undefined &&
        observer.alive &&
        (observer.connected ||
            view.hasModelLease?.(observer, view.now) === true) &&
        !observer.tags.has('offline') &&
        !observer.tags.has('state.retired')
    )
}
