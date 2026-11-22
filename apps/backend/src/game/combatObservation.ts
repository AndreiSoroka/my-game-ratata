import {
    type CharacterSnapshot,
    type GameEventPayload,
    healthPercent,
    type HealthSnapshot,
    MOVEMENT_RULES,
    trainingAreaAt,
    type WorldGraveSnapshot,
} from '@my-game-ratata/contracts'

import { snapshotAbilityUsage } from './abilityUsage'
import type { GameCharacter } from './character'
import { createCharacterSheet } from './characterSheet'
import { hasStar } from './constellations'
import type { GraveCombatTarget } from './graveRules'
import type { NavigationService } from './navigation'
import { canPerceivePrayerCaster } from './prayerAuras'
import { prayerParameters, snapshotPrayerParameters } from './prayerParameters'
import { publicProgression } from './progressionObservation'
import { visibilityRadius } from './queries'
import {
    energySegments,
    healthSegments,
    manaSegments,
    observeResource,
    observeSegmentedHealth,
    resourceChecks,
} from './resourceObservation'

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
    const description = { ...snapshot }
    const owner = target?.id === view.observer?.id ? target : undefined
    delete description.resourceChecks
    delete description.characterSheet
    delete description.stats
    if (view.observer?.id !== snapshot.id && description.combat !== undefined) {
        description.combat = { ...description.combat }
        delete description.combat.combo
    }
    if (
        view.observer?.id !== snapshot.id &&
        description.progression !== undefined
    ) {
        description.progression = publicProgression(description.progression)
    }
    return {
        ...description,
        health: observedHealth(snapshot, target, owner, view),
        resources: {
            mana: observeResource(
                snapshot.resources.mana,
                canReadPool(target, view, 'magic.mana3'),
                manaSegments(owner)
            ),
            energy: observeResource(
                snapshot.resources.energy,
                canReadPool(target, view, 'life.energy3'),
                energySegments(owner)
            ),
        },
        ...privateSheet(target, view),
        ...observedAbilities(snapshot.abilities, target, view),
    }
}

function canReadPool(
    target: GameCharacter | undefined,
    view: CombatObserver,
    star: string
): boolean {
    return (
        canReadNumbers(view) ||
        (target !== undefined &&
            target.id === view.observer?.id &&
            hasStar(target, star))
    )
}

function observedHealth(
    snapshot: CharacterSnapshot,
    target: GameCharacter | undefined,
    owner: GameCharacter | undefined,
    view: CombatObserver
): HealthSnapshot {
    const health: HealthSnapshot =
        target === undefined
            ? snapshot.health
            : { kind: 'exact', current: target.hp, max: target.maxHp }
    if (canReadPool(target, view, 'life.hp4')) {
        return health
    }
    const segments = healthSegments(owner)
    return segments !== undefined && health.kind === 'exact'
        ? observeSegmentedHealth(health, segments)
        : { kind: 'percent', percent: healthPercent(health) }
}

function privateSheet(
    target: GameCharacter | undefined,
    view: CombatObserver
): Pick<CharacterSnapshot, 'resourceChecks' | 'characterSheet'> {
    if (target === undefined || target.id !== view.observer?.id) {
        return {}
    }
    return {
        resourceChecks: resourceChecks(target, view.now),
        characterSheet: createCharacterSheet(
            target,
            view.navigation?.grid.tileWidth ?? MOVEMENT_RULES.stepDistance
        ),
    }
}

function observedAbilities(
    abilities: CharacterSnapshot['abilities'],
    target: GameCharacter | undefined,
    view: CombatObserver
): Pick<CharacterSnapshot, 'abilities'> {
    if (abilities === undefined) {
        return {}
    }
    return {
        abilities: {
            ...abilities,
            ...(target !== undefined && view.navigation !== undefined
                ? {
                      ...(abilities.known.includes('pray')
                          ? {
                                prayer: prayerParameters(
                                    target,
                                    view.navigation.grid.tileWidth
                                ),
                            }
                          : {}),
                      prayers: snapshotPrayerParameters(
                          target,
                          abilities.known,
                          view.navigation.grid.tileWidth
                      ),
                      parameters: snapshotAbilityUsage(
                          target,
                          abilities.known,
                          view.navigation.grid.tileWidth
                      ),
                  }
                : {}),
            barrier:
                abilities.barrier === null
                    ? null
                    : {
                          expiresAt: abilities.barrier.expiresAt,
                          ...(canReadNumbers(view) &&
                          abilities.barrier.remaining !== undefined
                              ? { remaining: abilities.barrier.remaining }
                              : {}),
                      },
        },
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
    if (!eventCharacterVisible(event.targetId, view)) {
        return undefined
    }
    const visible = {
        ...description,
        ...(amount !== undefined && amountVisible(event, view)
            ? { amount }
            : {}),
    }
    if (!eventCharacterVisible(event.actorId, view)) {
        delete visible.actorId
        delete visible.projectile
    }
    if (event.kind === 'water_drink' && !canReadNumbers(view)) {
        visible.text = 'Пьёт воду.'
    }
    return visible
}

function eventCharacterVisible(
    id: string | undefined,
    view: CombatObserver
): boolean {
    if (id === undefined || view.observer === undefined) {
        return true
    }
    const character = view.getCharacter(id)
    return (
        character === undefined ||
        canPerceivePrayerCaster(view.observer, character, view.now)
    )
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

function canReadNumbers(view: CombatObserver): boolean {
    return view.observer?.exactCombatNumbers === true
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
        return canReadNumbers(view)
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
