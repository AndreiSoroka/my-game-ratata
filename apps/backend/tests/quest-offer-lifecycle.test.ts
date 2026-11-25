import type { QuestOfferSnapshot } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { createItemInstance } from '../src/game/inventory'
import { parseNpcQuestDecision } from '../src/game/npcQuestCommands'
import { inquiryPathTiles } from '../src/game/questExcursions'
import { npcQuestFixture } from './npcQuestFixture'

it('pins one offer until explicitly declined, records history and refuses another issuer', () => {
    const f = npcQuestFixture()
    const first = f.draft()
    expect(f.service.propose(f.issuer, f.player.id, first, 10).accepted).toBe(
        true
    )
    const offer = requireOffer(f.service.snapshot(f.player.id, 10).questOffer)
    expect(f.service.propose(f.issuer, f.player.id, first, 20).accepted).toBe(
        true
    )
    expect(
        f.service.propose(
            f.issuer,
            f.player.id,
            f.draft({ title: 'Другое' }),
            30
        ).accepted
    ).toBe(false)
    f.merchant.position = { x: 80, y: 80 }
    expect(
        f.service.propose(
            f.merchant,
            f.player.id,
            f.draft({ funding: 'personal', rewardGold: 0 }),
            30
        ).accepted
    ).toBe(false)
    expect(f.service.snapshot(f.player.id, 30).questOffer).toEqual(offer)
    expect(
        f.service.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                offerId: offer.id,
                revision: 1,
                accept: false,
            },
            40
        ).accepted
    ).toBe(true)
    expect(f.service.snapshot(f.player.id, 40).questOffer).toBeNull()
    expect(
        f.service.journal
            .conversation(f.issuer.id, f.player.id)
            .map((entry) => entry.status)
    ).toEqual(['offered', 'declined'])
})

it('revises the same offer with real rewards, rejects stale acceptance, and retains expiry', () => {
    const f = npcQuestFixture()
    const food = createItemInstance('food')
    f.issuer.inventory.push(food)
    expect(
        f.service.propose(f.issuer, f.player.id, f.draft(), 10).accepted
    ).toBe(true)
    const offer = requireOffer(f.service.snapshot(f.player.id, 10).questOffer)
    const revision = {
        type: 'quest_offer_revise' as const,
        targetId: f.player.id,
        offerId: offer.id,
        revision: 1,
        rewardGold: 17,
        rewardItems: [{ instanceId: food.instanceId, quantity: 1 }],
    }
    expect(f.service.handleDecision(f.issuer, revision, 20).accepted).toBe(true)
    const revised = requireOffer(f.service.snapshot(f.player.id, 20).questOffer)
    expect(revised).toMatchObject({
        id: offer.id,
        revision: 2,
        expiresAt: offer.expiresAt,
        rewardGold: 17,
    })
    expect(revised.rewardItems[0]?.itemId).toBe('food')
    expect(
        f.service.handleDecision(f.issuer, { ...revision, revision: 2 }, 30)
            .accepted
    ).toBe(true)
    expect(f.service.snapshot(f.player.id, 30).questOffer?.revision).toBe(2)
    expect(
        f.service.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                offerId: offer.id,
                revision: 1,
                accept: true,
            },
            40
        ).accepted
    ).toBe(false)
    expect(
        f.service.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                offerId: offer.id,
                revision: 2,
                accept: true,
            },
            40
        ).accepted
    ).toBe(true)
    expect(f.service.cityFund(f.issuer.locationId)).toBe(283)
})

it('keeps prior terms when bargaining invents a possession or exceeds funds', () => {
    const f = npcQuestFixture()
    f.service.propose(f.issuer, f.player.id, f.draft(), 10)
    const offer = requireOffer(f.service.snapshot(f.player.id, 10).questOffer)
    const decision = {
        type: 'quest_offer_revise' as const,
        targetId: f.player.id,
        offerId: offer.id,
        revision: 1,
        rewardGold: 10,
        rewardItems: [{ instanceId: 'made-up', quantity: 1 }],
    }
    expect(f.service.handleDecision(f.issuer, decision, 20).accepted).toBe(
        false
    )
    expect(
        f.service.handleDecision(
            f.merchant,
            { ...decision, rewardItems: [] },
            20
        ).accepted
    ).toBe(false)
    expect(f.service.snapshot(f.player.id, 20).questOffer).toEqual(offer)
    expect(
        parseNpcQuestDecision({
            ...decision,
            rewardItems: [
                { instanceId: 'x', quantity: 1 },
                { instanceId: 'x', quantity: 1 },
            ],
        })
    ).toBeUndefined()
})

