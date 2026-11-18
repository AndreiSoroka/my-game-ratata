import type { CharacterAnimationAction, CharacterSnapshot } from '@my-game-ratata/contracts'

import type { CharacterAnimation } from '../assets/characterCatalog'

type ResolvedCharacterAnimation = NonNullable<CharacterAnimation>

export function animationFrame(
    animation: ResolvedCharacterAnimation,
    action: CharacterAnimationAction,
    localNow: number,
    snapshot: Pick<CharacterSnapshot, 'animation'>
): number {
    const elapsed = Math.max(0, localNow - snapshot.animation.startedAt)
    const duration = snapshot.animation.durationMs
    const frame =
        action === 'attack' && duration !== undefined && duration > 0
            ? actionFrame(
                  animation.frameCount,
                  elapsed,
                  duration,
                  snapshot.animation.hitAt === undefined
                      ? undefined
                      : snapshot.animation.hitAt - snapshot.animation.startedAt
              )
            : Math.floor(elapsed / animation.frameMs)

    if (action === 'idle' || action === 'walk') {
        return frame % animation.frameCount
    }

    return Math.max(0, Math.min(animation.frameCount - 1, frame))
}

/** A hit pose follows the observed impact boundary; recovery fills the same authoritative cycle. */
function actionFrame(count: number, elapsed: number, duration: number, hitMs?: number): number {
    if (count < 2 || hitMs === undefined || hitMs <= 0 || hitMs >= duration)
        return Math.floor((elapsed / duration) * count)
    if (elapsed < hitMs) return 0
    return 1 + Math.floor(((elapsed - hitMs) / (duration - hitMs)) * (count - 1))
}
