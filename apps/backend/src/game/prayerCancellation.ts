import type { GameEventPayload, Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

/** Interrupt the pending channel before it can spend mana or resurrect its target. */
export function cancelPrayerCast(
    actor: GameCharacter,
    now: number
): GameEventPayload[] {
    const cast = actor.abilities.casting
    if (cast === null) {
        return []
    }
    actor.abilities.casting = null
    actor.actionLockUntil = Math.min(actor.actionLockUntil, now)
    if (actor.alive && actor.animationAction === 'attack') {
        actor.animationUntil = now
        actor.setAnimation('idle', now)
    }
    return [
        {
            kind: 'cast',
            actorId: actor.id,
            targetId: cast.targetId,
            abilityId: 'pray',
            phase: 'interrupted',
        },
    ]
}

export function cancelPrayerForMovement(
    actor: GameCharacter,
    axis: Vector2,
    now: number
): GameEventPayload[] {
    return axis.x !== 0 || axis.y !== 0 ? cancelPrayerCast(actor, now) : []
}
