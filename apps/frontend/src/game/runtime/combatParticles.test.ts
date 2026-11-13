import type { Engine, ParticleEmitterArgs } from 'excalibur'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { EffectCue } from './combatEffectPlan'
import { CombatParticles, MAX_EFFECT_PARTICLES } from './combatParticles'
import { EFFECT_BUDGET } from './effectBudget'

const state = vi.hoisted(() => ({
    live: 0,
    peak: 0,
    cleared: 0,
    configs: [] as ParticleEmitterArgs[],
}))
vi.mock('excalibur', () => ({
    Canvas: class {},
    EmitterType: { Circle: 'circle' },
    Color: { fromHex: (color: string) => color },
    vec: (x: number, y: number) => ({ x, y }),
    ParticleEmitter: class {
        private count = 0
        public constructor(config: ParticleEmitterArgs) {
            state.configs.push(config)
        }
        public emitParticles(count: number): void {
            this.count += count
            state.live += count
            state.peak = Math.max(state.peak, state.live)
        }
        public clearParticles(): void {
            state.live -= this.count
            this.count = 0
            state.cleared++
        }
        public kill(): void {}
    },
}))
const cue: EffectCue = {
    kind: 'revive',
    fromId: 'cleric',
    targetId: 'ally',
    deity: 'hearth',
    color: '#f9d37b',
    duration: 1000,
    count: 12,
}
const engine = { add: vi.fn<() => void>() } as unknown as Engine
afterEach(() => {
    state.live = 0
    state.peak = 0
    state.cleared = 0
    state.configs = []
})
describe('bounded scene-owned spell particles', () => {
    it('reserves at most 32 scene-wide combat and status views', () => {
        expect(
            EFFECT_BUDGET.damage +
                EFFECT_BUDGET.transient +
                EFFECT_BUDGET.barrier +
                EFFECT_BUDGET.status
        ).toBe(32)
    })
    it('reserves before emission, never exceeds 192, expires on scene time and releases on clear', () => {
        const particles = new CombatParticles(engine, false)
        for (let i = 0; i < 40; i++) particles.burst(cue, { x: 0, y: 0 }, 0)
        expect(state.live).toBe(MAX_EFFECT_PARTICLES)
        expect(state.peak).toBe(MAX_EFFECT_PARTICLES)
        particles.update(649)
        expect(state.live).toBe(MAX_EFFECT_PARTICLES)
        particles.update(650)
        expect(state.live).toBe(0)
        const burst = particles.burst(cue, { x: 0, y: 0 }, 700)
        particles.release(burst)
        particles.release(burst)
        expect(state.live).toBe(0)
        particles.burst(cue, { x: 0, y: 0 }, 700)
        particles.clear()
        expect(state.live).toBe(0)
    })
    it('emits no particles with reduced motion', () => {
        const particles = new CombatParticles(engine, true)
        expect(particles.burst(cue, { x: 0, y: 0 }, 0)).toBeUndefined()
        expect(state.peak).toBe(0)
    })
})

describe('patron particle emitters', () => {
    it('attracts Lantern particles toward the recipient with the engine-relative focus offset', () => {
        const particles = new CombatParticles(engine, false)
        particles.burst({ ...cue, deity: 'lantern' }, { x: 120, y: 240 }, 30)
        expect(state.configs).toHaveLength(1)
        expect(state.configs[0]).toMatchObject({
            pos: { x: 120, y: 240 },
            radius: 18,
            particle: {
                minSpeed: 0,
                maxSpeed: 0,
                focus: { x: 0, y: 0 },
                focusAccel: 5000,
                acc: { x: 0, y: 0 },
            },
        })
        particles.update(679)
        expect(state.live).toBe(12)
        particles.update(680)
        expect(state.live).toBe(0)
    })

    it('uses a horizontal streak graphic only for Road support effects', () => {
        const particles = new CombatParticles(engine, false)
        particles.burst({ ...cue, deity: 'road' }, { x: 120, y: 240 }, 0)
        particles.burst({ ...cue, deity: 'grave' }, { x: 120, y: 240 }, 0)
        expect(state.configs[0]?.particle?.graphic).toBeDefined()
        expect(state.configs[0]?.particle?.acc).toEqual({ x: 18, y: 0 })
        expect(state.configs[1]?.particle?.graphic).toBeUndefined()
        expect(state.configs[1]?.particle?.acc).toEqual({ x: 0, y: 14 })
        particles.clear()
        expect(state.live).toBe(0)
    })
})
