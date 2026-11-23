import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
import {
    hasDeclaredHostility,
    hasGroupHostility,
    hasPersonalHostility,
} from './personalHostility'

/** Explicit combat intentions may target a dummy without changing hostility. */
export function canAttackCharacter(
    actor: GameCharacter,
    target: GameCharacter,
    now = Date.now()
): boolean {
    return (
        actor.trainingTarget === undefined &&
        actor.id !== target.id &&
        (target.trainingTarget !== undefined ||
            hasAttackRelationship(actor, target, now))
    )
}

export function hasAttackRelationship(
    actor: GameCharacter,
    target: GameCharacter,
    now: number
): boolean {
    return (
        canTargetByFaction(actor, target, now) ||
        hasDeclaredHostility(actor, target) ||
        hasPersonalHostility(target, actor, now) ||
        hasGroupHostility(target, actor)
    )
}
