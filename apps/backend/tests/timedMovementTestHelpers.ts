import type { Vector2 } from '@my-game-ratata/contracts'
import { vi } from 'vitest'

import { advanceCharacter, type MovementContext } from '../src/game/movement'
import { abilityContext, abilityHero } from './abilityTestHelpers'

export const right: Vector2 = { x: 1, y: 0 }
export const left: Vector2 = { x: -1, y: 0 }
export const down: Vector2 = { x: 0, y: 1 }
export const stopped: Vector2 = { x: 0, y: 0 }

export function timedMovementFixture() {
    const actor = abilityHero('vanguard')
    const context = abilityContext([actor], 1000)
    const onEvents = vi.fn<NonNullable<MovementContext['onEvents']>>()
    const onNoise = vi.fn<NonNullable<MovementContext['onNoise']>>()
    const onMotionResolved =
        vi.fn<NonNullable<MovementContext['onMotionResolved']>>()
    const onEnergyRegen = vi.fn<NonNullable<MovementContext['onEnergyRegen']>>()
    const updateFacing = vi.spyOn(actor, 'updateFacing')
    const updateAnimation = vi.spyOn(actor, 'updateMovementAnimation')
    const setMoveInput = (axis: Vector2, at: number) =>
        actor.setMoveInput(axis, at)
    function step(now = 1050, deltaMs = 50) {
        return advanceCharacter({
            character: actor,
            navigation: context.navigation,
            now,
            deltaMs,
            onEvents,
            onNoise,
            onMotionResolved,
            onEnergyRegen,
        })
    }
    return {
        actor,
        context,
        onEvents,
        onNoise,
        onMotionResolved,
        onEnergyRegen,
        updateFacing,
        updateAnimation,
        setMoveInput,
        step,
    }
}
