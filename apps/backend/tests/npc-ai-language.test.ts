import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { memoryForCharacter } from '../src/ai/characterMinds'
import type { GameRoom } from '../src/game/room'
import { openNpcAiRoom, recordedNpcAiProvider } from './npcAiRoomHelpers'
import {
    controlledNpcProvider,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'
import { approachScenarioNpc, joinScenarioRoom } from './scenarioRoomHelpers'

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

function controlledRoom() {
    const provider = controlledNpcProvider()
    const fixture = npcRuntimeFixture(provider.decide)
    rooms.push(fixture.room)
    return { ...fixture, turns: provider.turns }
}

it('answers an English question on the Russian interface and repairs a Russian draft once', async () => {
    const fixture = controlledRoom()
    const text = 'Капля, what can you tell me about this town?'
    fixture.alice.send({ type: 'chat', text })
    await fixture.advance()
    expect(fixture.turns[0]?.context.speechLanguage).toBe('en')
    expect(fixture.turns[0]?.context.questOfferLanguage).toBe('ru')
    expect(fixture.turns[0]?.context.events[0]).toMatchObject({
        kind: 'message',
        text,
        language: 'en',
    })

    const rejected = 'Я многое знаю о городе.'
    fixture.turns[0]?.resolve(npcReply(null, { speech: rejected }))
    await fixture.advance()
    expect(fixture.turns).toHaveLength(2)
    expect(fixture.turns[1]?.context.replyCorrection?.code).toBe(
        'speech_language'
    )
    expect(fixture.speech()).toHaveLength(0)

    const accepted = 'I can tell you about the guild.'
    fixture.turns[1]?.resolve(npcReply(null, { speech: accepted }))
    await fixture.advance()
    expect(fixture.speech()).toMatchObject([{ text: accepted, language: 'en' }])
    const memory = JSON.stringify(memoryForCharacter(fixture.actor).entries())
    expect(memory).toContain(text)
    expect(memory).not.toContain(rejected)
})

it.each([
    ['Kaplya, как твои дела?', 'ru', 'У меня всё хорошо.'],
    ['👋', 'en', 'Good to see you.'],
] as const)(
    'resolves the response language for %s on the English interface',
    async (text, locale, speech) => {
        const fixture = controlledRoom()
        fixture.alice.send({ type: 'set_locale', locale: 'en' })
        fixture.alice.send({
            type: 'whisper',
            targetId: fixture.actor.id,
            text,
        })
        await fixture.advance()
        expect(fixture.turns[0]?.context.speechLanguage).toBe(locale)
        fixture.turns[0]?.resolve(npcReply(null, { speech }))
        await fixture.advance()
        expect(
            fixture.room.social.whispers.heardMessages(fixture.alice.actor.id)
        ).toContainEqual(
            expect.objectContaining({
                senderId: fixture.actor.id,
                text: speech,
                language: locale,
            })
        )
    }
)

it('carries the request language to a later task report after a locale change', async () => {
    const fixture = controlledRoom()
    fixture.alice.send({ type: 'set_locale', locale: 'en' })
    fixture.alice.send({
        type: 'chat',
        targetId: fixture.actor.id,
        text: 'Please look into this for me.',
    })
    await fixture.advance()
    fixture.alice.send({ type: 'set_locale', locale: 'ru' })
    fixture.turns[0]?.resolve(
        npcReply(null, {
            speech: 'I can look into it.',
            taskAcceptance: 'accept',
            done: false,
        })
    )
    await fixture.advance(1500)
    expect(fixture.turns[1]?.context.speechLanguage).toBe('en')
    expect(fixture.turns[1]?.context.task?.language).toBe('en')
    fixture.turns[1]?.resolve(npcReply(null, { speech: 'Here is my report.' }))
    await fixture.advance()
    expect(fixture.speech().at(-1)).toMatchObject({
        text: 'Here is my report.',
        language: 'en',
    })
})

it('uses Russian knowledge retrieval and keeps the English speech language in the follow-up', async () => {
    const recorded = recordedNpcAiProvider((context) =>
        context.knowledge === undefined
            ? npcReply(null, {
                  informationRequest: {
                      type: 'knowledge_search',
                      query: 'срубить дерево топор меч пень',
                  },
              })
            : npcReply(null, { speech: 'Use an axe or a sword.' })
    )
    const fixture = npcRuntimeFixture((context, settings, signal) =>
        recorded.provider.decide(context, settings, signal)
    )
    rooms.push(fixture.room)
    fixture.talk('How do I chop down a tree?')
    await fixture.advance(1500)
    expect(
        recorded.contexts.map(({ speechLanguage }) => speechLanguage)
    ).toEqual(['en', 'en'])
    expect(recorded.contexts[1]?.knowledge?.entries).toContainEqual(
        expect.objectContaining({ id: 'forestry.chopping' })
    )
    expect(fixture.speech()).toMatchObject([
        { text: 'Use an axe or a sword.', language: 'en' },
    ])
})

it('uses the addressed player locale for a proactive greeting', async () => {
    const recorded = recordedNpcAiProvider(() =>
        npcReply(null, { speech: 'Hello, traveler!' })
    )
    const { room, config } = openNpcAiRoom(recorded.provider)
    rooms.push(room)
    const player = joinScenarioRoom(room, 'Greeting language guest')
    player.send({ type: 'set_locale', locale: 'en' })
    config.proactive = true
    const actor = approachScenarioNpc(room, player, 'npc_magic_slime_1')
    await vi.advanceTimersByTimeAsync(500)
    expect(recorded.contexts[0]).toMatchObject({
        speechLanguage: 'en',
        socialOpportunity: { targetId: player.actor.id },
    })
    const spoken = player.sent.flatMap((message) =>
        message.type === 'event' &&
        message.event.kind === 'chat' &&
        message.event.actorId === actor.id
            ? [message.event]
            : []
    )
    expect(spoken).toMatchObject([{ text: 'Hello, traveler!', language: 'en' }])
})
