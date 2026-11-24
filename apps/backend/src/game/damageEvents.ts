import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { CharacterDamageInput } from './abilityDamage'
import type { GameCharacter } from './character'
import { markDamageRetaliation } from './crimeRelations'
import { withWorldSound } from './worldSound'

const damageSequences = new WeakMap<GameCharacter, number>()
const uncreditedDefeats = new WeakMap<GameCharacter, number>()
const defeatCredit = Symbol('defeatCredit')
type CombatDeath = GameEventPayload & { [defeatCredit]?: boolean }

export function combatDeathEvent(
    actor: GameCharacter,
    target: GameCharacter,
    hostile: boolean
): GameEventPayload {
    if (!hostile) {
        uncreditedDefeats.set(target, target.deathSequence)
    }
    const event: CombatDeath = {
        kind: 'death',
        actorId: actor.id,
        targetId: target.id,
        ...(hostile ? {} : { [defeatCredit]: false }),
    }
    return event
}

export function creditsDefeat(event: CombatDeath): boolean {
    return event.kind === 'death' && event[defeatCredit] !== false
}

export function canAwardDefeatTrophy(target: GameCharacter): boolean {
    return uncreditedDefeats.get(target) !== target.deathSequence
}

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
    return withWorldSound(
        authorizedRetaliation === undefined
            ? event
            : markDamageRetaliation(event, authorizedRetaliation),
        'hit',
        input.target.locationId,
        input.target.position,
        { sourceActorId: input.target.id }
    )
}
