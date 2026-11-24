import type { Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

export function canWalkDuringPrayer(actor: GameCharacter): boolean {
    const cast = actor.abilities.casting
    return (
        cast?.mode === 'prayer' &&
        cast.walkWhileCasting === true &&
        actor.actionLockUntil <= cast.completesAt
    )
}

/** A release due this tick still belongs to the map where it began. */
export function sparkBlocksTravel(actor: GameCharacter): boolean {
    return actor.pendingAttack?.sparkPath !== undefined
}

export function movementInputLocked(actor: GameCharacter): boolean {
    return (
        actor.alive &&
        (actor.combat.defensiveStance ||
            actor.abilities.casting?.mother?.lastLight === true)
    )
}

/** Paid lunges advance through the same collision resolver as ordinary intentions. */
export function lungeDisplacement(
    actor: GameCharacter,
    now: number,
    deltaMs: number
): Vector2 | undefined {
    const lunge = actor.combat.lunge
    if (lunge === undefined) {
        return undefined
    }
    const elapsed = Math.max(
        0,
        Math.min(now, lunge.endsAt) - Math.max(now - deltaMs, lunge.startedAt)
    )
    const amount = Math.min(
        lunge.distance - lunge.moved,
        (lunge.distance * elapsed) / (lunge.endsAt - lunge.startedAt)
    )
    lunge.moved += amount
    if (now >= lunge.endsAt) {
        delete actor.combat.lunge
    }
    return { x: lunge.direction.x * amount, y: lunge.direction.y * amount }
}
/** Time-weighted displacement budget preserves the exact phase boundary even on a late tick. */
export function combatMovementTime(
    actor: GameCharacter,
    now: number,
    deltaMs: number
): number {
    const movementAt =
        actor.combat.action?.movementAt ??
        (canWalkDuringPrayer(actor) ? 0 : actor.actionLockUntil)
    const start = Math.max(now - deltaMs, movementAt)
    if (start >= now) {
        return 0
    }
    const slowUntil = actor.combat.slowMovementUntil ?? 0
    const slow = Math.max(0, Math.min(now, slowUntil) - start)
    return slow * (actor.combat.movementFraction ?? 1) + now - start - slow
}

export function walkingTime(
    character: GameCharacter,
    now: number,
    duration: number
): number {
    const boost = character.combat.arrowStep
    if (boost === undefined || character.movement.mode !== 'walking') {
        return duration
    }
    const boosted = Math.max(
        0,
        Math.min(now, boost.until) - Math.max(now - duration, boost.until - 600)
    )
    if (now >= boost.until) {
        delete character.combat.arrowStep
    }
    return duration + boosted * (boost.multiplier - 1)
}
