import {
    ABILITY_DEFINITIONS,
    type AbilityId,
    ASH_RULES,
    isMotherPrayer,
    isPrayerAction,
    type PrayerActionId,
    type PrayerMode,
    type PrayerParametersSnapshot,
    ROAD_PRAYER_RULES,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { ashParameters } from './constellationModifiers'
import { constellationModifiers, hasStar } from './constellations'

/** The same resolved parameters drive validation, controllers and presentation. */
export function prayerParameters(
    actor: GameCharacter,
    tileWidth = 0,
    abilityId: PrayerActionId = 'pray',
    mode: PrayerMode = 'restore'
): PrayerParametersSnapshot {
    const definition = ABILITY_DEFINITIONS[abilityId]
    if (abilityId === 'pray_grave') {
        return ashPrayerParameters(actor, tileWidth, mode)
    }
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

function ashPrayerParameters(
    actor: GameCharacter,
    tileWidth: number,
    mode: PrayerMode
): PrayerParametersSnapshot {
    const ash = ashParameters(actor)
    const definition = ABILITY_DEFINITIONS.pray_grave
    const radiusCells =
        mode === 'restore'
            ? ash.healRadiusCells
            : mode === 'revive'
              ? ash.reviveRadiusCells
              : 0
    const durationMs =
        mode === 'harm'
            ? ASH_RULES.brandWindupMs
            : definition.windupMs - (mode === 'revive' ? ash.reviveFasterMs : 0)
    return {
        radius: definition.range + radiusCells * tileWidth,
        durationMs,
        manaCost: definition.mana,
        area: false,
        targetLimit: mode === 'restore' && ash.healSecond ? 2 : 1,
        harm: ash.brand,
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
            .map((id) => [id, projectedPrayerParameters(actor, tileWidth, id)])
    )
}

function projectedPrayerParameters(
    actor: GameCharacter,
    tileWidth: number,
    id: PrayerActionId
): PrayerParametersSnapshot {
    const parameters = prayerParameters(actor, tileWidth, id)
    if (id === 'pray_grave') {
        const { radius, durationMs } = prayerParameters(
            actor,
            tileWidth,
            id,
            'revive'
        )
        parameters.ashRevival = { radius, durationMs }
    }
    return parameters
}
