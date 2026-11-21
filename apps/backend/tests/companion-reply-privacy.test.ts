import type { ServerMessage, WorldSnapshot } from '@my-game-ratata/contracts'
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

function characterIn(snapshot: WorldSnapshot, npc: GameCharacter) {
    const character = snapshot.characters.find((entry) => entry.id === npc.id)
    if (character === undefined) {
        throw new Error('NPC is missing from its location snapshot')
    }
    return character
}

function receivedView(
    messages: ServerMessage[],
    type: 'world_init' | 'snapshot'
) {
    const message = messages.findLast((entry) => entry.type === type)
    if (message === undefined || !('snapshot' in message)) {
        throw new Error('Expected a serialized room snapshot')
    }
    return message.snapshot
}

function publicSoul(npc: GameCharacter) {
    return {
        canSpeak: npc.soul.canSpeak,
        controlSource: npc.soul.controlSource,
        kind: npc.soul.kind,
    }
}

it('omits internal NPC state from join and tick snapshots and delivers replies only to the recipient', () => {
    const { room, alice, bob, npc } = setup()
    const text = 'Наши дороги пока не были связаны.'
    expect(npc.soul.companion?.lastReply).toBe(text)
    const replies = (messages: ServerMessage[]) =>
        messages.flatMap((message) =>
            message.type === 'event' && message.event.text === text
                ? [message.event]
                : []
        )
    expect(replies(alice.sent)).toMatchObject([
        { kind: 'chat', actorId: npc.id, targetId: alice.actor.id },
    ])
    expect(replies(bob.sent)).toEqual([])

    vi.advanceTimersByTime(50)
    for (const session of [alice, bob]) {
        for (const type of ['world_init', 'snapshot'] as const) {
            const view = characterIn(receivedView(session.sent, type), npc)
            expect(view.soul).toEqual(publicSoul(npc))
            expect(view.interactions?.companionRequests).toBe('available')
        }
    }
    for (const viewerId of [undefined, npc.id]) {
        const view = room.snapshot(Date.now(), npc.locationId, viewerId)
        expect(characterIn(view, npc).soul).toEqual(publicSoul(npc))
    }
})

it('projects companion actions by viewer without exposing the retained reply or combat capability', () => {
    const { room, alice, bob, npc } = setup()
    const raw = npc.soul.companion?.lastReply
    bob.save(
        roomScenario('guard', [
            { id: 'wait', kind: 'wait', durationMs: 30_000 },
        ])
    )
    bob.send({ type: 'scenario_start', scenarioId: 'guard', targetId: npc.id })
    expect(npc.soul.companion?.leaderId).toBe(bob.actor.id)
    expect(npc.soul.companion?.lastReply).toBe(raw)

    vi.advanceTimersByTime(50)
    const previousRecipient = receivedView(alice.sent, 'snapshot')
    const owner = receivedView(bob.sent, 'snapshot')
    expect(characterIn(previousRecipient, npc).soul).toEqual(publicSoul(npc))
    expect(characterIn(owner, npc).soul).toEqual(publicSoul(npc))
    expect(
        characterIn(previousRecipient, npc).interactions?.companionRequests
    ).toBe('occupied')
    expect(characterIn(owner, npc).interactions?.companionRequests).toBe('own')
    const helper = owner.automation?.helpers.find(
        (entry) => entry.actorId === npc.id
    )
    expect(helper).toMatchObject({ actorId: npc.id, canFollow: true })
    expect(helper).not.toHaveProperty('canFight')
    const publicView = room.snapshot(Date.now(), npc.locationId)
    expect(
        characterIn(publicView, npc).interactions?.companionRequests
    ).toBeUndefined()
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
    expect(npc.soul.companion?.lastReply).toBe(text)
    for (const viewerId of [alice.actor.id, bob.actor.id, undefined]) {
        const view = room.snapshot(Date.now(), npc.locationId, viewerId)
        expect(characterIn(view, npc).soul).toEqual(publicSoul(npc))
    }
})
