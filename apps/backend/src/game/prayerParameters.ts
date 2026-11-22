import {
    ABILITY_DEFINITIONS,
    type AbilityId,
    isMotherPrayer,
    isPrayerAction,
    type PrayerActionId,
    type PrayerParametersSnapshot,
    ROAD_PRAYER_RULES,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { constellationModifiers, hasStar } from './constellations'

/** The same resolved parameters drive validation, controllers and presentation. */
export function prayerParameters(
    actor: GameCharacter,
    tileWidth = 0,
    abilityId: PrayerActionId = 'pray'
): PrayerParametersSnapshot {
    const definition = ABILITY_DEFINITIONS[abilityId]
    if (!isMotherPrayer(abilityId)) {
        return {
            radius: definition.range,
            durationMs: definition.windupMs,
            manaCost: definition.mana,
            area: false,
            harm: false,
            ...(abilityId === 'pray_road'
                ? {
                      energyRecoveryRadius:
                          definition.range *
                          Math.sqrt(
                              hasStar(actor, 'prayer_road.bard')
                                  ? ROAD_PRAYER_RULES.bardAreaMultiplier
                                  : 1
                          ),
                  }
                : {}),
        }
    }
    const modifiers = constellationModifiers(actor)
    return {
        radius:
            ABILITY_DEFINITIONS.pray.range +
            modifiers.prayerRadiusCells * tileWidth,
        durationMs: Math.round(
            ABILITY_DEFINITIONS.pray.windupMs *
                modifiers.prayerDurationMultiplier
        ),
        manaCost: ABILITY_DEFINITIONS.pray.mana,
        area: abilityId === 'pray_woven',
        targetLimit: modifiers.targetLimit,
        wardRank: modifiers.prayerWardRank,
        hasAuras:
            modifiers.prayerWardRank > 0 ||
            modifiers.prayerAuraProtection ||
            modifiers.prayerAuraBlessing ||
            modifiers.prayerAuraDomain,
        aurasSuppressed: actor.abilities.prayerAurasSuppressed,
        cost: {
            manaPerTarget: 5,
            ...(modifiers.prayerLastLight ? { healingManaFraction: 0.3 } : {}),
        },
        harm: hasStar(actor, 'prayer.harm'),
    }
}

export function prayerAvailableAt(
    actor: GameCharacter,
    abilityId: PrayerActionId = 'pray'
): number {
    return Math.max(
        isMotherPrayer(abilityId) ? actor.progression.prayerAvailableAt : 0,
        actor.abilities.availableAt[abilityId] ?? 0
    )
}
export function setPrayerAvailableAt(
    actor: GameCharacter,
    abilityId: PrayerActionId,
    now: number
): void {
    actor.abilities.availableAt[abilityId] = now
    if (isMotherPrayer(abilityId)) {
        actor.progression.prayerAvailableAt = now
        actor.abilities.availableAt.pray = now
        actor.abilities.availableAt.pray_woven = now
    }
}

export function snapshotPrayerParameters(
    actor: GameCharacter,
    known: readonly AbilityId[],
    tileWidth = 0
): Partial<Record<PrayerActionId, PrayerParametersSnapshot>> {
    return Object.fromEntries(
        known
            .filter(isPrayerAction)
            .map((id) => [id, prayerParameters(actor, tileWidth, id)])
    )
}
