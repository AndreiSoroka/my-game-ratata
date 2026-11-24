import type { GameCharacter } from './character'
import { combatMovementTime } from './combatMovement'
import type { TimedMovementSegment } from './movementInputHistory'

type WalkingBoost = GameCharacter['combat']['arrowStep']

/** Read phase overlaps without expiring a buff before later legs are resolved. */
export function timedWalkingBudget(
    actor: GameCharacter,
    segment: TimedMovementSegment,
    boost: WalkingBoost
): number {
    const duration = combatMovementTime(
        actor,
        segment.endsAt,
        segment.endsAt - segment.startedAt
    )
    if (boost === undefined || actor.movement.mode !== 'walking') {
        return duration
    }
    const boosted = Math.max(
        0,
        Math.min(segment.endsAt, boost.until) -
            Math.max(segment.endsAt - duration, boost.until - 600)
    )
    return duration + boosted * (boost.multiplier - 1)
}

export function expireTimedWalkingBoost(
    actor: GameCharacter,
    now: number,
    boost: WalkingBoost
): void {
    if (
        boost !== undefined &&
        actor.combat.arrowStep === boost &&
        actor.movement.mode === 'walking' &&
        now >= boost.until
    ) {
        delete actor.combat.arrowStep
    }
}
