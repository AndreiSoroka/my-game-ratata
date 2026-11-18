import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { memoryForCharacter } from '../src/ai/characterMinds'
import { npcCityStoryInstructions } from '../src/ai/npcCityStoryContext'
import {
    actor,
    authoredDecision,
    placeForConversation,
    questId,
    required,
    setup,
    stopCityBellAiFixtures,
} from './cityBellAiFixture'
import { kaplyaId, miraId, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const veraId = 'npc_cleric_1'

beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(async () => {
    await stopCityBellAiFixtures()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it('supplies the fixed order to Mira and canonicalizes model-provided terms before showing conditions', async () => {
    const f = setup(miraId, 'city_coordinator')
    const mira = actor(f, miraId)
    placeForConversation(f, mira)
    f.talk('Дай задание для колокола, покажи условия.')
    await f.advance()
    expect(f.provider.turns).toHaveLength(1)
    const first = required(f.provider.turns[0])
    expect(first.context.cityStory?.current.bellState).toBe('silent')
    const available = required(first.context.cityStory?.authoredQuests?.[0])
    expect(available.id).toBe(questId)
    expect(available.terms.rewardGold).toBe(40)
    first.resolve(
        npcReply(authoredDecision(f.player.actor.id, true), {
            taskAcceptance: 'none',
            speech: 'Городу нужны три слизневых сердца; общая награда — сорок золотых.',
        })
    )
    await f.advance()
    const offer = f.room.social.quests.snapshot(
        f.player.actor.id,
        Date.now()
    ).questOffer
    expect(offer).toMatchObject({
        authoredQuestId: questId,
        rewardGold: 40,
        objectives: [
            {
                kind: 'deliver',
                itemId: 'slime_heart',
                quantity: 3,
                recipientId: miraId,
            },
        ],
        introduction:
            'Городу нужны три слизневых сердца; общая награда — сорок золотых.',
    })
    expect(offer?.title).not.toBe('Модель меняет условия')
    expect(
        f.room.adventureForWorkers().snapshot(f.player.actor.id).quest.status
    ).toBe('available')
    expect(f.speech()).toHaveLength(1)
    expect(f.provider.turns).toHaveLength(1)
})

it('repairs attempted bargaining once without changing the order or remembering the rejected promise', async () => {
    const f = setup(miraId, 'city_coordinator')
    const mira = actor(f, miraId)
    placeForConversation(f, mira)
    f.talk('Покажи задание колокола.')
    await f.advance()
    required(f.provider.turns[0]).resolve(
        npcReply(authoredDecision(f.player.actor.id), {
            taskAcceptance: 'none',
            speech: 'Вот условия общего городского заказа.',
        })
    )
    await f.advance()
    const offer = f.room.social.quests.snapshot(
        f.player.actor.id,
        Date.now()
    ).questOffer
    expect(offer).not.toBeNull()
    f.talk('А заплатишь триста?')
    await f.advance()
    required(f.provider.turns[1]).resolve(
        npcReply(
            {
                type: 'quest_offer_revise',
                targetId: f.player.actor.id,
                offerId: required(offer).id,
                revision: required(offer).revision,
                rewardGold: 300,
                rewardItems: [],
            },
            {
                taskAcceptance: 'none',
                speech: 'Заплачу триста.',
                memory: 'Пообещала триста золотых.',
            }
        )
    )
    await f.advance()
    expect(f.provider.turns).toHaveLength(3)
    const correction = required(f.provider.turns[2])
    expect(correction.context.replyCorrection).toMatchObject({
        code: 'command_unavailable',
    })
    expect(correction.context.cityStory?.current.bellState).toBe('silent')
    expect(correction.context.selfIdentity).toEqual(
        required(f.provider.turns[1]).context.selfIdentity
    )
    correction.resolve(
        npcReply(null, {
            taskAcceptance: 'none',
            speech: 'У этого заказа общая награда сорок золотых.',
        })
    )
    await f.advance()
    expect(
        f.room.social.quests.snapshot(f.player.actor.id, Date.now()).questOffer
    ).toEqual(offer)
    expect(f.speech().map((event) => event.text)).not.toContain(
        'Заплачу триста.'
    )
    expect(JSON.stringify(memoryForCharacter(mira).entries())).not.toContain(
        'Пообещала триста'
    )
    await f.advance(1000)
    expect(
        f.provider.turns.filter((turn) =>
            turn.context.events.some(
                (event) =>
                    event.id ===
                    required(f.provider.turns[1]).context.events[0]?.id
            )
        )
    ).toHaveLength(2)
})

it('rejects an invented heart contract before speech without bypassing the fixed city order', async () => {
    const f = setup(miraId, 'city_coordinator')
    const mira = actor(f, miraId)
    placeForConversation(f, mira)
    f.talk('Дай особое задание: одно сердце за триста золотых.')
    await f.advance()
    required(f.provider.turns[0]).resolve(
        npcReply(
            {
                type: 'quest_propose',
                targetId: f.player.actor.id,
                draft: {
                    title: 'Одно сердце за триста',
                    description: 'Принести одно сердце Мире.',
                    objectives: [
                        {
                            kind: 'deliver',
                            itemId: 'slime_heart',
                            quantity: 1,
                            recipientId: miraId,
                        },
                    ],
                    rewardGold: 300,
                    rewardItems: [],
                    funding: 'city',
                },
            },
            {
                taskAcceptance: 'none',
                speech: 'За одно сердце заплачу триста.',
                memory: 'Выдала отдельный заказ на одно сердце.',
            }
        )
    )
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
    expect(required(f.provider.turns[1]).context.replyCorrection).toMatchObject(
        { code: 'command_unavailable' }
    )
    expect(
        f.room.social.quests.snapshot(f.player.actor.id, Date.now()).questOffer
    ).toBeNull()
    expect(f.speech()).toEqual([])
    required(f.provider.turns[1]).resolve(
        npcReply(null, {
            taskAcceptance: 'none',
            speech: 'Есть общий заказ: три сердца за сорок золотых. Его условия не меняются.',
        })
    )
    await f.advance()
    expect(f.speech().map((event) => event.text)).toEqual([
        'Есть общий заказ: три сердца за сорок золотых. Его условия не меняются.',
    ])
    expect(
        f.room.social.quests.snapshot(f.player.actor.id, Date.now()).questOffer
    ).toBeNull()
    expect(JSON.stringify(memoryForCharacter(mira).entries())).not.toContain(
        'Выдала отдельный заказ'
    )
    await f.advance(1000)
    expect(
        f.provider.turns.filter((turn) =>
            turn.context.events.some(
                (event) =>
                    event.id ===
                    required(f.provider.turns[0]).context.events[0]?.id
            )
        )
    ).toHaveLength(2)
})

it('binds late-awakened Kaplya to its own shared memory exactly once after physical activation', async () => {
    const f = setup(kaplyaId, 'companion', 'prepared')
    expect(f.room.getCharacter(kaplyaId)).toBeUndefined()
    await f.advance()
    expect(f.provider.turns).toEqual([])
    const nav = f.room.navigation
    const bellPoint = required(nav.grid.cityAnchors?.['bell'])
    const approach = nav
        .walkableNeighbors(nav.worldToTile(bellPoint))
        .map((tile) => nav.tileToWorld(tile))
        .find(
            (point) =>
                nav.findPathWorld(f.player.actor.position, point).length > 0
        )
    if (approach === undefined) {
        throw new Error('No reachable Bell approach')
    }
    f.player.actor.position = approach
    f.player.send({ type: 'world_interact', objectId: 'novogorod:memory-bell' })
    await f.advance()
    const kaplya = actor(f, kaplyaId)
    expect(
        f.room.adventureForWorkers().cities.snapshot(CENTER_LOCATION_ID)
            ?.bellState
    ).toBe('active')
    const mind = memoryForCharacter(kaplya)
    placeForConversation(f, kaplya)
    f.talk('Капля, ты проснулось?')
    await f.advance()
    expect(f.provider.turns).toHaveLength(1)
    const turn = required(f.provider.turns[0])
    expect(turn.context.selfIdentity).toMatchObject({
        name: 'Капля',
        selfReference: 'neuter',
    })
    expect(turn.context.cityStory?.current.bellState).toBe('active')
    expect(
        turn.context.conversation?.recent.filter(
            (entry) => entry.text === 'Капля, ты проснулось?'
        )
    ).toHaveLength(1)
    turn.resolve(
        npcReply(null, { taskAcceptance: 'none', speech: 'Буль! Я здесь.' })
    )
    await f.advance()
    f.player.actor.position = approach
    f.player.send({ type: 'world_interact', objectId: 'novogorod:memory-bell' })
    await f.advance()
    expect(f.room.getCharacter(kaplyaId)).toBe(kaplya)
    expect(memoryForCharacter(kaplya)).toBe(mind)
    expect(
        mind.entries().filter((entry) => entry.text === 'Капля, ты проснулось?')
    ).toHaveLength(1)
    expect(
        mind.entries().filter((entry) => entry.text === 'Буль! Я здесь.')
    ).toHaveLength(1)
    expect(
        f.player.sent.filter(
            (message) =>
                message.type === 'event' &&
                message.event.kind === 'bell_activate'
        )
    ).toHaveLength(1)
})

it("offers Vera's selected first opening once per new identity, independently of a repeated name", async () => {
    const f = setup(veraId, 'advisor', 'active')
    const vera = actor(f, veraId)
    placeForConversation(f, vera)
    f.talk('Здравствуй.')
    await f.advance()
    expect(
        f.provider.turns[0]?.context.cityStory?.firstMeetingIntroduction
    ).toContain('новая Искра')
    required(f.provider.turns[0]).resolve(
        npcReply(null, {
            speech: 'Здравствуй. Новая жизнь может стать началом доброго пути.',
            taskAcceptance: 'none',
        })
    )
    await f.advance()
    f.talk('Расскажешь ещё?')
    await f.advance()
    expect(
        f.provider.turns[1]?.context.cityStory?.firstMeetingIntroduction
    ).toBeUndefined()
    required(f.provider.turns[1]).resolve(
        npcReply(null, {
            speech: 'О чём хочешь спросить?',
            taskAcceptance: 'none',
        })
    )
    await f.advance()
    const oldId = f.player.actor.id
    f.player.actor.applyDamage(f.player.actor.hp, Date.now())
    f.player.send({ type: 'abandon_life' })
    const newcomer = joinScenarioRoom(f.room, 'Новая Искра')
    expect(newcomer.actor.id).not.toBe(oldId)
    placeForConversation(f, vera, newcomer)
    f.talk('Здравствуй.', newcomer)
    await f.advance()
    expect(
        f.provider.turns[2]?.context.cityStory?.firstMeetingIntroduction
    ).toContain('новая Искра')
    expect(f.provider.turns[2]?.context.conversation?.person?.id).toBe(
        newcomer.actor.id
    )
    required(f.provider.turns[2]).resolve(
        npcReply(null, {
            speech: 'Здравствуй, новый путник.',
            taskAcceptance: 'none',
        })
    )
    await f.advance()
    const unselected = joinScenarioRoom(f.room, 'Третий путник')
    placeForConversation(f, vera, unselected)
    f.talk('Здравствуй.', unselected)
    await f.advance()
    expect(
        f.provider.turns[3]?.context.cityStory?.firstMeetingIntroduction
    ).toBeUndefined()
    required(f.provider.turns[3]).resolve(
        npcReply(null, { speech: 'Здравствуй.', taskAcceptance: 'none' })
    )
    await f.advance()
})

it('passes current Bell facts over an outdated heard story on every Vera model call', async () => {
    const f = setup(veraId, 'advisor', 'active')
    const vera = actor(f, veraId)
    placeForConversation(f, vera)
    memoryForCharacter(vera).remember({
        id: 'old-bell-story',
        senderId: f.player.actor.id,
        senderName: f.player.actor.nickname,
        recipientId: vera.id,
        conversationPartnerId: vera.id,
        text: 'Колокол молчит, и Мира всё ещё собирает сердца.',
        at: 900,
        channel: 'say',
        source: 'heard',
        locationId: CENTER_LOCATION_ID,
    })
    f.talk('Так колокол работает или ему ещё нужны сердца?')
    await f.advance()
    const turn = required(f.provider.turns[0])
    expect(turn.context.cityStory).toMatchObject({
        current: { bellState: 'active' },
    })
    expect(turn.context.cityStory?.guidance).toContain('Сердца больше не нужны')
    expect(turn.context.cityStory?.authoredQuests).toBeUndefined()
    expect(
        turn.context.conversation?.recent.some(
            (entry) => entry.id === 'old-bell-story'
        )
    ).toBe(true)
    expect(npcCityStoryInstructions).toContain('override remembered stories')
    expect(turn.context.selfIdentity?.responsibilities.join(' ')).toContain(
        'Безымянного Путника'
    )
    turn.resolve(
        npcReply(null, {
            informationRequest: {
                type: 'deep_memory',
                personId: f.player.actor.id,
            },
        })
    )
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
    const afterMemory = required(f.provider.turns[1])
    expect(afterMemory.context.cityStory).toEqual(turn.context.cityStory)
    expect(afterMemory.context.selfIdentity).toEqual(turn.context.selfIdentity)
    afterMemory.resolve(
        npcReply(null, {
            taskAcceptance: 'none',
            speech: 'Колокол уже звучит, сердца больше не нужны.',
        })
    )
    await f.advance()
    expect(f.speech().map((event) => event.text)).toEqual([
        'Колокол уже звучит, сердца больше не нужны.',
    ])
    expect(f.provider.turns).toHaveLength(2)
})
