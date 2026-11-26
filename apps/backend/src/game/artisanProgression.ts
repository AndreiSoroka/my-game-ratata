import {
    ARTISAN_STARS,
    type GameEventPayload,
    MASTERY_REWARDS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { awardMasteries, canReceiveMastery } from './skillProgression'

/** One committed log from a standing tree, with the final log opening the path. */
export function recordWoodHarvest(
    actor: GameCharacter,
    completedTree: boolean,
    now: number,
    random?: () => number
): GameEventPayload[] {
    const { opened } = actor.progression.constellations
    if (
        !canReceiveMastery(actor, undefined) ||
        (!completedTree && !opened.has(ARTISAN_STARS.root))
    ) {
        return []
    }
    opened.add(ARTISAN_STARS.root)
    return awardMasteries(
        actor,
        [
            {
                constellationId: 'artisan',
                experience: MASTERY_REWARDS.woodHarvest,
            },
        ],
        { now, random }
    )
}
