import type { GameCharacter } from './character'

export function canTargetByFaction(
    actor: GameCharacter,
    target: GameCharacter
): boolean {
    if (actor.id === target.id) {
        return false
    }

    if (actor.faction === target.faction) {
        return false
    }

    return target.reputationWith(actor.faction) <= 0
}
