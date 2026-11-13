import type { GameCharacter } from './character'
import { hasRetaliationRight } from './crimeRelations'

export function canTargetByFaction(
    actor: GameCharacter,
    target: GameCharacter,
    now = Date.now()
): boolean {
    if (actor.id === target.id) {
        return false
    }

    if (hasRetaliationRight(actor, target, now)) {
        return true
    }

    if (actor.faction === target.faction) {
        return false
    }

    return target.reputationWith(actor.faction) <= 0
}
