import {
    CENTER_LOCATION_ID,
    INVENTORY_CAPACITY,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { parseNpcAiReply } from '../src/ai/npcCliProtocol'
import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import type { NpcQuestService } from '../src/game/npcQuests'
import { npcQuestFixture } from './npcQuestFixture'

const review = { cityReviewIntervalMs: 60_000 }

function onlyPosting(service: NpcQuestService, now: number) {
    const [posting] = service.publications.list(now)
    expect(service.publications.list(now)).toHaveLength(1)
    if (posting === undefined) {
        throw new Error('Missing board posting')
    }
    return posting
}

it('publishes only in the clerk’s authorized city review and reserves a quarter-budget', () => {
    const f = npcQuestFixture()
    const decision = {
        type: 'quest_board_publish' as const,
        draft: f.draft({ rewardGold: 30 }),
    }
    expect(
        parseNpcAiReply({ decision, done: true, waitMs: 0, memory: '' })
            .decision
    ).toEqual(decision)
    expect(f.service.decide(f.issuer, decision, 10).accepted).toBe(false)
    expect(f.service.decide(f.merchant, decision, 10, review).accepted).toBe(
        false
    )
    const before = f.service.cityFund(CENTER_LOCATION_ID)
    expect(f.service.decide(f.issuer, decision, 10, review).accepted).toBe(true)
    expect(onlyPosting(f.service, 10)).toMatchObject({
        issuerId: f.issuer.id,
        expiresAt: 1_800_010,
        draft: { rewardGold: 30 },
    })
    expect(f.service.cityFund(CENTER_LOCATION_ID)).toBe(before - 30)
    const distinct = f.draft({
        title: 'Пополнить городской склад',
        objectives: [
            {
                kind: 'deliver',
                itemId: 'fiber',
                quantity: 2,
                recipientId: f.issuer.id,
            },
        ],
        rewardGold: 46,
    })
    expect(
        f.service.decide(
            f.issuer,
            { ...decision, draft: distinct },
            61_000,
            review
        ).accepted
    ).toBe(false)
    expect(
        f.service.decide(
            f.issuer,
            {
                ...decision,
                draft: { ...decision.draft, title: 'Другие сведения' },
            },
            61_000,
            review
        ).accepted
    ).toBe(false)
    expect(f.service.cityFund(CENTER_LOCATION_ID)).toBe(before - 30)
    f.service.update(1_800_010)
    expect(f.service.publications.list(1_800_010)).toEqual([])
    expect(f.service.cityFund(CENTER_LOCATION_ID)).toBe(before)
})

it('replenishes the treasury and publication budget once when trade tax settles', () => {
    const f = npcQuestFixture()
    const decision = {
        type: 'quest_board_publish' as const,
        draft: f.draft({ rewardGold: 76 }),
    }
    const before = f.service.cityFund(CENTER_LOCATION_ID)
    const settleTax = f.adventure.questFunding.tradeTaxCredit(
        CENTER_LOCATION_ID,
        1
    )
    expect(settleTax).toBeDefined()
    expect(f.service.cityFund(CENTER_LOCATION_ID)).toBe(before)
    expect(f.service.decide(f.issuer, decision, 10, review).accepted).toBe(
        false
    )

    settleTax?.()
    settleTax?.()
    expect(f.service.cityFund(CENTER_LOCATION_ID)).toBe(before + 1)
    expect(f.service.decide(f.issuer, decision, 10, review).accepted).toBe(true)
    expect(f.service.cityFund(CENTER_LOCATION_ID)).toBe(before + 1 - 76)
})

it('allows only one claimant even if two players have open offers', () => {
    const f = npcQuestFixture()
    const decision = { type: 'quest_board_publish' as const, draft: f.draft() }
    const before = f.service.cityFund(CENTER_LOCATION_ID)
    expect(f.service.decide(f.issuer, decision, 10, review).accepted).toBe(true)
    const { id, expiresAt } = onlyPosting(f.service, 10)
    const offers = [f.player, f.friend].map((player) => {
        expect(
            f.service.boardOffers.offerPublished(f.issuer, player.id, id, 20)
                .accepted
        ).toBe(true)
        const offer = f.service.snapshot(player.id, 20).questOffer
        if (offer === null || offer === undefined) {
            throw new Error('Missing private offer')
        }
        return { player, offer }
    })
    expect(f.service.cityFund(CENTER_LOCATION_ID)).toBe(before - 10)
    for (const [index, { player, offer }] of offers.entries()) {
        expect(
            f.service.handle(
                player,
                {
                    type: 'quest_offer_answer',
                    offerId: offer.id,
                    revision: offer.revision,
                    accept: true,
                },
                30
            ).accepted
        ).toBe(index === 0)
    }
    expect(f.service.publications.list(30)).toEqual([])
    expect(f.service.snapshot(f.friend.id, 30).questOffer).toBeNull()
    f.service.update(expiresAt)
    expect(f.service.snapshot(f.player.id, expiresAt).quest?.instanceId).toBe(
        id
    )
    expect(f.service.cityFund(CENTER_LOCATION_ID)).toBe(before - 10)
    expect(
        f.service.handle(
            f.player,
            { type: 'npc_quest_abandon', instanceId: id },
            expiresAt + 1
        ).accepted
    ).toBe(true)
    expect(f.service.cityFund(CENTER_LOCATION_ID)).toBe(before)
})

it('redeems an unaccepted delivery atomically and retains its offer on inventory failure', () => {
    const f = npcQuestFixture()
    const draft = f.draft({
        rewardGold: 70,
        objectives: [
            {
                kind: 'deliver',
                itemId: 'bone',
                quantity: 1,
                recipientId: f.issuer.id,
            },
            {
                kind: 'deliver',
                itemId: 'bone',
                quantity: 1,
                recipientId: f.issuer.id,
            },
        ],
    })
    const decision = { type: 'quest_board_publish' as const, draft }
    const before = f.service.cityFund(CENTER_LOCATION_ID)
    expect(f.service.decide(f.issuer, decision, 10, review).accepted).toBe(true)
    const { id, revision } = onlyPosting(f.service, 10)
    const redeem = () =>
        f.service.boardOffers.redeemPublished(
            f.player,
            f.issuer,
            id,
            revision,
            'submitter',
            30
        )
    f.player.inventory.push(createItemInstance('bone'))
    expect(redeem().accepted).toBe(false)
    expect(countInventoryItem(f.player.inventory, 'bone')).toBe(1)
    expect(f.parties.contractGroup(f.player.id).occupied).toBe(false)
    f.player.inventory.push(createItemInstance('bone'))
    f.issuer.inventory.push(
        ...Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('boots')
        )
    )
    expect(redeem().accepted).toBe(false)
    expect(countInventoryItem(f.player.inventory, 'bone')).toBe(2)
    expect(f.adventure.walletFor(f.player.id).gold).toBe(0)
    expect(onlyPosting(f.service, 30).id).toBe(id)
    expect(f.parties.contractGroup(f.player.id).occupied).toBe(false)
    f.issuer.inventory.splice(0, 2)
    expect(redeem().accepted).toBe(true)
    expect(countInventoryItem(f.player.inventory, 'bone')).toBe(0)
    expect(countInventoryItem(f.issuer.inventory, 'bone')).toBe(2)
    expect(f.adventure.walletFor(f.player.id).gold).toBe(70)
    expect(f.service.cityFund(CENTER_LOCATION_ID)).toBe(before - 70)
    expect(redeem().accepted).toBe(false)
    expect(f.adventure.walletFor(f.player.id).gold).toBe(70)
    expect(f.parties.contractGroup(f.player.id).occupied).toBe(false)
    expect(f.service.conversation(f.issuer.id, f.player.id)).toMatchObject([
        {
            instanceId: id,
            receiptId: id,
            status: 'completed',
            progress: [1, 1],
        },
    ])
    expect(
        f.service.decide(
            f.issuer,
            { ...decision, draft: { ...draft, rewardGold: 6 } },
            61_000,
            review
        ).accepted
    ).toBe(false)
})

it('revokes open publications and releases their reserve after Mira changes life', () => {
    const f = npcQuestFixture()
    const before = f.service.cityFund(CENTER_LOCATION_ID)
    expect(
        f.service.decide(
            f.issuer,
            { type: 'quest_board_publish', draft: f.draft() },
            10,
            review
        ).accepted
    ).toBe(true)
    const { id } = onlyPosting(f.service, 10)
    expect(
        f.service.boardOffers.offerPublished(f.issuer, f.player.id, id, 20)
            .accepted
    ).toBe(true)
    f.issuer.deathSequence++
    f.service.update(30)
    expect(f.service.cityFund(CENTER_LOCATION_ID)).toBe(before)
    expect(f.service.publications.get(id, 30)).toBeUndefined()
    expect(f.service.snapshot(f.player.id, 30).questOffer).toBeNull()
})
