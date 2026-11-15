import { PRAYER_RULES } from '@my-game-ratata/contracts'
import { Canvas, Color, EmitterType, type Engine, ParticleEmitter, vec } from 'excalibur'

import type { EffectCue } from './combatEffectPlan'
import { combatParticleMotion } from './combatParticleMotion'
import { EFFECT_BUDGET } from './effectBudget'

export const MAX_EFFECT_PARTICLES = EFFECT_BUDGET.particles
export const MAX_BURST_PARTICLES = EFFECT_BUDGET.burstParticles
interface Burst {
    emitter: ParticleEmitter
    count: number
    until: number
}

/** Burst reservations include all possibly living particles, even before the next engine update. */
export class CombatParticles {
    private readonly bursts = new Set<Burst>()
    private reserved = 0
    private readonly roadStreak = new Canvas({
        width: 8,
        height: 2,
        cache: true,
        smoothing: false,
        draw: (ctx) => {
            ctx.fillStyle = '#9dd17d'
            ctx.fillRect(2, 0, 6, 2)
            ctx.fillStyle = '#f1c26b'
            ctx.fillRect(0, 0, 2, 2)
        },
    })
    private readonly shard = new Canvas({
        width: 6,
        height: 7,
        cache: true,
        smoothing: false,
        draw: (ctx) => {
            ctx.fillStyle = '#b7d2ff'
            ctx.beginPath()
            ctx.moveTo(0, 0)
            ctx.lineTo(6, 2)
            ctx.lineTo(2, 7)
            ctx.fill()
        },
    })
    public constructor(
        private readonly engine: Engine,
        private readonly reduced: boolean
    ) {}
    public burst(
        cue: EffectCue,
        position: { x: number; y: number },
        now: number
    ): Burst | undefined {
        if (this.reduced) return undefined
        const count = Math.min(
            cue.count ?? 6,
            MAX_BURST_PARTICLES,
            MAX_EFFECT_PARTICLES - this.reserved
        )
        if (count <= 0) return undefined
        const life = Math.min(650, cue.duration)
        const motion = combatParticleMotion(cue)
        const waveScale = (cue.radius ?? PRAYER_RULES.radius) / PRAYER_RULES.radius
        const emitter = new ParticleEmitter({
            pos: vec(position.x, position.y),
            z: position.y + 25,
            width: cue.wave ? 78 * waveScale : 14,
            height: cue.wave ? 78 * waveScale : 14,
            emitterType: EmitterType.Circle,
            radius: motion.radius ?? (cue.wave ? 44 * waveScale : 7),
            isEmitting: false,
            emitRate: 0,
            particle: {
                life,
                fade: true,
                beginColor: Color.fromHex(cue.color),
                endColor: Color.fromHex(cue.color),
                startSize: 2,
                endSize: 0,
                minSpeed: motion.minSpeed,
                maxSpeed: motion.maxSpeed,
                minAngle: motion.minAngle,
                maxAngle: motion.maxAngle,
                acc: vec(motion.acceleration.x, motion.acceleration.y),
                // Excalibur 0.32's CPU emitter adds its world position to this focus offset.
                focus: motion.focusOffset
                    ? vec(motion.focusOffset.x, motion.focusOffset.y)
                    : undefined,
                focusAccel: motion.focusAcceleration,
                graphic:
                    cue.kind === 'shards'
                        ? this.shard
                        : motion.streak
                          ? this.roadStreak
                          : undefined,
            },
        })
        const burst = { emitter, count, until: now + life }
        this.reserved += count
        this.bursts.add(burst)
        this.engine.add(emitter)
        emitter.emitParticles(count)
        return burst
    }
    public release(burst: Burst | undefined): void {
        if (!burst || !this.bursts.delete(burst)) return
        this.reserved -= burst.count
        burst.emitter.clearParticles()
        burst.emitter.kill()
    }
    public update(now: number): void {
        for (const burst of this.bursts) if (now >= burst.until) this.release(burst)
    }
    public clear(): void {
        for (const burst of this.bursts) this.release(burst)
    }
}
