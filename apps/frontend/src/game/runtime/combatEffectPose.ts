import type { CharacterFacing, CharacterSnapshot } from '@my-game-ratata/contracts'

import type { EffectCue } from './combatEffectPlan'
import type { EffectShape } from './effectGraphics'

const facingAngles: Record<CharacterFacing, number> = {
    right: 0,
    down: Math.PI / 2,
    left: Math.PI,
    up: -Math.PI / 2,
}
type Source = Pick<CharacterSnapshot, 'position' | 'facing'>
type Target = Pick<CharacterSnapshot, 'position'>

export function isMeleeEffect(kind: EffectShape): boolean {
    return kind === 'slash' || kind === 'bone'
}

/** Pin the heading when the authoritative attack arrives; movement cannot redirect its cue. */
export function effectHeading(from: Source, target: Target): number {
    const dx = target.position.x - from.position.x
    const dy = target.position.y - from.position.y
    return dx || dy ? Math.atan2(dy, dx) : facingAngles[from.facing]
}

export function combatEffectPose(
    cue: EffectCue,
    from: Source,
    target: Target,
    reduced: boolean
): { x: number; y: number; z: number; rotation: number } {
    const origin = cue.channel || (cue.travel && reduced) ? target : from
    return {
        x: origin.position.x,
        y: origin.position.y + (cue.wave || isMeleeEffect(cue.kind) ? 0 : -15),
        z: Math.max(from.position.y, target.position.y) + 10,
        rotation: cue.travel || isMeleeEffect(cue.kind) ? effectHeading(from, target) : 0,
    }
}
