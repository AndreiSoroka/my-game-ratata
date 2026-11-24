import { describe, expect, it } from 'vitest'

import { MotionClock } from './motionClock'
import { clipMotion, motionLineClear, type MotionMap } from './motionCollision'

describe('motion gameplay clock', () => {
    it('uses the fastest recent offset without rewinding on jitter, duplicate frames or a latency spike', () => {
        const clock = new MotionClock()
        expect(clock.observe(1000, 1, 100)).toBe(true)
        expect(clock.now(150)).toBe(1050)
        clock.observe(1050, 2, 220)
        expect(clock.now(220)).toBe(1120)
        expect(clock.observe(1050, 2, 230)).toBe(false)
        clock.observe(1100, 3, 700)
        expect(clock.now(700)).toBe(1600)
        clock.observe(3100, 4, 2800)
        expect(clock.now(2800)).toBeGreaterThanOrEqual(3700)
        clock.reset()
        clock.observe(10, 1, 3000)
        expect(clock.now(3010)).toBe(20)
    })
})

describe('conservative presentation clipping', () => {
    function map(): MotionMap {
        return {
            width: 5,
            height: 5,
            tileWidth: 16,
            tileHeight: 16,
            solid: Array<boolean>(25).fill(false),
        }
    }
    it('keeps actor centers inside half-tile bounds', () => {
        const visible = map()
        expect(clipMotion(visible, { x: 40, y: 40 }, { x: -50, y: 120 })).toEqual({ x: 8, y: 72 })
    })
    it('stops in quarter-tile steps before solid tiles and refuses corner cutting', () => {
        const visible = map()
        visible.solid[2 * 5 + 2] = true
        expect(clipMotion(visible, { x: 24, y: 40 }, { x: 72, y: 40 })).toEqual({ x: 28, y: 40 })
        visible.solid[2 * 5 + 2] = false
        visible.solid[1 * 5 + 2] = true
        const clipped = clipMotion(visible, { x: 24, y: 24 }, { x: 56, y: 56 })
        expect(clipped.x).toBeLessThan(32)
        expect(clipped.y).toBeLessThan(32)
        expect(motionLineClear(visible, { x: 24, y: 24 }, { x: 56, y: 56 })).toBe(false)
    })
    it('holds until the matching map exists and does not escape a blocked origin', () => {
        const visible = map()
        visible.solid[6] = true
        const from = { x: 24, y: 24 },
            to = { x: 56, y: 24 }
        expect(clipMotion(undefined, from, to)).toEqual(from)
        expect(clipMotion(visible, from, to)).toEqual(from)
    })
})
