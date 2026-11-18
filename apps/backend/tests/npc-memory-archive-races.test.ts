import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { CharacterKnowledge } from '../src/ai/characterKnowledge'
import { CharacterMemory } from '../src/ai/characterMemory'
import { defaultNpcAiSettings } from '../src/ai/config'
import { npcKnowledgeInformation } from '../src/ai/knowledgeInformation'
import { createNpcAiState } from '../src/ai/runtimeState'
import { GameRoom } from '../src/game/room'

const rooms: GameRoom[] = []
beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => {
    rooms.splice(0).forEach((room) => room.stop())
    vi.unstubAllGlobals()
})
function fixture() {
    const room = new GameRoom()
    rooms.push(room)
    const actor = room.getCharacter('npc_magic_slime_1')
    if (actor === undefined) {
        throw new Error('Missing Kaplya')
    }
    const mind = new CharacterMemory(actor.id)
    mind.remember({
        id: 'old-conversation',
        senderId: 'old-player',
        senderName: 'andrei',
        recipientId: actor.id,
        text: 'Искали западную окраину',
        source: 'heard',
        channel: 'whisper',
        at: 1,
        locationId: actor.locationId,
    })
    const entered = Promise.withResolvers<undefined>()
    const gate = Promise.withResolvers<undefined>()
    const knowledge = new CharacterKnowledge(
        {
            embed: async (texts, query) => {
                if (query === true) {
                    entered.resolve(undefined)
                    await gate.promise
                }
                return texts.map(() => [1])
            },
        },
        () => undefined,
        () => []
    )
    return { room, actor, mind, knowledge, entered, gate }
}

it('does not return an archived conversation captured before an asynchronous normal search', async () => {
    const f = fixture()
    try {
        const pending = f.knowledge.retrieve(
            f.actor,
            f.room.navigationFor(f.actor),
            f.mind,
            'западную окраину'
        )
        await f.entered.promise
        f.mind.archivePerson('old-player', 2)
        f.gate.resolve(undefined)
        expect((await pending).memories).toEqual([])
        expect(f.mind.deep('old-player').messages).toHaveLength(1)
    } finally {
        f.gate.resolve(undefined)
        f.knowledge.stop()
    }
})

it('marks an explicitly requested exact-ID history as archived after an asynchronous lookup', async () => {
    const f = fixture()
    try {
        const pending = f.knowledge.deep(
            f.mind,
            'old-player',
            'западную окраину'
        )
        await f.entered.promise
        f.mind.archivePerson('old-player', 2)
        f.gate.resolve(undefined)
        expect(await pending).toMatchObject({
            personId: 'old-player',
            status: 'found',
            identityStatus: 'archived',
        })
    } finally {
        f.gate.resolve(undefined)
        f.knowledge.stop()
    }
})

it('invalidates a live information turn when its memory becomes historical while awaiting a result', async () => {
    const f = fixture()
    const state = createNpcAiState(
        {
            actorId: f.actor.id,
            role: 'advisor',
            mode: 'dialogue_only',
            settings: defaultNpcAiSettings,
        },
        f.actor
    )
    state.mind = f.mind
    state.token = 'manual-dialogue'
    const information = npcKnowledgeInformation({
        state,
        actor: f.actor,
        room: f.room,
        knowledge: f.knowledge,
        companions: { isModelControlOwner: () => true },
        current: () => true,
        clock: () => 1,
    })
    try {
        const pending = information.lookup?.('old-player')
        await f.entered.promise
        f.mind.archivePerson('old-player', 2)
        f.gate.resolve(undefined)
        await expect(pending).rejects.toThrow('authority changed')
    } finally {
        f.gate.resolve(undefined)
        f.knowledge.stop()
    }
})
