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
    return axis.x !== 0 || axis.y !== 0 ? cancelPrayerCast(actor, now) : []
}
