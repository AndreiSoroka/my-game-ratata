import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { CharacterDamageInput } from './abilityDamage'
import type { GameCharacter } from './character'
import { markDamageRetaliation } from './crimeRelations'

const damageSequences = new WeakMap<GameCharacter, number>()

/** A contact receipt identifies one damage occurrence, independently of its attack action. */
export function damageEvent(
    input: CharacterDamageInput,
    amount: number,
    authorizedRetaliation?: boolean
): GameEventPayload {
    const { actor } = input
    const sequence = (damageSequences.get(actor) ?? 0) + 1
    damageSequences.set(actor, sequence)
    const event: GameEventPayload = {
        kind: 'damage',
        eventId: `damage:${actor.id}:${String(sequence)}`,
        actorId: actor.id,
        targetId: input.target.id,
        amount,
        damageKind: input.damageKind,
        hitQuality: input.hitQuality ?? 'normal',
    }
    return authorizedRetaliation === undefined
        ? event
        : markDamageRetaliation(event, authorizedRetaliation)
}
