import { PURSUIT_RULES, type Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import {
    insideTerritory,
    pursuits,
    returnFromPursuit,
    territories,
} from './pursuitState'

/** Reject an out-of-territory step; collision and actual displacement remain shared. */
export function boundedPursuitStep(
    actor: GameCharacter,
    before: Vector2,
    next: Vector2,
    now: number
): Vector2 {
    const state = pursuits.get(actor)
    if (state?.phase === 'return') {
        return next
    }
    const foreign = state?.foreign
    const outside =
        foreign !== undefined &&
        (now >= foreign.until ||
            distance(next, foreign.entry) > PURSUIT_RULES.foreignRadius)
    const guardianOutside =
        territories.has(actor) &&
        foreign === undefined &&
        !insideTerritory(
            actor,
            next,
            state === undefined
                ? PURSUIT_RULES.guardianPatrolRadius
                : PURSUIT_RULES.guardianChaseRadius
        )
    if (!outside && !guardianOutside) {
        return next
    }
    returnFromPursuit(actor)
    actor.movement.dashUntil = 0
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    return before
}
