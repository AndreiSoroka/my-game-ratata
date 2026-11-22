import {
    type CharacterSnapshot,
    healthPercent,
    type HealthSnapshot,
    MOVEMENT_RULES,
    type WorldGraveSnapshot,
} from '@my-game-ratata/contracts'

import { snapshotAbilityUsage } from './abilityUsage'
import type { GameCharacter } from './character'
import { createCharacterSheet } from './characterSheet'
import { hasStar } from './constellations'
import type { GraveCombatTarget } from './graveRules'
import type { NavigationService } from './navigation'
import { prayerParameters, snapshotPrayerParameters } from './prayerParameters'
import { publicProgression } from './progressionObservation'
import {
    energySegments,
    healthSegments,
    manaSegments,
    observeResource,
    observeSegmentedHealth,
    resourceChecks,
} from './resourceObservation'

export {
    observeCombatEvent,
    observeCombatEvents,
} from './combatEventObservation'

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
                          view.navigation.grid.tileWidth,
                          target.id === view.observer?.id &&
                              canReadPool(target, view, 'magic.mana3')
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

function canReadNumbers(view: CombatObserver): boolean {
    return view.observer?.exactCombatNumbers === true
}
