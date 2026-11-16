import {
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerActionId,
    prayerSchoolId,
    resolveResurrectionParameters,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { deityMood } from './deities'

export function characterResurrectionParameters(
    actor: GameCharacter,
    abilityId: PrayerActionId,
    now: number
) {
    return resolveResurrectionParameters(
        abilityId,
        actor.progression.constellations.opened,
        deityMood(
            PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(abilityId)].deityId,
            now
        )
    )
}
