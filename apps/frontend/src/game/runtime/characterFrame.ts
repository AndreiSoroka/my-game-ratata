import type { CharacterSnapshot } from '@my-game-ratata/contracts'

import { type CharacterDefinition, resolveAnimationRow } from '../assets/characterCatalog'
import { animationFrame } from './animationFrame'

const nativeHumanIds = new Set([
    'player',
    'male_player_2',
    'male_mage',
    'female_player',
    'female_mage',
])

export function characterFrame(
    definition: CharacterDefinition,
    snapshot: CharacterSnapshot,
    now: number,
    hurtElapsed?: number
) {
    const action = !snapshot.alive
        ? 'death'
        : hurtElapsed !== undefined
          ? 'damaged'
          : snapshot.animation.action
    const authored = definition.animations[action]
    // Native human sheets have no hurt row. The first death-row frame is a
    // standing recoil pose; never play its later falling frames for a living hit.
    const death = definition.animations.death
    const animation =
        authored ??
        (action === 'damaged' && death !== undefined && 'row' in death
            ? { row: death.row, frameCount: 1, frameMs: 140 }
            : definition.animations.idle)
    if (animation === undefined) return undefined
    const row = resolveAnimationRow(animation, snapshot.facing)
    if (row === undefined) return undefined
    // Each of the five restored 288×480 human PNGs has only columns0–2 in
    // death row9. The legacy catalog's frames3–4 are transparent, not poses.
    const playable = isNativeHumanDeath(definition, action)
        ? { ...animation, frameCount: Math.min(3, animation.frameCount) }
        : animation
    const startedAt =
        action === 'damaged' && hurtElapsed !== undefined
            ? now - hurtElapsed
            : snapshot.animation.startedAt
    return {
        action,
        row,
        frame: animationFrame(playable, action, now, { animation: { action, startedAt } }),
        flipHorizontal: snapshot.facing === 'left',
    }
}

function isNativeHumanDeath(definition: CharacterDefinition, action: string): boolean {
    return action === 'death' && nativeHumanIds.has(definition.id)
}
