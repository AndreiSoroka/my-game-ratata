import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'

const interruptedCasts = new WeakMap<GameCharacter, GameEventPayload[]>()

export function sparkPhaseEvent(
    actor: GameCharacter,
    attack: PendingAttackHit,
    phase: 'completed' | 'interrupted'
): GameEventPayload {
    return {
        kind: 'attack',
        actorId: actor.id,
        abilityId: 'spark',
        attackOrigin: 'ability',
        delivery: 'magic',
        phase,
        ...(attack.actionId === undefined ? {} : { actionId: attack.actionId }),
    }
}

/** Cancelled casts keep their receipt and the map on which they began. */
export function recordSparkInterruption(actor: GameCharacter): void {
    const attack = actor.pendingAttack
    if (attack?.sparkPath === undefined) {
        return
    }
    const events = interruptedCasts.get(actor) ?? []
    events.push({
        ...sparkPhaseEvent(actor, attack, 'interrupted'),
        locationId: actor.locationId,
    })
    interruptedCasts.set(actor, events)
}

export function takeSparkInterruptions(
    characters: Iterable<GameCharacter>
): GameEventPayload[] {
    const events: GameEventPayload[] = []
    for (const actor of characters) {
        const interruptions = interruptedCasts.get(actor)
        if (interruptions !== undefined) {
            events.push(...interruptions)
            interruptedCasts.delete(actor)
        }
    }
    return events
}
