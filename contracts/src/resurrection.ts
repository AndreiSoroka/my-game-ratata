import type { PrayerAbilityId } from './abilities'
import type { DeityMood } from './progression'

export interface ResurrectionParameters {
    successChance: number
    hpFraction: number
    resourceFraction: number
    angelicChance: number
    minimumResource: number
}

export interface ResurrectionResources {
    hp: number
    mana: number
    energy: number
}
export const RESURRECTION_SUCCESS_CAP = 0.95
export const ANGELIC_RESURRECTION_CHANCE = 0.3

export const PRAYER_MOOD_BASE_CHANCE: Readonly<Record<DeityMood, number>> =
    Object.freeze({
        benevolent: 0.8,
        neutral: 0.55,
        wrathful: 0.25,
    })

/** Pure rule parameters: learning and target eligibility remain server-owned. */
export function resolveResurrectionParameters(
    abilityId: PrayerAbilityId,
    openedIds: ReadonlySet<string>,
    mood: DeityMood
): ResurrectionParameters {
    if (abilityId !== 'pray') {
        return {
            successChance: PRAYER_MOOD_BASE_CHANCE[mood],
            hpFraction: 0.5,
            resourceFraction: 0.5,
            angelicChance: 0,
            minimumResource: 0,
        }
    }
    const stable = openedIds.has('prayer.revive_stable')
    const bonus =
        Number(openedIds.has('prayer.revive_experienced')) * 0.1 +
        Number(openedIds.has('prayer.revive_master')) * 0.1 +
        Number(stable) * 0.05
    return {
        successChance: Math.min(
            RESURRECTION_SUCCESS_CAP,
            PRAYER_MOOD_BASE_CHANCE[mood] + bonus
        ),
        hpFraction: stable
            ? 1
            : openedIds.has('prayer.revive_higher')
              ? 0.75
              : 0.01,
        resourceFraction: 0.01,
        angelicChance: openedIds.has('prayer.revive_angelic')
            ? ANGELIC_RESURRECTION_CHANCE
            : 0,
        minimumResource: 1,
    }
}

/** Applying an Angelic result replaces all fractions; it never adds to a prior restoration. */
export function calculateResurrectionResources(
    parameters: ResurrectionParameters,
    maximums: ResurrectionResources,
    angelic = false
): ResurrectionResources {
    const empowered = angelic && parameters.angelicChance > 0
    const hpFraction = empowered ? 1.5 : parameters.hpFraction
    const resourceFraction = empowered ? 1.5 : parameters.resourceFraction
    return {
        hp: Math.max(1, Math.ceil(maximums.hp * hpFraction)),
        mana: Math.max(
            parameters.minimumResource,
            maximums.mana * resourceFraction
        ),
        energy: Math.max(
            parameters.minimumResource,
            maximums.energy * resourceFraction
        ),
    }
}
