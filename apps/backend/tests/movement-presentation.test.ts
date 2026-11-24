import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { advanceCharacter } from '../src/game/movement'
import { handleMovementCommand } from '../src/game/movementActions'
import { projectMovementPresentation } from '../src/game/movementPresentation'
import { WorldClock } from '../src/game/worldClock'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { required } from './snapshotStreamFixture'

function motionFixture() {
    const actor = abilityHero('vanguard')
    actor.setMoveInput({ x: 1, y: 0 })
    const context = abilityContext([actor], 1000)
    const samples: Array<{ continuationUntil?: number }> = []
    function step(now: number, deltaMs = 50) {
        advanceCharacter({
            character: actor,
            navigation: context.navigation,
            now,
            deltaMs,
            onMotionResolved: (sample) => samples.push(sample),
        })
        return samples.at(-1)
    }
    function snapshot(now: number): WorldSnapshot {
        return {
            tick: 1,
            serverTime: now,
            characters: [actor.snapshot(now)],
            chests: [],
            items: [],
        }
    }
    return { actor, context, samples, snapshot, step }
}

describe('resolved motion deadlines', () => {
    it('reports final dash displacement before clearing its state, then drops the cap on ordinary walking', () => {
        const f = motionFixture()
        handleMovementCommand(f.actor, { type: 'dash' }, 1000)
        expect(f.step(1550)).toEqual({ continuationUntil: 1600 })
        expect(f.step(1625, 75)).toEqual({ continuationUntil: 1600 })
        expect(f.actor.movement.dashUntil).toBe(0)
        const projected = projectMovementPresentation(
            f.snapshot(1625),
            new Map([[f.actor.id, 1600]])
        )
        expect(projected.characters[0]?.movement?.continuationUntil).toBe(1600)
        expect(f.actor.snapshot(1625).movement).not.toHaveProperty(
            'continuationUntil'
        )
        expect(f.step(1675)).toEqual({})
        expect(
            projectMovementPresentation(f.snapshot(1675), new Map())
                .characters[0]?.movement
        ).not.toHaveProperty('continuationUntil')
    })

    it('captures a lunge deadline before the movement resolver deletes its finishing state', () => {
        const f = motionFixture()
        f.actor.combat.lunge = {
            direction: { x: 1, y: 0 },
            distance: 40,
            moved: 0,
            startedAt: 1000,
            endsAt: 1100,
        }
        expect(f.step(1050)).toEqual({ continuationUntil: 1100 })
        expect(f.actor.position.x).toBeCloseTo(120)
        expect(f.step(1125, 75)).toEqual({ continuationUntil: 1100 })
        expect(f.actor.combat.lunge).toBeUndefined()
        expect(f.actor.position.x).toBeCloseTo(140)
        expect(f.step(1175)).toEqual({})
    })
})

describe('cancelled motion metadata', () => {
    it('reports no dash when real collision prevents displacement', () => {
        const f = motionFixture()
        f.actor.position.x = 111.99
        for (let y = 0; y < 32; y++) {
            f.context.navigation.grid.solid[y * 32 + 7] = true
        }
        handleMovementCommand(f.actor, { type: 'dash' }, 1000)
        expect(f.step(1050)).toEqual({})
        expect(f.actor.velocity).toEqual({ x: 0, y: 0 })
    })

    it.each(['stun', 'dead', 'offline', 'stance'] as const)(
        'suppresses stale metadata after post-movement %s',
        (kind) => {
            const f = motionFixture()
            const snapshot = f.snapshot(1050)
            const actor = required(snapshot.characters[0])
            actor.velocity.x = 5
            if (kind === 'stun') {
                actor.cooldowns.stunMsLeft = 100
            }
            if (kind === 'dead') {
                actor.alive = false
            }
            if (kind === 'offline') {
                actor.tags.push('offline')
            }
            if (kind === 'stance' && actor.combat !== undefined) {
                actor.combat.defensiveStance = true
            }
            const projected = projectMovementPresentation(
                snapshot,
                new Map([[actor.id, 1600]])
            )
            expect(projected.characters[0]?.movement).not.toHaveProperty(
                'continuationUntil'
            )
        }
    )

    it('does not call presentation reporting or change outcomes for a stunned dash', () => {
        const f = motionFixture()
        handleMovementCommand(f.actor, { type: 'dash' }, 1000)
        f.actor.stunUntil = 2000
        f.step(1050)
        expect(f.samples).toEqual([])
        expect(f.actor.position).toEqual({ x: 100, y: 100 })
    })

    it('does not mislabel forced fear escape as a cancelled lunge or dash', () => {
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
        const started = handleAbilityCommand(
            source,
            {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'ward', targetId: actor.id },
            },
            context
        )
        expect(started[0]?.phase).toBe('started')
        actor.combat.lunge = {
            direction: { x: 1, y: 0 },
            distance: 40,
            moved: 0,
            startedAt: 1000,
            endsAt: 1100,
        }
        const onMotionResolved = vi.fn()
        advanceCharacter({
            character: actor,
            now: 1050,
            deltaMs: 50,
            navigation: context.navigation,
            onMotionResolved,
        })
        expect(actor.combat.lunge).toBeUndefined()
        expect(onMotionResolved).toHaveBeenCalledWith({})
    })
})

describe('paused gameplay clock scope', () => {
    it('changes its revision once per actual resume and excludes wall-time pauses', () => {
        let wall = 1000
        const clock = new WorldClock(() => wall)
        clock.setMode('paused_when_empty', false)
        expect(clock.resumeRevision).toBe(0)
        wall = 5000
        clock.setMode('paused_when_empty', false)
        expect(clock.now()).toBe(1000)
        clock.setMode('paused_when_empty', true)
        expect(clock.resumeRevision).toBe(1)
        expect(clock.now()).toBe(1000)
        wall = 5100
        clock.setMode('always', true)
        expect(clock.resumeRevision).toBe(1)
        expect(clock.now()).toBe(1100)
        clock.setMode('paused_when_empty', false)
        wall = 9000
        clock.setMode('always', false)
        expect(clock.resumeRevision).toBe(2)
        expect(clock.now()).toBe(1100)
    })
})