it('requires sixteen tiles of shortest real approach path and rechecks at acceptance', () => {
    const f = npcQuestFixture()
    f.merchant.position = { x: 80, y: 80 }
    expect(
        f.service.propose(f.issuer, f.player.id, f.draft(), 10).accepted
    ).toBe(false)
    f.merchant.position = { x: 400, y: 80 }
    expect(
        inquiryPathTiles(f.player, f.merchant, f.navigation)
    ).toBeGreaterThanOrEqual(16)
    expect(
        f.service.propose(f.issuer, f.player.id, f.draft(), 20).accepted
    ).toBe(true)
    const offer = requireOffer(f.service.snapshot(f.player.id, 20).questOffer)
    f.merchant.position = { x: 96, y: 80 }
    const answer = f.service.handle(
        f.player,
        {
            type: 'quest_offer_answer',
            offerId: offer.id,
            revision: 1,
            accept: true,
        },
        30
    )
    expect(answer.accepted).toBe(false)
    expect(answer.error).toContain('16')
    expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
})

it('credits only the explicit nearby inquiry and can accept a new contract after settlement', () => {
    const f = npcQuestFixture()
    const id = f.accept()
    expect(f.service.inquire(f.player, id, 0, 21).accepted).toBe(false)
    f.player.position = { ...f.merchant.position }
    f.adventure.interact(
        f.player,
        f.merchant.id,
        [...f.characters.values()],
        f.navigation,
        22
    )
    f.service.update(22)
    expect(f.service.snapshot(f.player.id, 22).quests?.[0]?.progress).toEqual([
        0,
    ])
    const inquiry = f.service.inquire(f.player, id, 0, 23)
    expect(inquiry.accepted).toBe(true)
    expect(
        inquiry.events.filter((event) => event.kind === 'chat')
    ).toHaveLength(1)
    expect(f.service.snapshot(f.player.id, 23).quests?.[0]?.status).toBe(
        'ready'
    )
    f.player.position = { ...f.issuer.position }
    expect(f.turnIn(id).accepted).toBe(true)
    expect(f.service.snapshot(f.player.id, 30).quests).toEqual([])
    expect(
        f.service.propose(f.issuer, f.player.id, f.draft(), 31).accepted
    ).toBe(true)
    const next = requireOffer(f.service.snapshot(f.player.id, 31).questOffer)
    expect(
        f.service.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                offerId: next.id,
                revision: next.revision,
                accept: true,
            },
            32
        ).accepted
    ).toBe(true)
    const activeId = f.service.snapshot(f.player.id, 32).quests?.[0]?.instanceId
    expect(f.turnIn(id).accepted).toBe(true)
    expect(f.service.snapshot(f.player.id, 32).quests?.[0]?.instanceId).toBe(
        activeId
    )
    expect(f.adventure.walletFor(f.player.id).gold).toBe(10)
})

function requireOffer(
    offer: QuestOfferSnapshot | null | undefined
): QuestOfferSnapshot {
    if (offer === null || offer === undefined) {
        throw new Error('Expected current offer')
    }
    return offer
}

it('measures the exact sixteen-tile boundary at valid speaking approach points', () => {
    const f = npcQuestFixture()
    f.player.position = { x: 88, y: 88 }
    f.issuer.position = { ...f.player.position }
    f.merchant.position = { x: 392, y: 88 }
    expect(inquiryPathTiles(f.player, f.merchant, f.navigation)).toBe(16)
    expect(
        f.service.propose(f.issuer, f.player.id, f.draft(), 10).accepted
    ).toBe(true)
    const offer = requireOffer(f.service.snapshot(f.player.id, 10).questOffer)
    f.service.handle(
        f.player,
        {
            type: 'quest_offer_answer',
            offerId: offer.id,
            revision: 1,
            accept: false,
        },
        11
    )
    f.merchant.position = { x: 376, y: 88 }
    expect(inquiryPathTiles(f.player, f.merchant, f.navigation)).toBe(15)
    expect(
        f.service.propose(f.issuer, f.player.id, f.draft(), 12).accepted
    ).toBe(false)
})
