import type { SoulSnapshot } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import type { GameCharacter } from '../src/game/character'
import type { GameRoom } from '../src/game/room'
import {
    approachScenarioNpc,
    joinScenarioRoom,
    openScenarioRoom,
    roomScenario,
} from './scenarioRoomHelpers'

const rooms: GameRoom[] = []
afterEach(() => {
    for (const room of rooms) {
        room.stop()
    }
    rooms.length = 0
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function setup() {
    const room = openScenarioRoom()
    rooms.push(room)
    const alice = joinScenarioRoom(room, 'Alice')
    const bob = joinScenarioRoom(room, 'Bob')
    const npc = approachScenarioNpc(room, alice, 'npc_veteran_1')
    approachScenarioNpc(room, bob, npc.id)
    approachScenarioNpc(room, alice, npc.id)
    alice.send({
        type: 'companion_request',
        targetId: npc.id,
        request: 'dismiss',
    })
    expect(npc.soul.companion?.lastReply).toBe(
        'Наши дороги пока не были связаны.'
    )
    return { room, alice, bob, npc }
}

function soulFor(
    room: GameRoom,
    npc: GameCharacter,
    viewerId?: string
): SoulSnapshot {
    const soul = room
        .snapshot(Date.now(), npc.locationId, viewerId)
        .characters.find((character) => character.id === npc.id)?.soul
    if (soul === undefined) {
        throw new Error('NPC is missing from its location snapshot')
    }
    return soul
}

it('keeps a targeted reply visible only to its recipient and the speaking NPC', () => {
    const { room, alice, bob, npc } = setup()
    const raw = npc.soul.companion?.lastReply
    expect(raw).toBe('Наши дороги пока не были связаны.')
    const recipient = soulFor(room, npc, alice.actor.id)
    expect(recipient.companion?.lastReply).toBe(raw)
    expect(soulFor(room, npc, bob.actor.id).companion?.lastReply).toBeNull()
    expect(soulFor(room, npc).companion?.lastReply).toBeNull()
    expect(soulFor(room, npc, npc.id).companion?.lastReply).toBe(raw)
    expect(recipient).not.toBe(npc.soul)
    expect(recipient.companion).not.toBe(npc.soul.companion)
    const companion = recipient.companion
    if (companion === null) {
        throw new Error('Missing companion data')
    }
    companion.lastReply = 'Changed only in a returned snapshot'
    expect(npc.soul.companion?.lastReply).toBe(raw)
    expect(soulFor(room, npc, alice.actor.id).companion?.lastReply).toBe(raw)
})

it('does not grant the new scenario owner access to another person’s previous reply', () => {
    const { room, alice, bob, npc } = setup()
    const raw = npc.soul.companion?.lastReply
    bob.save(
        roomScenario('guard', [
            { id: 'wait', kind: 'wait', durationMs: 30_000 },
        ])
    )
    bob.send({ type: 'scenario_start', scenarioId: 'guard', targetId: npc.id })
    expect(npc.soul.companion?.leaderId).toBe(bob.actor.id)
    expect(soulFor(room, npc, alice.actor.id).companion?.lastReply).toBe(raw)
    expect(soulFor(room, npc, bob.actor.id).companion?.lastReply).toBeNull()
    expect(soulFor(room, npc).companion?.lastReply).toBeNull()
})

it('clears the private audience when an ordinary model speech intention becomes public', () => {
    const { room, alice, bob, npc } = setup()
    const text = 'Добрый день всем путникам.'
    const result = room.decideForAgent(npc.id, { type: 'speak', text })
    expect(result.accepted).toBe(true)
    expect(result.events).toEqual([
        expect.objectContaining({ kind: 'chat', text }),
    ])
    expect(result.events[0]?.audienceIds).toBeUndefined()
    for (const viewerId of [alice.actor.id, bob.actor.id, undefined]) {
        expect(soulFor(room, npc, viewerId).companion?.lastReply).toBe(text)
    }
})
