import type { Vector2 } from '@my-game-ratata/contracts'

import type { EffectCue } from './combatEffectPlan'

export interface ParticleMotion {
    minAngle: number
    maxAngle: number
    minSpeed: number
    maxSpeed: number
    acceleration: Vector2
    radius?: number
    focusOffset?: Vector2
    focusAcceleration?: number
    streak?: boolean
}

/** Cosmetic directions in world pixels: positive Y descends toward the ground. */
export function combatParticleMotion(cue: EffectCue): ParticleMotion {
    const base: ParticleMotion = {
        minAngle: 0,
        maxAngle: Math.PI * 2,
        minSpeed: 8,
        maxSpeed: cue.kind === 'shards' ? 45 : 24,
        acceleration: { x: 0, y: cue.kind === 'shards' ? 35 : -8 },
    }
    if (!['restore', 'revive', 'casting'].includes(cue.kind)) return base
    switch (cue.deity) {
        case 'hearth':
            return { ...base, minAngle: -2.1, maxAngle: -0.9 }
        case 'grave':
            return { ...base, minAngle: 0.9, maxAngle: 2.1, acceleration: { x: 0, y: 14 } }
        case 'road':
            return {
                ...base,
                minAngle: -0.12,
                maxAngle: 0.12,
                minSpeed: 18,
                maxSpeed: 42,
                acceleration: { x: 18, y: 0 },
                streak: true,
            }
        case 'lantern':
            return {
                ...base,
                radius: 18,
                minSpeed: 0,
                maxSpeed: 0,
                acceleration: { x: 0, y: 0 },
                focusOffset: { x: 0, y: 0 },
                focusAcceleration: 5000,
            }
    }
}
