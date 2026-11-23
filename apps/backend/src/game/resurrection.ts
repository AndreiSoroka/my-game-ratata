import {
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerActionId,
    prayerSchoolId,
    resolveResurrectionParameters,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { activeConstellationStars } from './constellations'
import { deityMood } from './deities'

export function characterResurrectionParameters(
    actor: GameCharacter,
    abilityId: PrayerActionId,
    now: number
) {
    return resolveResurrectionParameters(
        abilityId,
        activeConstellationStars(actor),
        deityMood(
            PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(abilityId)].deityId,
            now
        )
    )
}
