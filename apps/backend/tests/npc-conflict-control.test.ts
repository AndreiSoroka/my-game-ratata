import { CENTER_LOCATION_ID, THEFT_RULES } from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { NpcConflictResponses } from '../src/game/npcConflictResponses'
import {
    advanceNpcCrimeReport,
    type ReportResponse,
} from '../src/game/npcCrimeReport'
import { npc, registerConflictFixture } from './npcConflictFixtures'

const setup = registerConflictFixture()

it('files a complaint with another nearby guard when the planned recipient cannot be reached', () => {
    const f = setup()
    const alternate = npc(f.game, 'npc_veteran_1')
    alternate.tags.add('guard')
    alternate.position = { x: 92, y: 80 }
    const characters = new Map(
        f.game.charactersFor(f.merchant).map((actor) => [actor.id, actor])
    )
    const journey: ReportResponse = {
        mode: 'report',
        guardId: f.guard.id,
        offenderId: f.player.actor.id,
        offense: 'theft',
        locationId: CENTER_LOCATION_ID,
        lastPlanAt: 0,
        until: Date.now() + 1000,
    }
    vi.spyOn(f.game.navigationFor(f.merchant), 'findPathWorld').mockReturnValue(
        []
    )
    const report = vi.fn(() => [])
    expect(
        advanceNpcCrimeReport(
            f.game,
            f.merchant,
            journey,
            characters,
            Date.now(),
            report
        )
    ).toBe(false)
    expect(report).toHaveBeenCalledWith(
        f.merchant,
        f.player.actor.id,
        expect.any(Object),
        'theft'
    )
})

it('releases an expired personal response without stopping an official guard pursuit', () => {
    const f = setup()
    f.guard.position = { x: 80, y: 80 }
    const responses = new NpcConflictResponses()
    const characters = f.game.charactersFor(f.guard)
    const now = Date.now()
    responses.beginCombat(
        f.guard,
        f.player.actor,
        'flee',
        {
            id: 'guard-personal-conflict',
            kind: 'threat',
            locationId: CENTER_LOCATION_ID,
        },
        now
    )
    responses.update(f.game, characters, now, new Set(), () => [])
    expect(responses.controls(f.guard, now)).toBe(true)
    f.guard.setPath([{ x: 160, y: 80 }])
    const clearPath = vi.spyOn(f.guard, 'clearPath')

    responses.update(
        f.game,
        characters,
        now + THEFT_RULES.retaliationMs,
        new Set([f.guard.id]),
        () => []
    )
    expect(responses.controls(f.guard, now + THEFT_RULES.retaliationMs)).toBe(
        false
    )
    expect(clearPath).not.toHaveBeenCalled()
    expect(f.guard.hasPath()).toBe(true)
})

it('abandons an uninterruptible model handoff without canceling the actor’s model control', () => {
    const f = setup()
    const actor = npc(f.game, 'npc_veteran_1')
    const leader = npc(f.game, 'npc_princess_1')
    actor.position = { x: 80, y: 80 }
    leader.position = { x: 96, y: 80 }
    expect(
        f.game.decideForAgent(actor.id, { type: 'follow', targetId: leader.id })
            .accepted
    ).toBe(true)
    expect(actor.soul.controlSource).toBe('model')
    const cancel = vi.spyOn(f.game, 'cancelNpcModelTurn')
    const conflict = f.game.social.society.conflicts
    conflict?.apply(
        actor,
        f.player.actor,
        'flee',
        {
            id: 'model-lease',
            kind: 'threat',
            locationId: CENTER_LOCATION_ID,
        },
        Date.now()
    )
    vi.advanceTimersByTime(500)
    expect(conflict?.hasPhysicalReaction(actor, Date.now())).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1_650)
    expect(conflict?.hasPhysicalReaction(actor, Date.now())).toBe(false)
    expect(actor.soul.controlSource).toBe('model')
})
