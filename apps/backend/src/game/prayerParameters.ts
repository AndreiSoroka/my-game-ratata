import {
    ABILITY_DEFINITIONS,
    type AbilityId,
    isPrayerAbility,
    type PrayerAbilityId,
    type PrayerParametersSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { constellationModifiers, hasStar } from './constellations'

/** The same resolved parameters drive validation, controllers and presentation. */
export function prayerParameters(
    actor: GameCharacter,
    tileWidth = 0,
    abilityId: PrayerAbilityId = 'pray'
): PrayerParametersSnapshot {
    const definition = ABILITY_DEFINITIONS[abilityId]
    if (abilityId !== 'pray') {
        return {
            radius: definition.range,
            durationMs: definition.windupMs,
            manaCost: definition.mana,
            area: false,
            harm: false,
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
        area: modifiers.prayerArea,
        harm: hasStar(actor, 'prayer.harm'),
    }
}

export function prayerAvailableAt(
    actor: GameCharacter,
    abilityId: PrayerAbilityId = 'pray'
): number {
    return Math.max(
        abilityId === 'pray' ? actor.progression.prayerAvailableAt : 0,
        actor.abilities.availableAt[abilityId] ?? 0
    )
}
export function setPrayerAvailableAt(
    actor: GameCharacter,
    abilityId: PrayerAbilityId,
    now: number
): void {
    actor.abilities.availableAt[abilityId] = now
    if (abilityId === 'pray') {
        actor.progression.prayerAvailableAt = now
    }
}

export function snapshotPrayerParameters(
    actor: GameCharacter,
    known: readonly AbilityId[],
    tileWidth = 0
): Partial<Record<PrayerAbilityId, PrayerParametersSnapshot>> {
    return Object.fromEntries(
        known
            .filter(isPrayerAbility)
            .map((id) => [id, prayerParameters(actor, tileWidth, id)])
    )
}
