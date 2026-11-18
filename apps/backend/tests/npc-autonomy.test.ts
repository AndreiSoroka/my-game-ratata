import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import {
    npcSelfActivityInterrupted,
    reviewNpcIdleActivity,
} from '../src/ai/npcAutonomy'
import { createNpcAiState } from '../src/ai/runtimeState'
import { GameRoom } from '../src/game/room'

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

function fixture(id = 'npc_magic_slime_1') {
    const room = new GameRoom()
    const actor = room.getCharacter(id)
    const config = parseNpcAiConfig(
        { npcs: [{ actorId: id, role: 'companion' }] },
        true
    )
    const npc = config.npcs[0]
    if (actor === undefined || npc === undefined) {
        throw new Error('Missing autonomous NPC fixture')
    }
    const state = createNpcAiState(npc, actor)
    const presence = vi
        .spyOn(room, 'hasConnectedPlayerInLocation')
        .mockReturnValue(true)
    let sequence = 0
    const review = (at: number) =>
        reviewNpcIdleActivity(
            room,
            state,
            at,
            (kind) => `${kind}:${String(++sequence)}`
        )
    return { room, actor, state, review, presence }
}

it('chooses once after five free minutes, without a fictional requester or unseen player data', () => {
    const f = fixture()
    f.review(1000)
    f.review(300_999)
    expect(f.state.task).toBeNull()
    f.review(301_000)
    expect(f.state.task).toMatchObject({
        background: 'self_activity',
        requesterId: null,
        steps: 0,
        deadline: 421_000,
    })
    expect(f.state.task).not.toHaveProperty('targetId')
    expect(f.state.events).toHaveLength(1)
    const task = f.state.task
    f.review(302_000)
    expect(f.state.task).toBe(task)
    expect(f.state.events).toHaveLength(1)
})

it('uses the same activity controller for a different character ID', () => {
    const f = fixture('npc_friendly_girl_1')
    f.review(1000)
    f.review(301_000)
    expect(f.state.task?.background).toBe('self_activity')
    expect(f.state.task?.request).not.toContain('Капля')
})

it('resets idle time when players leave, and respects a retained wait promise', () => {
    const f = fixture()
    f.review(1000)
    f.presence.mockReturnValue(false)
    f.review(301_000)
    expect(f.state.task).toBeNull()
    f.presence.mockReturnValue(true)
    f.review(400_000)
    f.actor.soul.companion = {
        canFight: false,
        leaderId: 'someone',
        order: 'wait',
        lastReply: null,
        controlRevision: 0,
    }
    f.review(700_000)
    expect(f.state.task).toBeNull()
    f.actor.soul.companion = null
    f.review(800_000)
    f.review(1_099_999)
    expect(f.state.task).toBeNull()
    f.review(1_100_000)
    expect(f.state.task?.background).toBe('self_activity')
})

it('yields a self activity to an actual request and stops when its observers leave', () => {
    const f = fixture()
    f.review(1000)
    f.review(301_000)
    expect(npcSelfActivityInterrupted(f.room, f.state, 301_000)).toBe(false)
    f.state.inbox.push({
        kind: 'message',
        id: 'speech:1',
        senderId: 'human',
        text: 'Пойдём',
        at: 301_100,
        position: { x: 0, y: 0 },
        locationId: f.actor.locationId,
    })
    expect(npcSelfActivityInterrupted(f.room, f.state, 301_100)).toBe(true)
    f.state.inbox = []
    f.presence.mockReturnValue(false)
    expect(npcSelfActivityInterrupted(f.room, f.state, 301_100)).toBe(true)
})
