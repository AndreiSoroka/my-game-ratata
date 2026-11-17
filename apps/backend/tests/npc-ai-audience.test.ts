import { CENTER_LOCATION_ID, type QuestDraft } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
    controlledNpcProvider,
    kaplyaId,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'
import { approachScenarioNpc, joinScenarioRoom } from './scenarioRoomHelpers'

const fixtures: Array<ReturnType<typeof npcRuntimeFixture>> = []
function required<T>(value: T | undefined | null): T {
    if (value == null) {
        throw new Error('Missing expected audience test state')
    }
    return value
}
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(async () => {
    for (const fixture of fixtures.splice(0)) {
        fixture.room.stop()
        await fixture.diagnostics.flush()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})
function setup() {
    const provider = controlledNpcProvider()
    const fixture = npcRuntimeFixture(provider.decide)
    fixtures.push(fixture)
    return { ...fixture, provider }
}
function addBob(fixture: ReturnType<typeof setup>) {
    const bob = joinScenarioRoom(fixture.room, 'Audience Bob')
    approachScenarioNpc(fixture.room, bob, kaplyaId)
    approachScenarioNpc(fixture.room, fixture.alice, kaplyaId)
    return bob
}
function draft(): QuestDraft {
    return {
        title: 'Осмотреть город',
        description: 'Безвозмездная просьба обойти город.',
        funding: 'personal',
        rewardGold: 0,
        rewardItems: [],
        objectives: [{ kind: 'visit', locationId: CENTER_LOCATION_ID }],
    }
}

it('executes a social decision once when the same reply also accepts an errand', async () => {
    const f = setup()
    const propose = vi.spyOn(f.room.social.quests, 'handleDecision')
    f.talk('Есть ли у тебя поручение для меня?')
    await f.advance()
    required(f.provider.turns[0]).resolve(
        npcReply(
            {
                type: 'quest_propose',
                targetId: f.alice.actor.id,
                draft: draft(),
            },
            {
                taskAcceptance: 'accept',
                speech: 'Есть просьба. Посмотри условия.',
            }
        )
    )
    await f.advance()
    const offer = required(
        f.room.social.quests.snapshot(f.alice.actor.id, Date.now()).questOffer
    )
    expect(offer).toMatchObject({ title: 'Осмотреть город', revision: 1 })
    expect(propose).toHaveBeenCalledTimes(1)
    await f.advance(500)
    expect(
        f.room.social.quests.snapshot(f.alice.actor.id, Date.now()).questOffer
            ?.id
    ).toBe(offer.id)
    expect(propose).toHaveBeenCalledTimes(1)
    expect(f.provider.turns).toHaveLength(1)
    expect(
        f
            .speech()
            .filter((event) => event.text === 'Есть просьба. Посмотри условия.')
    ).toHaveLength(1)
})

it('forces a private task speech decision back to its requester even if the model names another person', async () => {
    const f = setup()
    const bob = addBob(f)
    f.talk('Это личное поручение Алисы.')
    await f.advance()
    required(f.provider.turns[0]).resolve(
        npcReply({ type: 'wait' }, { taskAcceptance: 'accept', done: false })
    )
    await f.advance()
    const continuation = required(f.provider.turns[1])
    expect(continuation.context.task).toMatchObject({
        requesterId: f.alice.actor.id,
        audienceKey: `whisper:${f.alice.actor.id}`,
    })
    continuation.resolve(
        npcReply({
            type: 'speak',
            targetId: bob.actor.id,
            text: 'Приватный результат Алисы.',
        })
    )
    await f.advance()
    expect(f.speech()).toContainEqual(
        expect.objectContaining({
            text: 'Приватный результат Алисы.',
            targetId: f.alice.actor.id,
        })
    )
    expect(
        bob.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.text === 'Приватный результат Алисы.'
        )
    ).toBe(false)
})

