import {
    type ConstellationId,
    masteryTotalExperience,
    parseMasteryExperience,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../src/game/character'

export const prayerXp = (value: number) => parseMasteryExperience(String(value))

export function masteryExperience(
    actor: GameCharacter,
    id: ConstellationId = 'prayer'
): bigint {
    const mastery = actor.progression.masteries[id]
    return masteryTotalExperience(mastery.level) + mastery.experience
}
