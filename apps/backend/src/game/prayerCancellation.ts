import type { GameEventPayload, Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canWalkDuringPrayer } from './combatMovement'
import { setPrayerAvailableAt } from './prayerParameters'

/** Interrupt the pending channel before its final effect resolves. */
export function cancelPrayerCast(
    actor: GameCharacter,
    now: number
): GameEventPayload[] {
    const cast = actor.abilities.casting
    if (cast === null) {
        return []
    }
    if (cast.mother?.lastLight === true && actor.alive) {
        return []
    }
    if (cast.mother !== undefined) {
        actor.abilities.prayerAurasSuppressed = true
        if (cast.mother.lastLight) {
            setPrayerAvailableAt(actor, cast.abilityId, now + 10000)
        }
    }
    releasePrayerCast(actor, now)
    return [
        {
            kind: 'cast',
            actorId: actor.id,
            ...(cast.mode === 'purify_grave'
                ? { target: { kind: 'grave' as const, id: cast.targetId } }
                : { targetId: cast.targetId }),
            abilityId: cast.abilityId,
            phase: 'interrupted',
        },
    ]
}

export function releasePrayerCast(actor: GameCharacter, now: number): void {
    actor.abilities.casting = null
    actor.actionLockUntil = Math.min(actor.actionLockUntil, now)
    if (actor.alive && actor.animationAction === 'attack') {
        actor.animationUntil = now
        actor.setAnimation('idle', now)
    }
}

export function cancelPrayerForMovement(
    actor: GameCharacter,
    axis: Vector2,
    now: number
): GameEventPayload[] {
    if (canWalkDuringPrayer(actor)) {
        return []
    }
    if (actor.abilities.casting?.mother?.lastLight === true && actor.alive) {
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
        return []
    }
    return axis.x !== 0 || axis.y !== 0 ? cancelPrayerCast(actor, now) : []
}
