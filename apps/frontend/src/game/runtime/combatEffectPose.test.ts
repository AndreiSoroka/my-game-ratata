import type { CharacterFacing } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { combatEffectCues } from './combatEffectPlan'
import { combatEffectPose } from './combatEffectPose'
import { drawEffectGraphic } from './effectGraphics'

vi.mock('excalibur', () => ({ Canvas: class {} }))

const directions: { facing: CharacterFacing; x: number; y: number; rotation: number }[] = [
    { facing: 'right', x: 20, y: 0, rotation: 0 },
    { facing: 'down', x: 0, y: 20, rotation: Math.PI / 2 },
    { facing: 'left', x: -20, y: 0, rotation: Math.PI },
    { facing: 'up', x: 0, y: -20, rotation: -Math.PI / 2 },
]

describe.each([undefined, 'skeleton_strike'] as const)('directed melee cue %s', (abilityId) => {
    it.each(directions)('points toward the target $facing independently of facing', (direction) => {
        const from = characterFixture('attacker', {
            facing: 'left',
            position: { x: 80, y: 80 },
        })
        const target = characterFixture('target', {
            position: { x: 80 + direction.x, y: 80 + direction.y },
        })
        const [cue] = combatEffectCues(
            { kind: 'attack', actorId: from.id, targetId: target.id, abilityId },
            from
        )
        expect(cue).toMatchObject({
            fromId: from.id,
            targetId: target.id,
            kind: abilityId ? 'bone' : 'slash',
        })
        for (const reduced of [false, true]) {
            expect(combatEffectPose(cue!, from, target, reduced)).toMatchObject({
                x: 80,
                y: 80,
                rotation: direction.rotation,
            })
        }
    })
    it.each(directions)(
        'falls back to facing $facing for an untargeted attack',
        ({ facing, rotation }) => {
            const from = characterFixture('attacker', { facing })
            const [cue] = combatEffectCues({ kind: 'attack', actorId: from.id, abilityId }, from)
            expect(cue?.targetId).toBe(from.id)
            expect(combatEffectPose(cue!, from, from, false).rotation).toBe(rotation)
        }
    )
})

describe('melee neutral geometry', () => {
    it('keeps the torso offset for projectiles and restorative effects', () => {
        const from = characterFixture('attacker', { position: { x: 50, y: 50 } })
        const target = characterFixture('target', { position: { x: 80, y: 100 } })
        const [shot] = combatEffectCues(
            { kind: 'attack', actorId: from.id, targetId: target.id, abilityId: 'shot' },
            from
        )
        expect(combatEffectPose(shot!, from, target, false)).toMatchObject({ x: 50, y: 35 })
        expect(combatEffectPose(shot!, from, target, true)).toMatchObject({ x: 80, y: 85 })
        const [heal] = combatEffectCues(
            { kind: 'heal', actorId: from.id, targetId: target.id, amount: 6 },
            from
        )
        expect(combatEffectPose(heal!, target, target, false)).toMatchObject({ x: 80, y: 85 })
    })
    it.each(['slash', 'bone'] as const)(
        'centers %s around the right-facing axis before rotation',
        (kind) => {
            const arc = vi.fn<CanvasRenderingContext2D['arc']>()
            const ctx = {
                save: vi.fn<() => void>(),
                restore: vi.fn<() => void>(),
                beginPath: vi.fn<() => void>(),
                stroke: vi.fn<() => void>(),
                fillRect: vi.fn<() => void>(),
                arc,
            } as unknown as CanvasRenderingContext2D
            drawEffectGraphic(ctx, kind)
            expect(arc).toHaveBeenCalledWith(0, 0, 18, -0.9, 0.9)
        }
    )
})
