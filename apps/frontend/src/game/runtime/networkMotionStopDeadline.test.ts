import type { CharacterSnapshot, StopCorrectionReceipt } from '@my-game-ratata/contracts'
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

function correctionScenario() {
    const motion = new NetworkMotion()
    const map = {
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(400).fill(false),
    }
    const walking = characterFixture('hero', {
        position: { x: 80, y: 80 },
        velocity: { x: 5, y: 0 },
        animation: { action: 'walk', startedAt: 1000 },
    })
    const remote = { ...walking, id: 'npc', controllerKind: 'scripted' as const }
    motion.setMap(map)
    let tick = 0
    const observe = (
        localTime: number,
        changes: Partial<CharacterSnapshot>,
        stopCorrection?: StopCorrectionReceipt
    ) => {
        tick += 1
        motion.observe(
            {
                ...worldFixture([{ ...walking, ...changes }, remote], 1000 + 25 * tick),
                tick,
                stepMs: 50,
                ...(stopCorrection ? { stopCorrection } : {}),
            },
            localTime,
            'hero',
            { streamId: 9, seq: tick - 1 }
        )
    }
    observe(0, {})
    motion.frame(50)
    motion.recordDrawnOwner(motion.position('hero'))
    const request = motion.beginStop('hero', 7, 52)
    return { motion, map, observe, request }
}

describe('local manual stop correction', () => {
    it.each(['accepted', 'clamped', 'rejected'] as const)(
        'freezes the displayed point and blends a %s receipt for exactly 100 ms',
        (status) => {
            const { motion, observe, request } = correctionScenario()
            expect(request).toEqual({ id: 7, streamId: 9, seq: 0, position: { x: 85, y: 80 } })
            expect(motion.presentation('hero', 52)?.animation.action).toBe('idle')
            motion.frame(70)
            expect(motion.position('hero')?.x).toBe(85)
            expect(motion.position('npc')?.x).toBe(87)
            observe(76, { position: { x: 84, y: 80 } }, { id: 6, status: 'accepted' })
            expect(motion.position('hero')?.x).toBe(85)
            const endpoint = { position: { x: 83, y: 80 }, velocity: { x: 0, y: 0 } }
            observe(90, endpoint, { id: 7, status })
            expect(motion.position('hero')?.x).toBe(85)
            observe(140, endpoint, { id: 7, status })
            expect(motion.position('hero')?.x).toBe(84)
            observe(165, endpoint)
            expect(motion.position('hero')?.x).toBe(83.5)
            motion.frame(190)
            expect(motion.position('hero')).toEqual(endpoint.position)
            observe(225, endpoint)
            motion.frame(700)
            expect(motion.position('hero')).toEqual(endpoint.position)
        }
    )

    it('releases an unconfirmed stop after 300 ms and ignores a later matching receipt', () => {
        const { motion, observe } = correctionScenario()
        observe(200, { position: { x: 83, y: 80 } })
        motion.frame(351)
        expect(motion.position('hero')?.x).toBe(85)
        motion.frame(352)
        expect(motion.position('hero')?.x).toBe(83)
        motion.frame(370)
        expect(motion.position('hero')?.x).toBe(83)
        observe(
            400,
            { position: { x: 84, y: 80 }, velocity: { x: 0, y: 0 } },
            { id: 7, status: 'rejected' }
        )
        motion.frame(500)
        expect(motion.position('hero')?.x).toBe(84)
    })

    it('does not send a stop correction while the snapshot stream is invalid', () => {
        const { motion } = correctionScenario()
        motion.hold()
        expect(motion.beginStop('hero', 8, 70)).toBeUndefined()
    })

    it.each(['new movement', 'resync', 'map change', 'death', 'forced movement'] as const)(
        'cancels the local wait on %s',
        (cause) => {
            const { motion, map, observe } = correctionScenario()
            const endpoint: Partial<CharacterSnapshot> = {
                position: { x: 86, y: 80 },
                velocity: { x: 0, y: 0 },
                movement: {
                    mode: 'walking',
                    dashing: false,
                    dashCooldownMsLeft: 0,
                    continuationUntil: 1050,
                },
            }
            switch (cause) {
                case 'new movement':
                    motion.cancelStop()
                    break
                case 'resync':
                    motion.hold()
                    break
                case 'map change':
                    motion.setMap(map)
                    break
                case 'death':
                    endpoint.alive = false
                    break
                case 'forced movement':
                    endpoint.movement = {
                        ...endpoint.movement!,
                        positionDiscontinuity: 1,
                    }
                    break
            }
            observe(100, endpoint, { id: 7, status: 'rejected' })
            expect(motion.position('hero')).toEqual(endpoint.position)
            motion.frame(150)
            expect(motion.position('hero')).toEqual(endpoint.position)
        }
    )
})
