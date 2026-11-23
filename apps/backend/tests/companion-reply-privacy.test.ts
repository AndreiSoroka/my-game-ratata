import type { ServerMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import type { GameCharacter } from '../src/game/character'
import type { GameRoom } from '../src/game/room'
import { controlledNpcProvider, npcReply } from './npcAiRuntimeFixture'
import {
    joinScenarioRoom,
    openScenarioRoom,
    roomScenario,
} from './scenarioRoomHelpers'

const veteranId = 'npc_veteran_1'
const privateLine = 'Этот ответ я даю только Алисе.'

const rooms: GameRoom[] = []
afterEach(() => {
    for (const room of rooms) {
        room.stop()
    }
    rooms.length = 0
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

async function setup() {
    const provider = controlledNpcProvider()
    const room = openScenarioRoom({
        config: parseNpcAiConfig(
            {
                proactive: false,
                npcs: [{ actorId: veteranId, role: 'companion' }],
            },
            true
        ),
        provider: { decide: provider.decide },
    })
    rooms.push(room)
    const alice = joinScenarioRoom(room, 'Alice')
    const bob = joinScenarioRoom(room, 'Bob')
    const npc = room.getCharacter(veteranId)
    if (npc === undefined) {
        throw new Error('Missing veteran')
    }
    const initialSoul = publicSoul(npc)
    alice.actor.position = { ...npc.position }
    bob.actor.position = { ...npc.position }
    alice.send({ type: 'interact', targetId: npc.id })
    await vi.advanceTimersByTimeAsync(100)
    expect(provider.turns).toHaveLength(1)
    provider.turns[0]?.resolve(npcReply(null, { speech: privateLine }))
    await vi.advanceTimersByTimeAsync(100)
    expect(replies(alice.sent, privateLine)).toMatchObject([
        {
            kind: 'chat',
            actorId: npc.id,
            targetId: alice.actor.id,
            text: privateLine,
        },
    ])
    return { room, alice, bob, npc, provider, initialSoul }
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

function replies(messages: ServerMessage[], text: string) {
    return messages.flatMap((message) =>
        message.type === 'event' &&
        message.event.kind === 'chat' &&
        message.event.text === text
            ? [message.event]
            : []
    )
}

it('omits internal NPC state from join and tick snapshots and delivers modeled replies only to the recipient', async () => {
    const { room, alice, bob, npc, initialSoul } = await setup()
    expect(replies(bob.sent, privateLine)).toEqual([])
    expect(receivedView(alice.sent, 'snapshot').adventure?.dialogue?.text).toBe(
        privateLine
    )
    expect(JSON.stringify(receivedView(bob.sent, 'snapshot'))).not.toContain(
        privateLine
    )

    vi.advanceTimersByTime(50)
    for (const session of [alice, bob]) {
        for (const type of ['world_init', 'snapshot'] as const) {
            const view = characterIn(receivedView(session.sent, type), npc)
            expect(view.soul).toEqual(
                type === 'world_init' ? initialSoul : publicSoul(npc)
            )
            expect(view.interactions?.companionRequests).toBe('available')
        }
    }
    for (const viewerId of [undefined, npc.id]) {
        const view = room.snapshot(Date.now(), npc.locationId, viewerId)
        expect(characterIn(view, npc).soul).toEqual(publicSoul(npc))
        expect(JSON.stringify(view)).not.toContain(privateLine)
    }
})

it('projects viewer-specific companion actions after model consent while keeping internal state private', async () => {
    const { room, alice, bob, npc, provider } = await setup()
    const raw = npc.soul.companion?.lastReply
    bob.send({ type: 'companion_request', request: 'follow', targetId: npc.id })
    await vi.advanceTimersByTimeAsync(100)
    expect(npc.soul.companion?.leaderId).toBeNull()
    expect(provider.turns).toHaveLength(2)
    const consent = 'Боб, я согласен идти вместе.'
    provider.turns[1]?.resolve(
        npcReply(null, {
            taskAcceptance: 'accept',
            companionOrder: 'follow',
            speech: consent,
        })
    )
    await vi.advanceTimersByTimeAsync(100)
    expect(npc.soul.companion?.leaderId).toBe(bob.actor.id)
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
    expect(JSON.stringify(previousRecipient)).not.toContain(consent)
    expect(JSON.stringify(owner)).not.toContain(privateLine)
    const helper = owner.automation?.helpers.find(
        (entry) => entry.actorId === npc.id
    )
    expect(helper).toMatchObject({ actorId: npc.id, canFollow: true })
    expect(helper).not.toHaveProperty('canFight')
    const publicView = room.snapshot(Date.now(), npc.locationId)
    expect(
        characterIn(publicView, npc).interactions?.companionRequests
    ).toBeUndefined()
    expect(
        characterIn(publicView, npc).interactions?.companionCanFight
    ).toBeUndefined()
})

it('clears the private audience when an ordinary model speech intention becomes public', async () => {
    const { room, alice, bob, npc } = await setup()
    const text = 'Добрый день всем путникам.'
    const result = room.decideForAgent(npc.id, { type: 'speak', text })
    expect(result.accepted).toBe(true)
    expect(result.events).toEqual([
        expect.objectContaining({ kind: 'chat', text }),
    ])
    expect(result.events[0]?.audienceIds).toBeUndefined()
    expect(result.events[0]?.targetId).toBeUndefined()
    expect(npc.soul.companion?.lastReply).toBe(text)
    for (const session of [alice, bob]) {
        expect(replies(session.sent, text)).toMatchObject([
            { kind: 'chat', actorId: npc.id, text },
        ])
    }
    expect(replies(bob.sent, privateLine)).toEqual([])
    for (const viewerId of [alice.actor.id, bob.actor.id, undefined]) {
        const view = room.snapshot(Date.now(), npc.locationId, viewerId)
        expect(characterIn(view, npc).soul).toEqual(publicSoul(npc))
    }
})
