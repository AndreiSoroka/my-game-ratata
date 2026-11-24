import { describe, expect, it } from 'vitest'

import { consumeMovementInputHistory } from '../src/game/movementInputHistory'
import {
    down,
    left,
    right,
    stopped,
    timedMovementFixture,
} from './timedMovementTestHelpers'

describe('receipt-time manual movement', () => {
    it('integrates only the held portion of a step, then has zero velocity on the following step', () => {
        const f = timedMovementFixture()
        f.setMoveInput(right, 1010)
        f.setMoveInput(stopped, 1040)
        f.step()
        expect(f.actor.position).toEqual({ x: 102.7, y: 100 })
        expect(f.actor.velocity.x).toBeCloseTo(2.7)
        expect(f.onMotionResolved).toHaveBeenCalledExactlyOnceWith({
            continuationUntil: 1040,
        })
        expect(f.actor.getMoveInput()).toEqual(stopped)
        expect(consumeMovementInputHistory(f.actor, 1050, 50)).toBeUndefined()
        f.step(1100)
        expect(f.actor.position.x).toBeCloseTo(102.7)
        expect(f.actor.velocity).toEqual(stopped)
        expect(f.actor.animationAction).toBe('idle')
    })

    it('integrates reverse legs individually and keeps the final direction despite zero net displacement', () => {
        const f = timedMovementFixture()
        f.setMoveInput(right, 1000)
        f.setMoveInput(left, 1025)
        f.step()
        expect(f.actor.position.x).toBeCloseTo(100)
        expect(f.actor.velocity.x).toBeCloseTo(0)
        expect(f.actor.facing).toBe('left')
        expect(f.actor.animationAction).toBe('walk')
        expect(f.actor.movement.stepDistance).toBeCloseTo(4.5)
        expect(f.updateFacing).toHaveBeenCalledOnce()
    })

    it('resolves right-angle legs in order without changing the final manual axis', () => {
        const f = timedMovementFixture()
        f.setMoveInput(right, 1000)
        f.setMoveInput(down, 1020)
        f.step()
        expect(f.actor.position.x).toBeCloseTo(101.8)
        expect(f.actor.position.y).toBeCloseTo(102.7)
        expect(f.actor.facing).toBe('down')
        expect(f.actor.getMoveInput()).toEqual(down)
        expect(f.actor.velocity).toEqual({
            x: f.actor.position.x - 100,
            y: f.actor.position.y - 100,
        })
    })

    it('normalizes diagonal input once without granting a faster diagonal segment', () => {
        const f = timedMovementFixture()
        f.setMoveInput({ x: 1, y: 1 }, 1000)
        f.setMoveInput(stopped, 1050)
        f.step()
        expect(Math.hypot(f.actor.velocity.x, f.actor.velocity.y)).toBeCloseTo(
            4.5
        )
        expect(f.actor.velocity.x).toBeCloseTo(4.5 / Math.sqrt(2))
        expect(f.actor.getMoveInput()).toEqual(stopped)
    })

    it('clips old receipts to the allocated 250 ms window after a long stall', () => {
        const f = timedMovementFixture()
        f.setMoveInput(right, 1000)
        f.setMoveInput(stopped, 1950)
        f.step(2000, 250)
        expect(f.actor.position.x).toBeCloseTo(118)
        expect(f.onMotionResolved).toHaveBeenCalledWith({
            continuationUntil: 1950,
        })
    })

    it('preserves the legacy path and untimed controller movement when there is no receipt journal', () => {
        const manual = timedMovementFixture()
        manual.actor.setMoveInput(right)
        manual.step()
        expect(manual.actor.position.x).toBeCloseTo(104.5)
        const routed = timedMovementFixture()
        routed.actor.setPath([{ x: 140, y: 100 }])
        routed.step()
        expect(routed.actor.position.x).toBeCloseTo(104.5)
        expect(routed.actor.hasPath()).toBe(true)
    })
})

describe('per-leg movement geometry', () => {
    it('hits the first wall before turning instead of replacing the route by a diagonal shortcut', () => {
        const f = timedMovementFixture()
        f.actor.position = { x: 110, y: 100 }
        f.context.navigation.grid.solid[6 * 32 + 7] = true
        f.setMoveInput(right, 1000)
        f.setMoveInput(down, 1125)
        f.step(1250, 250)
        expect(f.actor.position.x).toBeLessThan(112)
        expect(f.actor.position.y).toBeCloseTo(111.25)
        expect(f.actor.movement.stepDistance).toBeCloseTo(
            f.actor.position.x - 110 + 11.25
        )
    })

    it('keeps diagonal corner blocking for every individual segment', () => {
        const f = timedMovementFixture()
        f.actor.position = { x: 111.99, y: 111.99 }
        f.context.navigation.grid.solid[6 * 32 + 7] = true
        f.context.navigation.grid.solid[7 * 32 + 6] = true
        f.setMoveInput({ x: 1, y: 1 }, 1000)
        f.setMoveInput(right, 1025)
        f.step()
        expect(f.actor.position.x).toBeLessThan(112)
        expect(f.actor.position.y).toBeLessThan(112)
    })

    it('does not discard later legal movement after a leg collides with a wall', () => {
        const f = timedMovementFixture()
        f.actor.position.x = 111.99
        for (let y = 0; y < 32; y++) {
            f.context.navigation.grid.solid[y * 32 + 7] = true
        }
        f.setMoveInput(right, 1000)
        f.setMoveInput(left, 1025)
        f.step()
        expect(f.actor.position.x).toBeCloseTo(109.74)
        expect(f.actor.facing).toBe('left')
    })
})
