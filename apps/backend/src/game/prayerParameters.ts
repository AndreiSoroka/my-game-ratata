import {
    ABILITY_DEFINITIONS,
    type CharacterAbilitiesSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { constellationModifiers, hasStar } from './constellations'

/** The same resolved parameters drive validation, controllers and presentation. */
export function prayerParameters(
    actor: GameCharacter,
    tileWidth = 0
): NonNullable<CharacterAbilitiesSnapshot['prayer']> {
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
