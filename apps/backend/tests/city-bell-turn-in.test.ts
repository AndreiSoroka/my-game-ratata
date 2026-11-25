import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
    actor,
    authoredDecision,
    placeForConversation,
    questId,
    required,
    setup,
    stopCityBellAiFixtures,
} from './cityBellAiFixture'
import { giveHearts } from './cityBellFixture'
import { miraId, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'
import { receivedSnapshot } from './snapshotTestHelpers'

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

function clientView(f: ReturnType<typeof setup>): WorldSnapshot {
    return receivedSnapshot(f.player.sent)
}

function giftHearts(f: ReturnType<typeof setup>): void {
    const donor = joinScenarioRoom(f.room, 'Собиратель сердец')
    donor.actor.position = { ...f.player.actor.position }
    giveHearts(donor.actor)
    donor.send({ type: 'exchange_invite', targetId: f.player.actor.id })
    const exchange = required(
        f.room.social.exchanges.snapshot(f.player.actor.id)
    )
    f.player.send({
        type: 'exchange_answer',
        exchangeId: exchange.id,
        accept: true,
    })
    donor.send({
        type: 'exchange_offer',
        exchangeId: exchange.id,
        revision: required(f.room.social.exchanges.snapshot(donor.actor.id))
            .revision,
        gold: 0,
        items: donor.actor.inventory
            .filter((item) => item.itemId === 'slime_heart')
            .map((item) => ({ instanceId: item.instanceId, quantity: 1 })),
    })
    const revision = required(
        f.room.social.exchanges.snapshot(donor.actor.id)
    ).revision
    donor.send({ type: 'exchange_accept', exchangeId: exchange.id, revision })
    f.player.send({
        type: 'exchange_accept',
        exchangeId: exchange.id,
        revision,
    })
    expect(donor.actor.inventory).toHaveLength(0)
    expect(f.player.actor.inventory).toHaveLength(3)
}

it('accepts exchanged hearts without a separate Bell contract while the hunt stays at zero', async () => {
    const f = setup(miraId, 'city_coordinator')
    placeForConversation(f, actor(f, miraId))
    f.player.send({ type: 'guild_accept', questId: 'slime_hunt' })
    await f.advance()
    expect(clientView(f).party?.activeJobs).toEqual([])
    f.talk('Хочу взять «Зачистку троп».')
    await f.advance()
    const hunt = required(clientView(f).social?.questOffer)
    f.player.send({
        type: 'quest_offer_answer',
        offerId: hunt.id,
        revision: hunt.revision,
        accept: true,
    })
    await f.advance()
    expect(clientView(f).party?.activeJobs[0]).toMatchObject({
        id: 'slime_hunt',
        progress: 0,
    })
    f.talk('Я готова взять «Сердца для колокола памяти».')
    await f.advance()
    const storyOffer = required(clientView(f).social?.questOffer)
    expect(storyOffer.authoredQuestId).toBe(questId)
    f.player.send({
        type: 'quest_offer_answer',
        offerId: storyOffer.id,
        revision: storyOffer.revision,
        accept: false,
    })
    giftHearts(f)

    f.talk('Как там заказ «Сердца для колокола памяти»?')
    await f.advance()
    expect(clientView(f).social?.whisper?.messages.at(-1)?.text).toContain(
        '«Сердца для колокола памяти» (3/3)'
    )

    const rival = joinScenarioRoom(f.room, 'Другой доставщик')
    placeForConversation(f, actor(f, miraId), rival)
    giveHearts(rival.actor)
    f.talk('Я готова сдать квест')
    await f.advance()
    expect(clientView(f).social?.questTurnIn).toBeNull()
    expect(clientView(f).social?.whisper?.messages.at(-1)?.text).toContain(
        'Зачистка троп'
    )
    expect(clientView(f).social?.whisper?.messages.at(-1)?.text).toContain(
        'Сердца для колокола памяти'
    )

    f.talk('Хочу сдать «Сердца для колокола памяти».')
    f.talk('Хочу сдать три сердца.', rival)
    await f.advance()
    const first = required(clientView(f).social?.questTurnIn)
    const second = required(receivedSnapshot(rival.sent).social?.questTurnIn)
    expect(first).toMatchObject({
        source: 'story',
        preAcceptance: true,
        rewardGold: 40,
    })
    expect(clientView(f).adventure?.quest.status).toBe('available')
    const confirm = {
        type: 'quest_turn_in_confirm',
        confirmationId: first.id,
        accept: true,
        rewardMode: 'submitter',
    } as const
    rival.send(confirm)
    f.player.send(confirm)
    f.player.send(confirm)
    rival.send({ ...confirm, confirmationId: second.id })
    await f.advance()
    expect(clientView(f).party?.activeJobs[0]).toMatchObject({
        id: 'slime_hunt',
        progress: 0,
    })
    expect(clientView(f).adventure).toMatchObject({
        gold: 40,
        quest: { status: 'completed', kills: 0 },
        cityState: { bellState: 'prepared' },
    })
    expect(f.player.actor.inventory).toHaveLength(0)
    expect(receivedSnapshot(rival.sent).adventure?.gold).toBe(0)
    expect(rival.actor.inventory).toHaveLength(3)
})

it.each([false, true])(
    'projects the Bell delivery from live bag contents (already accepted: %s)',
    async (accepted) => {
        const f = setup(miraId, 'city_coordinator')
        placeForConversation(f, actor(f, miraId))
        if (accepted) {
            f.talk('Хочу взять «Сердца для колокола памяти».')
            await f.advance()
            const offer = required(clientView(f).social?.questOffer)
            f.player.send({
                type: 'quest_offer_answer',
                offerId: offer.id,
                revision: offer.revision,
                accept: true,
            })
            await f.advance()
        }

        f.talk('Хочу сдать «Сердца для колокола памяти».')
        await f.advance()
        const view = required(clientView(f).social?.questTurnIn)
        expect(view).toMatchObject({
            source: 'story',
            canConfirm: false,
            missingItems: [
                { itemId: 'slime_heart', required: 3, available: 0 },
            ],
        })
        expect(view.preAcceptance === true).toBe(!accepted)

        const player = f.player.actor
        const adventure = f.room.adventureForWorkers()
        giveHearts(player)
        const held = required(
            player.inventory.find(({ itemId }) => itemId === 'slime_heart')
        )
        const reservations = adventure.questFunding.reservations
        expect(
            reservations.reserve(
                'held-heart',
                {
                    inventory: player.inventory,
                    wallet: adventure.walletFor(player.id),
                },
                0,
                [{ instanceId: held.instanceId, quantity: 1 }]
            )
        ).toBe(true)
        await f.advance()
        expect(clientView(f).social?.questTurnIn).toMatchObject({
            id: view.id,
            canConfirm: false,
            missingItems: [
                { itemId: 'slime_heart', required: 3, available: 2 },
            ],
        })

        expect(reservations.release('held-heart')).toBe(true)
        await f.advance()
        const ready = required(clientView(f).social?.questTurnIn)
        expect(ready).toMatchObject({ id: view.id, canConfirm: true })
        expect(ready.missingItems).toBeUndefined()
        expect(clientView(f).adventure?.gold).toBe(0)
        f.player.send({
            type: 'quest_turn_in_confirm',
            confirmationId: ready.id,
            accept: true,
        })
        await f.advance()
        expect(clientView(f).adventure).toMatchObject({
            gold: 40,
            quest: { status: 'completed' },
        })
        expect(player.inventory).toHaveLength(0)
    }
)

it('binds yes to a delivered question about one contract and expires it', async () => {
    const f = setup(miraId, 'city_coordinator')
    placeForConversation(f, actor(f, miraId))
    f.talk('Хочу взять «Сердца для колокола памяти».')
    await f.advance()
    const offer = required(clientView(f).social?.questOffer)
    f.player.send({
        type: 'quest_offer_answer',
        offerId: offer.id,
        revision: offer.revision,
        accept: true,
    })
    giveHearts(f.player.actor)
    f.talk('Да')
    await f.advance()
    expect(clientView(f).social?.questTurnIn).toBeNull()
    f.talk('Как там мой заказ?')
    await f.advance()
    expect(clientView(f).social?.whisper?.messages.at(-1)?.text).toContain(
        'Ты закончил'
    )
    vi.setSystemTime(Date.now() + 30_000)
    f.talk('Да')
    await f.advance()
    expect(clientView(f).social?.questTurnIn).toBeNull()
    f.talk('Как там мой заказ?')
    f.talk('Да')
    await f.advance()
    expect(clientView(f).social?.questTurnIn).toMatchObject({
        source: 'story',
        instanceId: `story:${f.player.actor.id}:${questId}`,
    })
    expect(f.player.actor.inventory).toHaveLength(3)
})

it.each([
    {
        locale: 'ru',
        text: 'Дай что-нибудь простое',
        finished: 'Я сделал задание',
        details: [
            'О чём эти задания?',
            'о чем эти задания, расскеажи подробнее о чем задания',
        ],
        hunt: 'Зачистка троп',
        bell: 'Сердца для колокола памяти',
        frontier: 'Разведчики Пограничья',
        description: 'Победите трёх враждебных слизней',
        huntReward: '30 золота',
        bellReward: '40 золота',
        progress: 'Прогресс: 0 / 3',
    },
    {
        locale: 'en',
        text: 'Give me an easy quest.',
        finished: 'I finished the quest.',
        details: [
            'What are these quests about?',
            'Tell me more about these orders.',
        ],
        hunt: 'Clear the Trails',
        bell: 'Hearts for the Bell of Memory',
        frontier: 'Scouts of the Borderlands',
        description: 'Defeat three hostile slimes',
        huntReward: '30 gold',
        bellReward: '40 gold',
        progress: 'Progress: 0 / 3',
    },
] as const)(
    'shows available terms and actual contract progress in $locale',
    async (example) => {
        const f = setup(miraId, 'city_coordinator')
        placeForConversation(f, actor(f, miraId))
        const whisper = () => required(clientView(f).social?.whisper)
        const lastReply = () => required(whisper().messages.at(-1)).text
        f.player.send({ type: 'set_locale', locale: example.locale })
        for (const prompt of example.details) {
            f.talk(prompt)
            await f.advance()
            const replies = whisper()
                .messages.filter(({ senderId }) => senderId === miraId)
                .slice(-4)
            const hunt = required(
                replies.find(({ text }) => text.startsWith(example.hunt))
            )
            expect(hunt.text).toContain(example.description)
            expect(hunt.text.split('\n').at(-1)).toContain(example.huntReward)
        }
        f.talk(example.text)
        await f.advance()
        const first = required(clientView(f).social?.questOffer)
        expect(first.guildQuestId).toBe('slime_hunt')
        expect(clientView(f).party?.activeJobs).toEqual([])
        f.talk(example.text)
        await f.advance()
        expect(clientView(f).social?.questOffer?.id).toBe(first.id)

        f.player.send({
            type: 'quest_offer_answer',
            offerId: first.id,
            revision: first.revision,
            accept: true,
        })
        await f.advance()
        f.talk(example.finished)
        await f.advance()
        const progress = lastReply()
        expect(progress).toContain(example.hunt)
        expect(progress).toContain(example.progress)
        expect(progress).not.toContain(example.frontier)
        expect(clientView(f).social?.questTurnIn).toBeNull()

        expect(
            f.room.social
                .conversation(miraId, f.player.actor.id, Date.now())
                .availableOrders?.map(({ id }) => id)
        ).toEqual(['skeleton_hunt', 'survey_frontier', questId])
        f.talk(`Хочу взять «${example.bell}».`)
        await f.advance()
        const bell = required(clientView(f).social?.questOffer)
        expect(bell.authoredQuestId).toBe(questId)
        expect(lastReply()).toContain(example.hunt)
        expect(lastReply()).toContain(
            example.locale === 'ru' ? 'трофеи' : 'trophies'
        )
        f.player.send({
            type: 'quest_offer_answer',
            offerId: bell.id,
            revision: bell.revision,
            accept: true,
        })
        await f.advance()

        f.talk('Какие у меня активные квесты?')
        await f.advance()
        const active = lastReply()
        expect(active).toContain(example.hunt)
        expect(active).toContain(example.bell)
        expect(active).not.toContain(example.frontier)
        f.talk(example.text)
        await f.advance()
        expect(clientView(f).social?.questOffer?.guildQuestId).toBe(
            'skeleton_hunt'
        )
        expect(clientView(f).party?.activeJobs[0]?.id).toBe('slime_hunt')
    }
)

it('opens the right hand-in when the player answers a delivered model question', async () => {
    const f = setup(miraId, 'city_coordinator')
    placeForConversation(f, actor(f, miraId))
    for (const title of ['Зачистка троп', 'Сердца для колокола памяти']) {
        f.talk(`Хочу взять «${title}».`)
        await f.advance()
        const offer = required(clientView(f).social?.questOffer)
        f.player.send({
            type: 'quest_offer_answer',
            offerId: offer.id,
            revision: offer.revision,
            accept: true,
        })
        await f.advance()
    }
    expect(clientView(f).party?.activeJobs[0]?.id).toBe('slime_hunt')
    expect(clientView(f).adventure?.quest.status).toBe('active')
    giveHearts(f.player.actor)
    const question = 'Ты закончил «Сердца для колокола памяти»?'
    f.talk('Я вернулась к гильдии.')
    await f.advance()
    required(f.provider.turns[0]).resolve(npcReply(null, { speech: question }))
    await f.advance()
    expect(f.speech().at(-1)?.text).toBe(question)
    f.player.send({ type: 'chat', text: 'Да, закончила.' })
    await f.advance()
    expect(clientView(f).social?.questTurnIn).toMatchObject({ source: 'story' })
    expect(f.player.actor.inventory).toHaveLength(3)
})

it.each(['chat', 'whisper'] as const)(
    'accepts an AI-authored order and hands in through the player-visible %s confirmation, once',
    async (channel) => {
        const f = setup(miraId, 'city_coordinator')
        placeForConversation(f, actor(f, miraId))
        f.talk('Покажи условия задания колокола.')
        await f.advance()
        required(f.provider.turns[0]).resolve(
            npcReply(authoredDecision(f.player.actor.id), {
                speech: 'Нужны три сердца. Вот условия городского заказа.',
            })
        )
        await f.advance()
        const offer = required(clientView(f).social?.questOffer)
        f.player.send({
            type: 'quest_offer_answer',
            offerId: offer.id,
            revision: offer.revision,
            accept: true,
            rewardMode: 'submitter',
        })
        await f.advance()
        expect(clientView(f).adventure?.quest.status).toBe('active')
        // Inventory is test setup; acceptance, speech and confirmation use the real socket.
        giveHearts(f.player.actor)
        f.player.send({
            type: channel,
            targetId: miraId,
            text: 'Квест готов, хочу сдать три сердца.',
        })
        await f.advance()
        const ready = clientView(f)
        const prompt = required(ready.social?.questTurnIn)
        expect(prompt).toMatchObject({
            source: 'story',
            instanceId: `story:${f.player.actor.id}:${questId}`,
            rewardGold: 40,
            action: 'turn_in',
        })
        expect(ready.social?.whisper?.partnerId).toBe(miraId)
        const otherIssuer = actor(f, 'npc_cleric_1')
        const competingOffer = {
            ...offer,
            issuerId: otherIssuer.id,
            issuerName: otherIssuer.nickname,
        }
        const currentQuests = f.room.social.quests.snapshot(
            f.player.actor.id,
            Date.now()
        )
        const questSnapshot = vi
            .spyOn(f.room.social.quests, 'snapshot')
            .mockReturnValueOnce({
                ...currentQuests,
                questOffer: competingOffer,
            })
        const competing = f.room.social.snapshot(f.player.actor, Date.now())
        questSnapshot.mockRestore()
        expect(competing.questOffer?.issuerId).toBe(otherIssuer.id)
        expect(competing.questTurnIn?.issuerId).toBe(miraId)
        expect(competing.whisper?.partnerId).toBe(miraId)
        expect(ready.adventure?.gold).toBe(0)
        expect(f.player.actor.inventory).toHaveLength(3)
        const confirm = {
            type: 'quest_turn_in_confirm' as const,
            confirmationId: prompt.id,
            accept: true,
        }
        f.player.send(confirm)
        await f.advance()
        const completed = clientView(f)
        expect(completed.adventure).toMatchObject({
            gold: 40,
            quest: { status: 'completed' },
            cityState: { bellState: 'prepared' },
        })
        expect(completed.social?.questTurnIn).toBeNull()
        expect(f.player.actor.inventory).toHaveLength(0)
        f.player.send(confirm)
        await f.advance()
        expect(clientView(f).adventure?.gold).toBe(40)
        expect(f.player.actor.inventory).toHaveLength(0)
    }
)
