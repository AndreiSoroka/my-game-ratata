import { expect, it } from 'vitest'

import type { ExchangeService } from '../src/game/exchange'
import { createItemInstance } from '../src/game/inventory'
import type { NpcQuestService } from '../src/game/npcQuests'
import type { PartyService } from '../src/game/parties'
import { workerConversation } from './workerDialogueFixture'
import { WorkerSimulation } from './workerRequestFixture'

it('resolves a farmer clarification among active orders for the same issuer', () => {
    const f = new WorkerSimulation('farmer')
    f.adventure.initializeCities({
        seed: 'worker-dialogue',
        initialBellState: 'silent',
    })
    f.publish()
    const { parties, quests, turns, whispers } = workerConversation(f)
    const active = acceptWorkerOffer(f, parties, quests)
    expect(
        turns.heard(
            f.player,
            f.clerk,
            'Хочу взять «Сердца для колокола памяти»',
            f.now
        )
    ).toBe(true)
    const story = required(quests.snapshot(f.player.id, f.now).questOffer)
    expect(
        quests.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                offerId: story.id,
                revision: story.revision,
                accept: true,
            },
            f.now
        ).accepted
    ).toBe(true)

    expect(turns.heard(f.player, f.clerk, 'Я сделал задание', f.now)).toBe(true)
    const question = whispers.snapshot(f.player, f.now)?.messages.at(-1)?.text
    expect(question).toContain('Какой заказ?')
    expect(question).toContain('Сердца для колокола памяти')
    expect(question).not.toContain('Разведчики Пограничья')
    const merchant = required(f.characters.get('npc_merchant_1'))
    expect(turns.heard(f.player, merchant, 'Для фермера которое', f.now)).toBe(
        false
    )
    f.player.inventory.push(createItemInstance('bone'))
    expect(turns.heard(f.player, f.clerk, 'Для фермера которое', f.now)).toBe(
        true
    )
    expect(turns.snapshot(f.player, f.now)).toMatchObject({
        instanceId: active?.instanceId,
        action: 'report',
    })
})

it.each([
    {
        locale: 'ru',
        finished: 'я сделал задание',
        clarify: 'для фермера которое',
        negative: 'нет, я не очистил',
        handIn: 'да, я очистил',
        how: 'я готов передать, как это сделать?',
        repeated: 'оформи сдачу трофея',
        needsBone: 'Для доклада нужен свободный трофей «Кость»',
        verifying: 'Трофей уже принят',
    },
    {
        locale: 'en',
        finished: 'I finished the quest.',
        clarify: 'The one for the farmer.',
        negative: "No, I didn't clear it.",
        handIn: 'Yes, I cleared it.',
        how: "I'm ready to hand it over, how do I do it?",
        repeated: 'How do I hand in the trophy?',
        needsBone: 'To report, bring an unreserved bone',
        verifying: 'I already received the trophy',
    },
] as const)(
    'uses the active farmer contract across a $locale conversation, cancelling the pending exchange before proof',
    (example) => {
        const f = new WorkerSimulation('farmer')
        f.prepareFarm('bare')
        f.worker.inventory.push(createItemInstance('wheat_seed'))
        f.publish()
        const { exchanges, parties, quests, turns, whispers } =
            workerConversation(f, example.locale)
        const active = acceptWorkerOffer(f, parties, quests)
        const talk = (text: string) =>
            turns.heard(f.player, f.clerk, text, f.now)
        expect(talk(example.finished)).toBe(true)
        expect(
            whispers.snapshot(f.player, f.now)?.messages.at(-1)?.text
        ).toContain(example.needsBone)
        expect(talk(example.clarify)).toBe(true)
        expect(turns.snapshot(f.player, f.now)).toBeNull()
        expect(talk(example.negative)).toBe(false)

        const bone = createItemInstance('bone')
        f.player.inventory.push(bone)
        const exchange = offerBone(f, exchanges, bone.instanceId)
        expect(exchanges.snapshot(f.player.id)?.own.accepted).toBe(true)
        expect(exchanges.snapshot(f.player.id)?.other.accepted).toBe(false)
        expect(f.player.inventory).toContain(bone)
        expect(talk(example.handIn)).toBe(true)
        const prompt = turns.snapshot(f.player, f.now)
        expect(prompt).toMatchObject({
            instanceId: active?.instanceId,
            action: 'report',
            objectives: [{ kind: 'deliver', itemId: 'bone', quantity: 1 }],
        })
        expect(exchanges.snapshot(f.player.id)).toMatchObject({
            id: exchange.id,
            status: 'cancelled',
        })
        expect(f.player.inventory).toContain(bone)
        expect(f.current()).toMatchObject({
            stage: 'waiting',
            proofAccepted: false,
        })
        expect(talk(example.how)).toBe(true)
        expect(turns.snapshot(f.player, f.now)?.id).toBe(prompt?.id)

        f.enemy.alive = false
        expect(
            turns.confirm(f.player, required(prompt).id, true, f.now).accepted
        ).toBe(true)
        expect(
            turns.confirm(f.player, required(prompt).id, true, f.now).accepted
        ).toBe(true)
        expect(f.player.inventory).toHaveLength(0)
        expect(f.current()).toMatchObject({
            stage: 'outbound',
            proofAccepted: true,
        })
        expect(talk(example.repeated)).toBe(true)
        expect(turns.snapshot(f.player, f.now)).toBeNull()
        expect(
            whispers.snapshot(f.player, f.now)?.messages.at(-1)?.text
        ).toContain(example.verifying)

        f.until(() => f.current().stage === 'ready')
        parties.update(f.characters.values(), f.now)
        expect(talk(example.finished)).toBe(true)
        const payout = turns.snapshot(f.player, f.now)
        expect(payout).toMatchObject({
            instanceId: active?.instanceId,
            action: 'turn_in',
            objectives: [],
        })
        expect(f.adventure.walletFor(f.player.id).gold).toBe(0)
        expect(
            turns.confirm(f.player, required(payout).id, true, f.now).accepted
        ).toBe(true)
        expect(
            turns.confirm(f.player, required(payout).id, true, f.now).accepted
        ).toBe(true)
        expect(f.current().stage).toBe('completed')
        expect(f.adventure.walletFor(f.player.id).gold).toBe(30)
    }
)

