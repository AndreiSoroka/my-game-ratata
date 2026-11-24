import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import type { MotionMap } from './motionCollision'
import { NetworkMotion } from './networkMotion'

function map(): MotionMap {
    return {
        width: 100,
        height: 100,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(10_000).fill(false),
    }
}
function moving(id = 'hero', overrides: Partial<CharacterSnapshot> = {}) {
    return characterFixture(id, {
        position: { x: 80, y: 80 },
        velocity: { x: 5, y: 0 },
        animation: { action: 'walk', startedAt: 0 },
        ...overrides,
    })
}
function sample(
    motion: NetworkMotion,
    character: CharacterSnapshot,
    tick = 1,
    stepMs = 50,
    received = (tick - 1) * 50
) {
    motion.observe({ ...worldFixture([character], 1000 + (tick - 1) * 50), tick, stepMs }, received)
}
function setup() {
    const motion = new NetworkMotion()
    motion.setMap(map())
    return motion
}

describe('bounded server movement presentation', () => {
    it.each([25, 50, 100, 250])(
        'converts legacy per-step velocity using actual %i ms step',
        (stepMs) => {
            const motion = setup()
            const actor = moving('remote', {
                velocity: { x: stepMs / 10, y: 0 },
                controllerKind: 'scripted',
            })
            sample(motion, actor, 1, stepMs)
            motion.frame(100)
            expect(motion.position('remote')).toEqual({ x: 90, y: 80 })
            expect(actor.position).toEqual({ x: 80, y: 80 })
        }
    )

    it('continues all observed characters at 50–500 ms delays, then freezes and cosmetically idles', () => {
        const motion = setup()
        const own = moving()
        const npc = moving('npc', { position: { x: 80, y: 120 } })
        motion.observe({ ...worldFixture([own, npc], 1000), stepMs: 50 }, 0)
        for (const delay of [50, 100, 200, 300, 500]) {
            motion.frame(delay)
            expect(motion.position('hero')?.x).toBe(80 + Math.min(delay, 200) / 10)
            expect(motion.position('npc')?.x).toBe(80 + Math.min(delay, 200) / 10)
        }
        expect(motion.presentation('hero', 500)?.animation.action).toBe('idle')
        expect(own.animation.action).toBe('walk')
    })

    it('eases small stop and reverse residuals over 100 ms without modifying snapshots', () => {
        const motion = setup()
        sample(motion, moving())
        motion.frame(100)
        sample(
            motion,
            moving('hero', { position: { x: 85, y: 80 }, velocity: { x: -5, y: 0 } }),
            2,
            50,
            100
        )
        expect(motion.position('hero')?.x).toBe(90)
        motion.frame(150)
        expect(motion.position('hero')?.x).toBe(80)
        motion.frame(200)
        expect(motion.position('hero')?.x).toBe(70)
        expect(motion.presentation('hero', 200)?.position.x).toBe(85)
    })

    it('uses speed-sensitive correction thresholds while large discontinuities snap', () => {
        const motion = setup()
        sample(motion, moving('hero', { velocity: { x: 50, y: 0 } }))
        motion.frame(50)
        sample(
            motion,
            moving('hero', { position: { x: 230, y: 80 }, velocity: { x: 50, y: 0 } }),
            2
        )
        expect(motion.position('hero')?.x).toBe(130)
        sample(motion, moving('hero', { position: { x: 1200, y: 80 } }), 3)
        expect(motion.position('hero')?.x).toBe(1200)
    })

    it('caps dash/lunge continuation at its authoritative end and stops at the current path segment', () => {
        const motion = setup()
        const actor = moving()
        sample(
            motion,
            moving('hero', { movement: { ...actor.movement!, continuationUntil: 1075 } })
        )
        motion.frame(200)
        expect(motion.position('hero')?.x).toBe(87.5)
        sample(
            motion,
            moving('hero', {
                path: [
                    { x: 85, y: 80 },
                    { x: 85, y: 150 },
                ],
            }),
            2
        )
        motion.frame(250)
        expect(motion.position('hero')).toEqual({ x: 85, y: 80 })
    })

    it('also clips correction residuals to a shortened current path segment', () => {
        const motion = setup()
        sample(motion, moving())
        motion.frame(200)
        sample(
            motion,
            moving('hero', { position: { x: 85, y: 80 }, path: [{ x: 90, y: 80 }] }),
            2,
            50,
            200
        )
        motion.frame(200)
        expect(motion.position('hero')).toEqual({ x: 90, y: 80 })
        motion.frame(250)
        expect(motion.position('hero')).toEqual({ x: 90, y: 80 })
    })

    it.each([0, 251, NaN, undefined])(
        'does not extrapolate with invalid step duration %s',
        (stepMs) => {
            const motion = setup()
            motion.observe({ ...worldFixture([moving()], 1000), stepMs }, 0)
            motion.frame(100)
            expect(motion.position('hero')?.x).toBe(80)
        }
    )
})

