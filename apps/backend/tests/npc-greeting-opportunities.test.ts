import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { memoryForCharacter } from '../src/ai/characterMinds'
import { defaultNpcAiSettings } from '../src/ai/config'
import { attributeNpcSpeech } from '../src/ai/memorySpeechAttribution'
import {
    greetingOpportunity,
    markNpcGreetingAttempt,
    npcGreetingStillAvailable,
    selectNpcGreeting,
} from '../src/ai/npcInitiative'
import { buildNpcAiObservation } from '../src/ai/observation'
import { createNpcAiState } from '../src/ai/runtimeState'
import { GameRoom } from '../src/game/room'
import { createSpeechEvent } from '../src/game/speechReceipts'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const rooms: GameRoom[] = []
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(() => {
    rooms.splice(0).forEach((room) => room.stop())
    vi.useRealTimers()
    vi.unstubAllGlobals()
})
function setup() {
    const room = new GameRoom()
    rooms.push(room)
    const human = joinScenarioRoom(room, 'Hello Hero').actor
    const actor = room.getCharacter('npc_magic_slime_1')
    if (actor === undefined) {
        throw new Error('Missing Kaplya')
    }
    actor.position = { ...human.position }
    const state = createNpcAiState(
        {
            actorId: actor.id,
            role: 'companion',
            settings: defaultNpcAiSettings,
        },
        actor
    )
    state.mind.observe(
        human.id,
        human.nickname,
        human.position,
        human.locationId,
        1000
    )
    const observation = () =>
        buildNpcAiObservation(room, actor, 'companion', Date.now())
    return { room, human, actor, state, observation }
}

it('greets a connected first-time human and becomes eligible again after ten minutes without conversation', () => {
    const f = setup()
    expect(
        selectNpcGreeting(f.room, f.state, f.observation(), 1000)
    ).toMatchObject({ targetId: f.human.id, reason: 'first_conversation' })
    const event = attributeNpcSpeech(
        createSpeechEvent(f.actor, 'Привет! Я Капля.'),
        f.human.id
    )
    f.room.publishEvents([event])
    expect(event.targetId).toBeUndefined()
    expect(f.state.mind.lastConversationAt(f.human.id)).toBe(1000)
    expect(
        greetingOpportunity(f.state.mind, f.human.id, 600_999)
    ).toBeUndefined()
    expect(
        greetingOpportunity(f.state.mind, f.human.id, 601_000)
    ).toMatchObject({ reason: 'conversation_pause' })
    f.state.mind.observe(
        f.human.id,
        f.human.nickname,
        f.human.position,
        f.human.locationId,
        601_000
    )
    expect(
        selectNpcGreeting(f.room, f.state, f.observation(), 601_000)
    ).toMatchObject({ reason: 'conversation_pause' })
})

it('backs off failed attempts without pretending a conversation was delivered', () => {
    const f = setup()
    markNpcGreetingAttempt(f.state, f.human.id, 1000)
    expect(
        selectNpcGreeting(f.room, f.state, f.observation(), 60_999)
    ).toBeUndefined()
    expect(
        selectNpcGreeting(f.room, f.state, f.observation(), 61_000)
    ).toBeDefined()
    expect(f.state.mind.lastConversationAt(f.human.id)).toBeUndefined()
})

it('does not greet during incoming conversation, accepted work or a foreign companion commitment', () => {
    const f = setup()
    f.state.inbox.push({
        kind: 'message',
        id: 'private',
        senderId: 'other',
        text: 'Тихий разговор',
        channel: 'whisper',
        at: 1,
        locationId: f.actor.locationId,
        position: f.actor.position,
    })
    expect(
        selectNpcGreeting(f.room, f.state, f.observation(), 1000)
    ).toBeUndefined()
    f.state.inbox = []
    f.state.task = {
        id: 'work',
        requesterId: f.human.id,
        request: 'Проверка',
        steps: 1,
    }
    expect(
        selectNpcGreeting(f.room, f.state, f.observation(), 1000)
    ).toBeUndefined()
    f.state.task = null
    if (f.actor.soul.companion === null) {
        throw new Error('Missing shared companion state')
    }
    f.actor.soul.companion.leaderId = 'another-person'
    expect(
        selectNpcGreeting(f.room, f.state, f.observation(), 1000)
    ).toBeUndefined()
})

it('revalidates the intended identity and hearing before a delayed greeting and never starts NPC loops', () => {
    const f = setup()
    expect(npcGreetingStillAvailable(f.room, f.state, f.human.id, 1000)).toBe(
        true
    )
    f.human.connected = false
    expect(npcGreetingStillAvailable(f.room, f.state, f.human.id, 1000)).toBe(
        false
    )
    expect(
        selectNpcGreeting(f.room, f.state, f.observation(), 1000)
    ).toBeUndefined()
    f.human.connected = true
    f.state.mind.archivePerson(f.human.id, 1001)
    expect(npcGreetingStillAvailable(f.room, f.state, f.human.id, 1001)).toBe(
        false
    )
    expect(
        greetingOpportunity(f.state.mind, 'a-new-identity', 1001)
    ).toMatchObject({ reason: 'first_conversation' })
})

it('does not count another NPC overhearing a directed public greeting as that NPC conversation', () => {
    const f = setup()
    const mira = f.room.getCharacter('npc_friendly_girl_1')
    if (mira === undefined) {
        throw new Error('Missing Mira')
    }
    mira.position = { ...f.human.position }
    f.room.publishEvents([
        attributeNpcSpeech(
            createSpeechEvent(f.actor, 'Привет, герой.'),
            f.human.id
        ),
    ])
    expect(
        memoryForCharacter(mira).lastConversationAt(f.human.id)
    ).toBeUndefined()
    expect(f.state.mind.lastConversationAt(f.human.id)).toBe(1000)
})
