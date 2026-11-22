import {
    type AbilityId,
    type AbilityUsageSnapshot,
    BARRIER_RULES,
    CITY_PORTAL_MANA_FRACTION,
    isPrayerAction,
    MAGIC_ABILITY_RULES,
    PORTAL_LIFETIME_MS,
    type PrayerActionId,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { constellationModifiers } from './constellationModifiers'
import { effectiveAbility } from './effectiveParameters'
import { prayerParameters } from './prayerParameters'

/** Only capabilities the actor has attained may describe their public action geometry and costs. */
export function snapshotAbilityUsage(
    actor: GameCharacter,
    known: readonly AbilityId[],
    tileWidth = 0,
    canReadPortalMana = false
): Partial<Record<AbilityId, AbilityUsageSnapshot>> {
    const parameters: Partial<Record<AbilityId, AbilityUsageSnapshot>> = {}
    for (const id of known) {
        parameters[id] = isPrayerAction(id)
            ? prayerUsage(actor, id, tileWidth)
            : abilityUsage(actor, id, tileWidth, canReadPortalMana)
    }
    return parameters
}

function abilityUsage(
    actor: GameCharacter,
    id: AbilityId,
    tileWidth: number,
    canReadPortalMana: boolean
): AbilityUsageSnapshot {
    const { mana, energy, cooldownMs, range, windupMs, cycleMs, movementMs } =
        effectiveAbility(actor, id, tileWidth)
    return {
        mana: id === 'city_portal' && !canReadPortalMana ? 0 : mana,
        energy,
        cooldownMs,
        range,
        windupMs,
        cycleMs,
        movementMs,
        ...spellUsage(actor, id, tileWidth),
    }
}

function spellUsage(actor: GameCharacter, id: AbilityId, tileWidth: number) {
    if (id === 'chains') {
        const { chainsDurationMs, spellManaMultiplier } =
            constellationModifiers(actor)
        const rules = MAGIC_ABILITY_RULES.chains
        return {
            durationMs: chainsDurationMs,
            manaPerSecond: rules.drainManaPerSecond * spellManaMultiplier,
            ...(tileWidth > 0 ? { radius: rules.radiusTiles * tileWidth } : {}),
        }
    }
    if (
        tileWidth > 0 &&
        (id === 'dispel_magic' ||
            id === 'fireball' ||
            id === 'greater_fireball')
    ) {
        return { radius: MAGIC_ABILITY_RULES[id].radiusTiles * tileWidth }
    }
    if (id === 'barrier') {
        return {
            durationMs:
                BARRIER_RULES.durationMs +
                constellationModifiers(actor).barrierDurationBonus,
        }
    }
    if (id === 'city_portal') {
        return {
            durationMs: PORTAL_LIFETIME_MS,
            manaFraction:
                CITY_PORTAL_MANA_FRACTION *
                constellationModifiers(actor).spellManaMultiplier,
        }
    }
    return {}
}

function prayerUsage(
    actor: GameCharacter,
    abilityId: PrayerActionId,
    tileWidth: number
): AbilityUsageSnapshot {
    const prayer = prayerParameters(actor, tileWidth, abilityId)
    return {
        mana: prayer.manaCost,
        energy: 0,
        cooldownMs: prayer.durationMs,
        range: prayer.radius,
        windupMs: prayer.durationMs,
    }
}
