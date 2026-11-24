import type { GameCharacter } from './character'
import { invalidateManualStop } from './stopCorrection'

const generations = new WeakMap<GameCharacter, number>()

export function markPositionDiscontinuity(actor: GameCharacter): void {
    generations.set(actor, (generations.get(actor) ?? 0) + 1)
    invalidateManualStop(actor)
}

export function positionDiscontinuity(
    actor: GameCharacter
): number | undefined {
    return generations.get(actor)
}
