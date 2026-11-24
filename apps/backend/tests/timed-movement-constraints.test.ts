import { describe, expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { magicChannelFor } from '../src/game/magicState'
import { advanceCharacter } from '../src/game/movement'
import { handleMovementCommand } from '../src/game/movementActions'
import { consumeMovementInputHistory } from '../src/game/movementInputHistory'
import { territories } from '../src/game/pursuitState'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import {
    down,
    left,
    right,
    stopped,
    timedMovementFixture,
} from './timedMovementTestHelpers'

describe('receipt history cannot bypass authoritative movement gates', () => {
    it.each(['dead', 'offline', 'stunned', 'locked'] as const)(
        'discards a consumed partial step while %s',
        (reason) => {
            const f = timedMovementFixture()
            f.setMoveInput(right, 1000)
            f.setMoveInput(stopped, 1040)
            if (reason === 'dead') {
                f.actor.alive = false
            }
            if (reason === 'offline') {
                f.actor.tags.add('offline')
            }
            if (reason === 'stunned') {
                f.actor.stunUntil = 1200
            }
            if (reason === 'locked') {
                f.actor.actionLockUntil = 1200
            }
            f.step()
            expect(f.actor.position).toEqual({ x: 100, y: 100 })
            expect(
                consumeMovementInputHistory(f.actor, 1050, 50)
            ).toBeUndefined()
            f.actor.alive = true
            f.actor.tags.delete('offline')
            f.actor.stunUntil = 0
            f.actor.actionLockUntil = 0
            f.step(1100)
            expect(f.actor.velocity).toEqual(stopped)
            expect(f.actor.position).toEqual({ x: 100, y: 100 })
        }
    )

    it('lets a paid dash ignore manual substeps and retain its actual phase deadline', () => {
        const f = timedMovementFixture()
        f.actor.setMoveInput(right)
        handleMovementCommand(f.actor, { type: 'dash' }, 1000)
        f.setMoveInput(down, 1010)
        f.setMoveInput(stopped, 1040)
        f.step()
        expect(f.actor.position.x).toBeCloseTo(107.2)
        expect(f.actor.position.y).toBe(100)
        expect(f.onMotionResolved).toHaveBeenCalledWith({
            continuationUntil: 1600,
        })
        expect(consumeMovementInputHistory(f.actor, 1050, 50)).toBeUndefined()
    })

    it('lets a lunge consume the history without replaying it after the forced phase', () => {
        const f = timedMovementFixture()
        f.actor.combat.lunge = {
            startedAt: 1000,
            endsAt: 1100,
            moved: 0,
            distance: 40,
            direction: right,
        }
        f.setMoveInput(down, 1010)
        f.setMoveInput(stopped, 1040)
        f.step(1075, 75)
        expect(f.actor.position).toEqual({ x: 130, y: 100 })
        expect(f.onMotionResolved).toHaveBeenCalledWith({
            continuationUntil: 1100,
        })
        f.step(1125, 50)
        expect(f.actor.position.x).toBeCloseTo(140)
        expect(f.actor.position.y).toBe(100)
        f.step(1175)
        expect(f.actor.velocity).toEqual(stopped)
        expect(f.actor.position.x).toBeCloseTo(140)
        expect(f.actor.position.y).toBe(100)
    })

    it('fails an overflowing window closed while retaining the latest axis for the following ordinary tick', () => {
        const f = timedMovementFixture()
        for (let index = 0; index < 129; index++) {
            f.setMoveInput(index % 2 === 0 ? right : left, 1000 + index / 10)
        }
        f.step()
        expect(f.actor.position).toEqual({ x: 100, y: 100 })
        expect(f.actor.velocity).toEqual(stopped)
        f.step(1100)
        expect(f.actor.position.x).toBeCloseTo(104.5)
        expect(f.actor.velocity.x).toBeCloseTo(4.5)
    })
})

describe('constraints remain authoritative between historical legs', () => {
    it('stops later legs when a guardian boundary changes pursuit ownership', () => {
        const f = timedMovementFixture()
        territories.set(f.actor, {
            sourceId: 'test-territory',
            locationId: f.actor.locationId,
            position: { x: 39.5, y: 100 },
        })
        f.setMoveInput(right, 1000)
        f.setMoveInput({ x: 1, y: 1 }, 1025)
        f.setMoveInput(left, 1050)
        f.step(1100, 100)
        expect(f.actor.position.x).toBeCloseTo(102.25)
        expect(f.actor.position.y).toBe(100)
        expect(f.actor.getMoveInput()).toEqual(stopped)
        expect(f.onMotionResolved).toHaveBeenCalledWith({
            continuationUntil: 1100,
        })
    })

    it('enters chains through the shared limiter, grants practice once and stops the remaining legs', () => {
        const f = timedMovementFixture()
        const caster = abilityHero('arcanist')
        Object.assign(caster, { faction: 'monsters' })
        caster.abilities.known.add('chains')
        const context = {
            ...abilityContext([caster, f.actor], 1000),
            navigation: f.context.navigation,
        }
        expect(
            handleAbilityCommand(
                caster,
                { type: 'use_ability', abilityId: 'chains' },
                context
            )[0]?.phase
        ).toBe('started')
        const channel = magicChannelFor(caster)
        if (channel?.abilityId !== 'chains') {
            throw new Error('Expected chains')
        }
        const boundary = caster.position.x + channel.radius
        f.actor.position = { x: boundary + 5, y: 100 }
        f.setMoveInput(left, 1000)
        f.setMoveInput(right, 1100)
        f.setMoveInput(down, 1150)
        f.step(1250, 250)
        expect(f.actor.position.x).toBeLessThanOrEqual(boundary)
        expect(f.actor.position.y).toBe(100)
        expect(caster.progression.masteries.magic.experience).toBe(30_000_000n)
        expect(f.onEvents).toHaveBeenCalledOnce()
        expect(f.onMotionResolved).toHaveBeenCalledWith({
            continuationUntil: 1250,
        })
        f.step(1300)
        expect(caster.progression.masteries.magic.experience).toBe(30_000_000n)
    })
})

it('continues forced fear escape instead of replaying a stopped historical manual direction', () => {
    const actor = abilityHero('vanguard', 'undead')
    const source = abilityHero()
    const context = abilityContext([actor, source], 1000)
    for (const node of [
        'prayer.ward1',
        'prayer.ward2',
        'prayer.ward3',
        'prayer.ward4',
    ]) {
        source.progression.constellations.opened.add(node)
    }
    expect(
        handleAbilityCommand(
            source,
            {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'ward', targetId: actor.id },
            },
            context
        )[0]?.phase
    ).toBe('started')
    actor.setMoveInput(right, 1010)
    actor.setMoveInput(stopped, 1030)
    const samples: Array<{ continuationUntil?: number }> = []
    advanceCharacter({
        character: actor,
        navigation: context.navigation,
        now: 1050,
        deltaMs: 50,
        onMotionResolved: (sample) => samples.push(sample),
    })
    expect(Math.hypot(actor.velocity.x, actor.velocity.y)).toBeGreaterThan(0)
    expect(samples).toEqual([{}])
    expect(consumeMovementInputHistory(actor, 1050, 50)).toBeUndefined()
})
