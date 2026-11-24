import { describe, expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { NetworkMotion } from './networkMotion'

describe('receipt-time manual stop presentation', () => {
    it.each([25, 50, 100, 250])(
        'holds the authoritative partial-step endpoint when its stop deadline has elapsed (%i ms)',
        (stepMs) => {
            const motion = new NetworkMotion()
            motion.setMap({
                width: 100,
                height: 100,
                tileWidth: 16,
                tileHeight: 16,
                solid: Array<boolean>(10_000).fill(false),
            })
            const walking = characterFixture('hero', {
                position: { x: 80, y: 80 },
                velocity: { x: stepMs / 10, y: 0 },
                animation: { action: 'walk', startedAt: 1000 },
            })
            motion.observe({ ...worldFixture([walking], 1000), stepMs }, 0)
            motion.frame(stepMs)
            expect(motion.position('hero')?.x).toBe(80 + Math.min(stepMs, 200) / 10)

            // The final integrated displacement is nonzero even though input ended inside this step.
            const stopped = {
                ...walking,
                position: { x: 80 + stepMs / 20, y: 80 },
                velocity: { x: stepMs / 20, y: 0 },
                movement: { ...walking.movement!, continuationUntil: 1000 + stepMs * 0.4 },
            }
            const frame = { ...worldFixture([stopped], 1000 + stepMs), tick: 2, stepMs }
            motion.observe(frame, stepMs)
            expect(motion.position('hero')).toEqual(stopped.position)
            for (const later of [stepMs + 16, stepMs + 100, stepMs + 500]) {
                motion.frame(later)
                expect(motion.position('hero')).toEqual(stopped.position)
                expect(motion.presentation('hero', later)?.animation.action).toBe('idle')
            }
            expect(stopped.velocity.x).toBeGreaterThan(0)
            expect(stopped.position).toEqual(frame.characters[0]?.position)
        }
    )

    it('does not renew a past stop deadline when its partial-step snapshot arrives late', () => {
        const motion = new NetworkMotion()
        motion.setMap({
            width: 10,
            height: 10,
            tileWidth: 16,
            tileHeight: 16,
            solid: Array<boolean>(100).fill(false),
        })
        const actor = characterFixture('hero', {
            position: { x: 82, y: 80 },
            velocity: { x: 2, y: 0 },
            movement: {
                mode: 'walking',
                dashing: false,
                dashCooldownMsLeft: 0,
                continuationUntil: 1040,
            },
            animation: { action: 'walk', startedAt: 1000 },
        })
        motion.observe({ ...worldFixture([actor], 1050), stepMs: 50 }, 500)
        for (const localTime of [500, 550, 700, 1000]) {
            motion.frame(localTime)
            expect(motion.position('hero')).toEqual({ x: 82, y: 80 })
            expect(motion.presentation('hero', localTime)?.animation.action).toBe('idle')
        }
    })
})