describe('movement presentation discontinuities', () => {
    it.each([
        { alive: false },
        { tags: ['offline'] },
        { tags: ['state.cc.stunned'] },
        { cooldowns: { attackMsLeft: 0, respawnMsLeft: 0, stunMsLeft: 100 } },
        { combat: { defensiveStance: true } },
    ] satisfies Partial<CharacterSnapshot>[])(
        'snaps blocked/life changes and ignores stale velocity: %s',
        (change) => {
            const motion = setup()
            sample(motion, moving())
            motion.frame(100)
            sample(motion, moving('hero', { position: { x: 85, y: 80 }, ...change }), 2)
            expect(motion.presentation('hero', 50)?.animation.action).toBe('idle')
            motion.frame(300)
            expect(motion.position('hero')?.x).toBe(85)
        }
    )

    it('does not stop attack/cast animation clocks at the movement limit', () => {
        const motion = setup()
        sample(motion, moving('hero', { animation: { action: 'attack', startedAt: 1000 } }))
        motion.frame(500)
        expect(motion.presentation('hero', 500)?.animation).toEqual({
            action: 'attack',
            startedAt: 1000,
        })
        expect(motion.serverTime(500)).toBe(1500)
    })

    it('freezes on resync, snaps on fresh data, resets stream time and prunes lost interest', () => {
        const motion = setup()
        sample(motion, moving())
        motion.frame(50)
        motion.hold()
        motion.frame(200)
        expect(motion.position('hero')?.x).toBe(85)
        expect(motion.presentation('hero', 200)?.animation.action).toBe('idle')
        sample(motion, moving('hero', { position: { x: 100, y: 80 } }), 2, 50, 200)
        expect(motion.position('hero')?.x).toBe(100)
        motion.reset()
        motion.observe({ ...worldFixture([moving('new')], 100), tick: 1, stepMs: 50 }, 300)
        expect(motion.serverTime(300)).toBe(100)
        expect(motion.position('hero')).toBeUndefined()
        motion.observe({ ...worldFixture([], 150), tick: 2, stepMs: 50 }, 350)
        expect(motion.position('new')).toBeUndefined()
    })

    it('an explicit short blink snaps only the next existing sample and cannot poison a later sample', () => {
        const motion = setup()
        sample(motion, moving())
        motion.frame(50)
        motion.event({
            kind: 'cast',
            actorId: 'hero',
            abilityId: 'blink',
            phase: 'completed',
            position: { x: 95, y: 80 },
        })
        motion.frame(75)
        expect(motion.position('hero')?.x).toBe(85)
        sample(motion, moving('hero', { position: { x: 95, y: 80 } }), 2)
        expect(motion.position('hero')?.x).toBe(95)
        sample(motion, moving('hero', { position: { x: 100, y: 80 } }), 3)
        expect(motion.position('hero')?.x).toBe(95)
        motion.event({ kind: 'cast', actorId: 'absent', abilityId: 'blink', phase: 'completed' })
        expect(motion.position('absent')).toBeUndefined()
    })
})
