import {
    abilityIds,
    type CharacterResourceChecks,
    type ExactHealthSnapshot,
    FARM_SOW_ENERGY,
    healthNeedsRestoration,
    isMotherPrayer,
    isPrayerAction,
    type PercentHealthSnapshot,
    prayerActionIds,
    prayerManaCost,
    type ResourceCheck,
    resourceFillPercent,
    type ResourceSnapshot,
    TREE_PLANT_ENERGY,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { constellationModifiers } from './constellationModifiers'
import { hasStar } from './constellations'
import {
    effectiveAbility,
    effectiveDashCost,
    effectiveTheftCost,
    effectiveWorkEnergy,
} from './effectiveParameters'
import { effectiveMaxMana } from './effectiveResources'
import { hasMotherPrayerAura } from './motherPrayerPlan'

const coarseSegments = Object.freeze([40, 20, 20, 20])
const fineSegments = Object.freeze([30, 20, 10, 10, 10, 10, 10])
const tenths = Object.freeze(Array<number>(10).fill(10))

export function healthSegments(owner: GameCharacter | undefined) {
    if (owner === undefined || hasStar(owner, 'life.hp3')) {
        return undefined
    }
    if (hasStar(owner, 'life.hp2')) {
        return tenths
    }
    return hasStar(owner, 'life.hp1') ? fineSegments : coarseSegments
}

export function energySegments(owner: GameCharacter | undefined) {
    if (owner === undefined || hasStar(owner, 'life.energy2')) {
        return undefined
    }
    return hasStar(owner, 'life.energy1') ? fineSegments : coarseSegments
}

export function observeResource(
    resource: ResourceSnapshot,
    exact: boolean,
    segments?: readonly number[]
): ResourceSnapshot {
    if (exact) {
        return { ...resource }
    }
    if (resource.kind === 'percent') {
        return {
            kind: 'percent',
            percent: resource.percent,
            hasCapacity: resource.hasCapacity,
        }
    }
    if (segments !== undefined) {
        return {
            ...observeSegmentedHealth(resource, segments),
            hasCapacity: resource.max > 0,
        }
    }
    return {
        kind: 'percent',
        percent: resourceFillPercent(resource),
        hasCapacity: resource.max > 0,
    }
}

/** Round up to the end of the segment containing the actual value. */
export function observeSegmentedHealth(
    health: ExactHealthSnapshot,
    segments: readonly number[]
): PercentHealthSnapshot {
    let percent = 0
    if (health.current > 0 && health.max > 0) {
        for (const width of segments) {
            percent += width
            if (health.current <= health.max * (percent / 100)) {
                break
            }
        }
    }
    return {
        kind: 'percent',
        percent,
        segments,
        needsRestoration: healthNeedsRestoration(health),
    }
}

export function resourceChecks(
    character: GameCharacter
): CharacterResourceChecks {
    const check = (mana: number, energy = 0): ResourceCheck =>
        character.mana < mana
            ? 'mana'
            : character.energy < energy
              ? 'energy'
              : 'ready'
    const sowEnergyCost = effectiveWorkEnergy(character, FARM_SOW_ENERGY)
    return {
        abilities: Object.fromEntries(
            abilityIds
                .filter((id) => !isPrayerAction(id))
                .map((id) => {
                    const ability = effectiveAbility(character, id)
                    return [id, check(ability.mana, ability.energy)]
                })
        ) as CharacterResourceChecks['abilities'],
        prayers: Object.fromEntries(
            prayerActionIds.map((id) => [
                id,
                {
                    devotion: check(
                        isMotherPrayer(id) &&
                            (hasMotherPrayerAura(character) ||
                                constellationModifiers(character)
                                    .prayerLastLight)
                            ? minimumMotherCost(character)
                            : 0
                    ),
                    restore: check(
                        isMotherPrayer(id)
                            ? minimumMotherCost(character)
                            : prayerManaCost('restore', id)
                    ),
                    harm: check(
                        isMotherPrayer(id)
                            ? minimumMotherCost(character)
                            : prayerManaCost('harm', id)
                    ),
                    ward: check(
                        isMotherPrayer(id) ? minimumMotherCost(character) : 5
                    ),
                    revive: check(
                        isMotherPrayer(id)
                            ? minimumMotherCost(character)
                            : prayerManaCost('revive', id)
                    ),
                    purify_grave: check(
                        isMotherPrayer(id)
                            ? minimumMotherCost(character)
                            : prayerManaCost('purify_grave', id)
                    ),
                },
            ])
        ) as CharacterResourceChecks['prayers'],
        dash: check(0, effectiveDashCost(character)),
        sow: check(0, sowEnergyCost),
        sowEnergyCost,
        plantEnergyCost: effectiveWorkEnergy(character, TREE_PLANT_ENERGY),
        steal: check(0, effectiveTheftCost(character)),
    }
}

function minimumMotherCost(character: GameCharacter): number {
    return constellationModifiers(character).prayerLastLight
        ? effectiveMaxMana(character) * 0.3
        : 5
}