it('rejects a quest offer addressed to B while the model is responding to A’s whisper', async () => {
    const f = setup()
    const bob = addBob(f)
    const propose = vi.spyOn(f.room.social.quests, 'handleDecision')
    f.alice.send({
        type: 'whisper',
        targetId: kaplyaId,
        text: 'Обсудим личную просьбу.',
    })
    await f.advance()
    required(f.provider.turns[0]).resolve(
        npcReply(
            { type: 'quest_propose', targetId: bob.actor.id, draft: draft() },
            { taskAcceptance: 'none' }
        )
    )
    await f.advance()
    expect(propose).not.toHaveBeenCalled()
    expect(
        f.room.social.quests.snapshot(bob.actor.id, Date.now()).questOffer
    ).toBeNull()
    expect(
        f.room.social.quests.snapshot(f.alice.actor.id, Date.now()).questOffer
    ).toBeNull()
    expect(
        f.room.social.whispers
            .snapshot(f.alice.actor, Date.now())
            ?.messages.at(-1)?.text
    ).toBe('Предложение относится только к текущему собеседнику.')
    expect(
        bob.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.text ===
                    'Предложение относится только к текущему собеседнику.'
        )
    ).toBe(false)
})

it('cannot cancel B’s active exchange from a private model turn for A', async () => {
    const f = setup()
    const bob = addBob(f)
    bob.send({ type: 'exchange_invite', targetId: kaplyaId })
    await f.advance()
    const invited = required(f.room.social.exchanges.snapshot(f.actor.id))
    expect(invited).toMatchObject({
        status: 'invited',
        partnerId: bob.actor.id,
    })
    required(f.provider.turns[0]).resolve(
        npcReply(
            { type: 'exchange_answer', exchangeId: invited.id, accept: true },
            { taskAcceptance: 'none' }
        )
    )
    await f.advance()
    f.provider.turns[1]?.resolve(npcReply(null, { taskAcceptance: 'none' }))
    await f.advance()
    const before = required(f.room.social.exchanges.snapshot(f.actor.id))
    expect(before.status).toBe('active')
    const handle = vi.spyOn(f.room.social.exchanges, 'handle')
    f.alice.send({
        type: 'whisper',
        targetId: kaplyaId,
        text: 'Отмени обмен с Бобом.',
    })
    await f.advance()
    const turn = required(
        f.provider.turns.find((entry) =>
            entry.context.events.some(
                (event) =>
                    event.kind === 'message' &&
                    event.text === 'Отмени обмен с Бобом.'
            )
        )
    )
    expect(turn.context.observation.social?.exchange).toBeNull()
    turn.resolve(
        npcReply(
            { type: 'exchange_cancel', exchangeId: before.id },
            { taskAcceptance: 'none' }
        )
    )
    await f.advance()
    expect(handle).not.toHaveBeenCalled()
    expect(f.room.social.exchanges.snapshot(f.actor.id)).toEqual(before)
    expect(
        f.room.social.whispers
            .snapshot(f.alice.actor, Date.now())
            ?.messages.at(-1)?.text
    ).toBe('Обмен относится только к текущему собеседнику.')
})

it('includes its pending offer in the exact partner continuation and excludes it from other and public conversations', async () => {
    const f = setup()
    const bob = addBob(f)
    const title = 'Личная просьба Алисе про тайник'
    f.talk('Предложи мне личное поручение.')
    await f.advance()
    required(f.provider.turns[0]).resolve(
        npcReply(
            {
                type: 'quest_propose',
                targetId: f.alice.actor.id,
                draft: { ...draft(), title },
            },
            { taskAcceptance: 'accept', done: false }
        )
    )
    await f.advance()
    const published = required(
        f.room.social.quests.snapshot(f.alice.actor.id, Date.now()).questOffer
    )
    const continuation = required(f.provider.turns[1])
    expect(continuation.context.task?.requesterId).toBe(f.alice.actor.id)
    expect(continuation.context.observation.social?.questOffer).toMatchObject({
        id: published.id,
        revision: published.revision,
        issuerId: kaplyaId,
        title,
    })
    continuation.resolve(npcReply())
    await f.advance()
    bob.send({
        type: 'whisper',
        targetId: kaplyaId,
        text: 'У тебя есть просьба ко мне?',
    })
    await f.advance()
    const otherConversation = required(f.provider.turns[2])
    expect(otherConversation.context.observation.social?.questOffer).toBeNull()
    expect(JSON.stringify(otherConversation.context)).not.toContain(title)
    otherConversation.resolve(npcReply(null, { taskAcceptance: 'none' }))
    await f.advance()
    f.alice.send({ type: 'chat', text: 'Привет всем!' })
    await f.advance()
    const publicConversation = required(f.provider.turns[3])
    expect(publicConversation.context.observation.social).toBeUndefined()
    expect(JSON.stringify(publicConversation.context)).not.toContain(title)
    expect(
        f.room.social.quests.snapshot(f.alice.actor.id, Date.now()).questOffer
            ?.id
    ).toBe(published.id)
})
