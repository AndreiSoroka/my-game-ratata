import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { memoryForCharacter } from '../src/ai/characterMinds'
import type { NpcAiContext, NpcAiReply } from '../src/ai/types'
import type { GameRoom } from '../src/game/room'
import {
    advanceNpcAi,
    approachNpcAi,
    existingNpc,
    openNpcAiRoom,
    recordedNpcAiProvider,
    requestNpcAi,
    waitForNpcAi,
} from './npcAiRoomHelpers'
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
const answer = (speech: string | null = null, memory = ''): NpcAiReply => ({
    decision: null,
    speech,
    memory,
    done: true,
    waitMs: 0,
    taskAcceptance: 'none',
    companionOrder: null,
})
const opportunities = (contexts: NpcAiContext[]) =>
    contexts.filter((context) => context.socialOpportunity !== undefined)

it('initiates a real first greeting and another after ten conversation-free minutes without inventing player speech', async () => {
    const recorded = recordedNpcAiProvider((context) =>
        answer(
            context.socialOpportunity === undefined
                ? null
                : 'Привет! Давай поговорим.'
        )
    )
    const { room, config } = openNpcAiRoom(recorded.provider)
    rooms.push(room)
    config.proactive = true
    const player = joinScenarioRoom(room, 'First Guest')
    const npc = existingNpc(room)
    await approachNpcAi(room, player, npc)
    await waitForNpcAi(
        () =>
            opportunities(recorded.contexts).length === 1 &&
            memoryForCharacter(npc).lastConversationAt(player.actor.id) !==
                undefined
    )
    const firstAt = memoryForCharacter(npc).lastConversationAt(player.actor.id)
    if (firstAt === undefined) {
        throw new Error('Greeting was not delivered')
    }
    expect(
        opportunities(recorded.contexts)[0]?.events.some(
            (event) => event.kind === 'message'
        )
    ).toBe(false)
    expect(
        opportunities(recorded.contexts)[0]?.socialOpportunity
    ).toMatchObject({ targetId: player.actor.id, reason: 'first_conversation' })
    vi.setSystemTime(firstAt + 599_000)
    await advanceNpcAi(250)
    expect(opportunities(recorded.contexts)).toHaveLength(1)
    vi.setSystemTime(firstAt + 600_000)
    await waitForNpcAi(
        () =>
            opportunities(recorded.contexts).length === 2 &&
            memoryForCharacter(npc).lastConversationAt(player.actor.id) !==
                firstAt
    )
    expect(opportunities(recorded.contexts)[1]?.socialOpportunity?.reason).toBe(
        'conversation_pause'
    )
    await advanceNpcAi(1000)
    expect(opportunities(recorded.contexts)).toHaveLength(2)
})

it('archives a permanently dead hero and greets a new same-named identity without its old conversation', async () => {
    const recorded = recordedNpcAiProvider((context) =>
        context.socialOpportunity === undefined
            ? answer(
                  'Запомнил наш разговор.',
                  'С этим героем искали западную окраину.'
              )
            : answer('Привет! Кажется, мы ещё не говорили.')
    )
    const { room, config } = openNpcAiRoom(recorded.provider)
    rooms.push(room)
    const old = joinScenarioRoom(room, 'andrei')
    const npc = existingNpc(room)
    await approachNpcAi(room, old, npc)
    requestNpcAi(old, npc, 'Мы искали западную окраину.')
    await waitForNpcAi(
        () =>
            memoryForCharacter(npc)
                .deep(old.actor.id)
                .messages?.some(
                    (entry) => entry.text === 'Запомнил наш разговор.'
                ) === true
    )
    old.actor.applyDamage(old.actor.maxHp, Date.now())
    old.send({ type: 'abandon_life' })
    expect(room.getCharacter(old.actor.id)).toBeUndefined()
    expect(memoryForCharacter(npc).deep(old.actor.id)).toMatchObject({
        status: 'found',
        identityStatus: 'archived',
    })
    const fresh = joinScenarioRoom(room, 'andrei')
    expect(fresh.actor.id).not.toBe(old.actor.id)
    config.proactive = true
    await approachNpcAi(room, fresh, npc)
    await waitForNpcAi(() =>
        opportunities(recorded.contexts).some(
            (context) => context.socialOpportunity?.targetId === fresh.actor.id
        )
    )
    const context = opportunities(recorded.contexts).find(
        (input) => input.socialOpportunity?.targetId === fresh.actor.id
    )
    expect(context?.conversation?.person?.id).toBe(fresh.actor.id)
    expect(context?.memory).not.toContain('западную')
    expect(JSON.stringify(context?.conversation?.recent)).not.toContain(
        old.actor.id
    )
    expect(
        context?.conversation?.relevant.some(
            (entry) =>
                entry.senderId === old.actor.id ||
                entry.conversationPartnerId === old.actor.id ||
                entry.text.includes('искали западную окраину')
        )
    ).toBe(false)
    expect(
        memoryForCharacter(npc)
            .deep(old.actor.id)
            .messages?.some((entry) => entry.text.includes('западную'))
    ).toBe(true)
})

it('cancels a delayed reply to a retired identity rather than delivering it to a new same-named hero', async () => {
    const delayed = Promise.withResolvers<NpcAiReply>()
    const recorded = recordedNpcAiProvider((context) =>
        context.events.some(
            (event) =>
                event.kind === 'message' && event.text === 'Подожди с ответом'
        )
            ? delayed.promise
            : answer(
                  context.socialOpportunity === undefined
                      ? null
                      : 'Привет новому гостю.'
              )
    )
    const { room, config } = openNpcAiRoom(recorded.provider)
    rooms.push(room)
    const old = joinScenarioRoom(room, 'same-name')
    const npc = existingNpc(room)
    await approachNpcAi(room, old, npc)
    requestNpcAi(old, npc, 'Подожди с ответом')
    await waitForNpcAi(() => recorded.contexts.length === 1)
    old.actor.applyDamage(old.actor.maxHp, Date.now())
    old.send({ type: 'abandon_life' })
    expect(recorded.signals[0]?.aborted).toBe(true)
    const fresh = joinScenarioRoom(room, 'same-name')
    config.proactive = true
    await approachNpcAi(room, fresh, npc)
    await waitForNpcAi(() => opportunities(recorded.contexts).length === 1)
    delayed.resolve(
        answer('Мы уже искали западную окраину.', 'Старое узнавание')
    )
    await advanceNpcAi(250)
    expect(
        fresh.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.text === 'Мы уже искали западную окраину.'
        )
    ).toBe(false)
    expect(
        memoryForCharacter(npc)
            .context(fresh.actor.id, 'запад')
            .relevant.some(
                (entry) =>
                    entry.senderId === old.actor.id ||
                    entry.text.includes('Мы уже искали западную окраину')
            )
    ).toBe(false)
})
