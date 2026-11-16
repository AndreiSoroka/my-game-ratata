import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'

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
            canTargetByFaction(actor, target, now))
    )
}
