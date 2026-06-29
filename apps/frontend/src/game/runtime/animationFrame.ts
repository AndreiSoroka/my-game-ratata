import type { CharacterAnimationAction, CharacterSnapshot } from '@my-game-ratata/contracts'

import type { CharacterAnimation } from '../assets/characterCatalog'

type ResolvedCharacterAnimation = NonNullable<CharacterAnimation>

export function animationFrame(
    animation: ResolvedCharacterAnimation,
    action: CharacterAnimationAction,
    localNow: number,
    snapshot: CharacterSnapshot
): number {
    const elapsed = Math.max(0, localNow - snapshot.animation.startedAt)
    const frame = Math.floor(elapsed / animation.frameMs)

    if (action === 'idle' || action === 'walk') {
        return frame % animation.frameCount
    }

    return Math.max(0, Math.min(animation.frameCount - 1, frame))
}
