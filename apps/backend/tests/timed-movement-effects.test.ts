import { describe, expect, it, vi } from 'vitest'

import { createItemInstance } from '../src/game/inventory'
import { handleMovementCommand } from '../src/game/movementActions'
import { consumeMovementInputHistory } from '../src/game/movementInputHistory'
import {
    down,
    left,
    right,
    stopped,
    timedMovementFixture,
} from './timedMovementTestHelpers'

describe('once-per-step movement effects', () => {
    it('uses total resolved distance for noise and wear even when two legs cancel each other', () => {
        const f = timedMovementFixture()
        const boots = createItemInstance('boots')
        f.actor.equipment.boots = boots
        f.actor.movement.stepLocationId = f.actor.locationId
        f.actor.movement.stepDistance = 18
        f.actor.energy = 50
        f.setMoveInput(right, 1000)
        f.setMoveInput(left, 1025)
        f.step()
        expect(f.actor.velocity.x).toBeCloseTo(0)
        expect(boots.wearDistance).toBeCloseTo(4.5)
        expect(f.onNoise).toHaveBeenCalledOnce()
        expect(f.actor.energy).toBeCloseTo(50.15)
        expect(f.onEnergyRegen).toHaveBeenCalledOnce()
        expect(f.onEvents).toHaveBeenCalledOnce()
        expect(f.updateAnimation).toHaveBeenCalledOnce()
    })

    it('never rewards blocked requested distance and still regenerates as idle once', () => {
        const f = timedMovementFixture()
        const boots = createItemInstance('boots')
        f.actor.equipment.boots = boots
        f.actor.position.x = 111.99
        f.actor.energy = 50
        for (let y = 0; y < 32; y++) {
            f.context.navigation.grid.solid[y * 32 + 7] = true
        }
        f.setMoveInput(right, 1000)
        f.setMoveInput({ x: 1, y: 1 }, 1025)
        f.setMoveInput(stopped, 1050)
        f.step()
        // The diagonal can legitimately slide down the wall.
        const actualDistance = Math.hypot(
            f.actor.velocity.x,
            f.actor.velocity.y
        )
        expect(boots.wearDistance).toBeCloseTo(actualDistance)
        expect(boots.wearDistance ?? 0).toBeLessThan(4.5)
        expect(f.onNoise).not.toHaveBeenCalled()
        expect(f.onEnergyRegen).toHaveBeenCalledOnce()
        expect(f.updateAnimation).toHaveBeenCalledOnce()
    })

    it('marks a mobile arrow from actual walking once, including a return to the starting point', () => {
        const f = timedMovementFixture()
        f.actor.pendingAttack = {
            arrow: { abilityId: 'shot', mobile: true, moved: false },
        } as NonNullable<typeof f.actor.pendingAttack>
        f.setMoveInput(right, 1000)
        f.setMoveInput(left, 1025)
        f.step()
        expect(f.actor.pendingAttack.arrow?.moved).toBe(true)
        expect(f.updateAnimation).toHaveBeenCalledOnce()
    })

    it('does not mutate the public manual axis while resolving historical legs', () => {
        const f = timedMovementFixture()
        f.setMoveInput(right, 1000)
        f.setMoveInput(down, 1025)
        const readAxes: unknown[] = []
        const resolve = f.context.navigation.moveWithCollision.bind(
            f.context.navigation
        )
        vi.spyOn(f.context.navigation, 'moveWithCollision').mockImplementation(
            (position, delta) => {
                readAxes.push(f.actor.getMoveInput())
                return resolve(position, delta)
            }
        )
        f.step()
        expect(readAxes).toEqual([down, down])
        expect(f.actor.getMoveInput()).toEqual(down)
    })
})

describe('movement phase budgets', () => {
    it('applies walking and sneaking speed to the same actual held duration', () => {
        const walking = timedMovementFixture()
        walking.setMoveInput(right, 1010)
        walking.setMoveInput(stopped, 1040)
        walking.step()
        const sneaking = timedMovementFixture()
        handleMovementCommand(
            sneaking.actor,
            { type: 'movement_mode', mode: 'sneaking' },
            1000
        )
        sneaking.setMoveInput(right, 1010)
        sneaking.setMoveInput(stopped, 1040)
        sneaking.step()
        expect(sneaking.actor.position.x - 100).toBeCloseTo(
            (walking.actor.position.x - 100) * 0.45
        )
    })

    it('clips each leg by the authoritative action-lock boundary', () => {
        const f = timedMovementFixture()
        f.actor.actionLockUntil = 1040
        f.setMoveInput(right, 1000)
        f.setMoveInput(down, 1030)
        f.step(1100, 100)
        expect(f.actor.position.x).toBeCloseTo(100)
        expect(f.actor.position.y).toBeCloseTo(105.4)
    })

    it('preserves the combat slow overlap independently for each leg', () => {
        const f = timedMovementFixture()
        f.actor.combat.slowMovementUntil = 1060
        f.actor.combat.movementFraction = 0.5
        f.setMoveInput(right, 1000)
        f.setMoveInput(down, 1050)
        f.step(1100, 100)
        expect(f.actor.position.x).toBeCloseTo(102.25)
        expect(f.actor.position.y).toBeCloseTo(104.05)
    })

    it('keeps one walking speed buff available for all overlapping legs and expires it once', () => {
        const f = timedMovementFixture()
        f.actor.combat.arrowStep = { until: 1050, multiplier: 2 }
        f.setMoveInput(right, 1000)
        f.setMoveInput(left, 1025)
        f.step(1100, 100)
        expect(f.actor.position.x).toBeCloseTo(95.5)
        expect(f.actor.movement.stepDistance).toBeCloseTo(13.5)
        expect(f.actor.combat.arrowStep).toBeUndefined()
        expect(consumeMovementInputHistory(f.actor, 1100, 100)).toBeUndefined()
    })
})