it('recognizes a completed same-pair trophy transfer and keeps the report waiting', () => {
    const f = new WorkerSimulation('farmer')
    f.publish()
    const { exchanges, parties, quests, turns, whispers } =
        workerConversation(f)
    acceptWorkerOffer(f, parties, quests)
    const bone = createItemInstance('bone')
    f.player.inventory.push(bone)
    const offered = offerBone(f, exchanges, bone.instanceId)
    const accept = {
        type: 'exchange_accept',
        exchangeId: offered.id,
        revision: offered.revision,
    } as const
    expect(exchanges.handle(f.clerk, accept, f.now).accepted).toBe(true)
    expect(exchanges.snapshot(f.player.id)).toMatchObject({
        status: 'completed',
    })
    expect(
        f.clerk.inventory.some((item) => item.instanceId === bone.instanceId)
    ).toBe(true)
    expect(f.player.inventory).toHaveLength(0)
    expect(
        exchanges.handle(
            f.player,
            { type: 'exchange_invite', targetId: 'npc_merchant_1' },
            f.now
        ).accepted
    ).toBe(true)
    expect(exchanges.snapshot(f.player.id)?.status).toBe('invited')

    for (const phrase of [
        'хочу передать кость',
        'я хочу тебе передать кость для квеста фемер агафья',
        'я пеердал кость',
        'оформи сдачу трофея',
    ]) {
        expect(turns.heard(f.player, f.clerk, phrase, f.now)).toBe(true)
        expect(turns.snapshot(f.player, f.now)).toBeNull()
        expect(
            whispers.snapshot(f.player, f.now)?.messages.at(-1)?.text
        ).toContain('В завершённом обмене ты передал мне трофей «Кость»')
    }
    expect(f.current()).toMatchObject({
        stage: 'waiting',
        proofAccepted: false,
    })
    expect(f.adventure.walletFor(f.player.id).gold).toBe(0)
    expect(
        exchanges.recentlyTransferred(
            f.player.id,
            f.clerk.id,
            'bone',
            f.now + 599_999
        )
    ).toBe(true)
    expect(
        exchanges.recentlyTransferred(
            f.player.id,
            f.clerk.id,
            'bone',
            f.now + 600_000
        )
    ).toBe(false)
    expect(
        exchanges.recentlyTransferred(f.player.id, f.worker.id, 'bone', f.now)
    ).toBe(false)
    expect(
        exchanges.recentlyTransferred(f.worker.id, f.clerk.id, 'bone', f.now)
    ).toBe(false)
    expect(
        exchanges.recentlyTransferred(
            f.player.id,
            f.clerk.id,
            'slime_heart',
            f.now
        )
    ).toBe(false)
})

function acceptWorkerOffer(
    f: WorkerSimulation,
    parties: PartyService,
    quests: NpcQuestService
) {
    expect(
        quests.workerPropose(f.clerk, f.player.id, f.current().id, f.now)
            .accepted
    ).toBe(true)
    const offer = quests.snapshot(f.player.id, f.now).questOffer
    expect(offer).toBeDefined()
    expect(
        quests.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                offerId: required(offer).id,
                revision: required(offer).revision,
                accept: true,
            },
            f.now
        ).accepted
    ).toBe(true)
    return parties.boardActiveJob(f.player.id)
}

function offerBone(
    f: WorkerSimulation,
    exchanges: ExchangeService,
    instanceId: string
) {
    expect(
        exchanges.handle(
            f.player,
            { type: 'exchange_invite', targetId: f.clerk.id },
            f.now
        ).accepted
    ).toBe(true)
    const exchange = required(exchanges.snapshot(f.player.id))
    expect(
        exchanges.handle(
            f.clerk,
            { type: 'exchange_answer', exchangeId: exchange.id, accept: true },
            f.now
        ).accepted
    ).toBe(true)
    expect(
        exchanges.handle(
            f.player,
            {
                type: 'exchange_offer',
                exchangeId: exchange.id,
                revision: exchange.revision,
                gold: 0,
                items: [{ instanceId, quantity: 1 }],
            },
            f.now
        ).accepted
    ).toBe(true)
    const offered = required(exchanges.snapshot(f.player.id))
    expect(
        exchanges.handle(
            f.player,
            {
                type: 'exchange_accept',
                exchangeId: offered.id,
                revision: offered.revision,
            },
            f.now
        ).accepted
    ).toBe(true)
    return offered
}

function required<T>(value: T | undefined | null): T {
    if (value == null) {
        throw new Error(
            'Expected a server-issued offer, exchange or confirmation'
        )
    }
    return value
}
