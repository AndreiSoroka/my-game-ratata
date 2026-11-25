import type {
    NpcQuestDecision,
    QuestOfferSnapshot,
    WorkRequestSnapshot,
} from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { createItemInstance } from '../src/game/inventory'
import { parseNpcQuestDecision } from '../src/game/npcQuestCommands'
import { npcQuestFixture } from './npcQuestFixture'

function offer(
    f: ReturnType<typeof npcQuestFixture>,
    now = 20
): QuestOfferSnapshot {
    const current = f.service.snapshot(f.player.id, now).questOffer
    if (current === null || current === undefined) {
        throw new Error('Expected a published quest offer')
    }
    return current
}

function replacement(current: QuestOfferSnapshot) {
    return { offerId: current.id, revision: current.revision }
}

function pendingOffer() {
    const f = npcQuestFixture()
    expect(
        f.service.propose(f.issuer, f.player.id, f.draft(), 10).accepted
    ).toBe(true)
    const previous = offer(f)
    const decision: NpcQuestDecision = {
        type: 'quest_propose',
        targetId: f.player.id,
        draft: f.draft({ title: 'Другое поручение', rewardGold: 17 }),
        replaceOffer: replacement(previous),
    }
    const context = { freshDialogueTargetId: f.player.id }
    return { ...f, previous, decision, context }
}

it('atomically replaces an own pending offer and requires acceptance of its new identity', () => {
    const f = pendingOffer()
    const food = createItemInstance('food')
    f.issuer.inventory.push(food)
    f.decision.draft.rewardItems = [
        { instanceId: food.instanceId, quantity: 1 },
    ]
    expect(
        f.service.handleDecision(f.issuer, f.decision, 30, f.context).accepted
    ).toBe(true)
    const current = offer(f, 30)
    expect(current.id).not.toBe(f.previous.id)
    expect(current).toMatchObject({
        title: 'Другое поручение',
        rewardGold: 17,
        revision: 1,
    })
    expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
    expect(f.issuer.inventory).toContainEqual(food)
    expect(
        f.parties.contractSlots.idsFor(f.parties.contractGroup(f.player.id).key)
            .size > 0
    ).toBe(false)
    expect(
        f.service.journal
            .conversation(f.issuer.id, f.player.id)
            .map((entry) => entry.status)
    ).toEqual(['offered', 'cancelled', 'offered'])
    const answer = (value: QuestOfferSnapshot) =>
        f.service.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                ...replacement(value),
                accept: true,
            },
            40
        )
    const stale = answer(f.previous)
    expect(stale.accepted).toBe(false)
    expect(stale.error).toContain('заменено')
    expect(offer(f, 40)).toEqual(current)
    expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
    expect(answer(current).accepted).toBe(true)
    expect(f.service.cityFund(f.issuer.locationId)).toBe(283)
    expect(f.service.snapshot(f.player.id, 40).quests?.[0]).toMatchObject({
        title: current.title,
    })
})

it.each([
    'autonomous',
    'other speaker',
    'other issuer',
    'stale id',
    'stale revision',
] as const)(
    'preserves the previous offer when replacement comes from %s',
    (attempt) => {
        const f = pendingOffer()
        const context =
            attempt === 'autonomous'
                ? {}
                : attempt === 'other speaker'
                  ? { freshDialogueTargetId: f.friend.id }
                  : f.context
        const issuer = attempt === 'other issuer' ? f.merchant : f.issuer
        f.merchant.position = { ...f.player.position }
        const decision = {
            ...structuredClone(f.decision),
            replaceOffer: replacement(f.previous),
        }
        if (attempt === 'stale id') {
            decision.replaceOffer.offerId = 'an-old-offer'
        }
        if (attempt === 'stale revision') {
            decision.replaceOffer.revision++
        }
        expect(
            f.service.handleDecision(issuer, decision, 30, context).accepted
        ).toBe(false)
        expect(offer(f, 30)).toEqual(f.previous)
        expect(
            f.service.journal.conversation(f.issuer.id, f.player.id)
        ).toHaveLength(1)
        expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
    }
)

it.each(['invalid objective', 'missing item', 'insufficient reward'] as const)(
    'validates %s before changing the previous offer',
    (failure) => {
        const f = pendingOffer()
        if (failure === 'invalid objective') {
            f.decision.draft.objectives = [
                { kind: 'inspect', targetId: 'missing-character' },
            ]
        } else if (failure === 'missing item') {
            f.decision.draft.rewardItems = [
                { instanceId: 'missing-item', quantity: 1 },
            ]
        } else {
            f.decision.draft.funding = 'personal'
            f.decision.draft.rewardGold = 1
        }
        expect(
            f.service.handleDecision(f.issuer, f.decision, 30, f.context)
                .accepted
        ).toBe(false)
        expect(offer(f, 30)).toEqual(f.previous)
        expect(
            f.service.journal.conversation(f.issuer.id, f.player.id)
        ).toHaveLength(1)
    }
)

it.each(['expired', 'lost contact', 'new issuer life'] as const)(
    'refuses replacement when the old offer is %s',
    (failure) => {
        const f = pendingOffer()
        if (failure === 'lost contact') {
            f.player.position = { x: 450, y: 450 }
        }
        if (failure === 'new issuer life') {
            f.issuer.deathSequence++
        }
        const now = failure === 'expired' ? f.previous.expiresAt : 30
        expect(
            f.service.handleDecision(f.issuer, f.decision, now, f.context)
                .accepted
        ).toBe(false)
        expect(
            f.service.journal.conversation(f.issuer.id, f.player.id)
        ).toHaveLength(1)
        expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
    }
)

it('does not replace or release an accepted active contract', () => {
    const f = pendingOffer()
    expect(
        f.service.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                ...replacement(f.previous),
                accept: true,
            },
            25
        ).accepted
    ).toBe(true)
    const active = f.service.snapshot(f.player.id, 25).quests?.[0]
    expect(
        f.service.handleDecision(f.issuer, f.decision, 30, f.context).accepted
    ).toBe(false)
    expect(f.service.snapshot(f.player.id, 30).quests?.[0]).toEqual(active)
    expect(f.service.cityFund(f.issuer.locationId)).toBe(290)
    expect(
        f.parties.contractSlots.idsFor(f.parties.contractGroup(f.player.id).key)
            .size > 0
    ).toBe(true)
    expect(f.service.snapshot(f.player.id, 30).questOffer).toBeNull()
})

it('switches worker proposals without claiming either request or spending city gold', () => {
    const f = npcQuestFixture()
    const request = (id: string, workerName: string): WorkRequestSnapshot => ({
        id,
        workerName,
        workerId: `worker-${id}`,
        cityId: f.issuer.locationId,
        clerkId: f.issuer.id,
        locationId: 'map-2-1',
        locationName: 'Северная застава',
        enemyName: 'скелет',
        requiredTrophyItemId: 'bone',
        proofAccepted: false,
        stage: 'waiting',
        reason: null,
    })
    const requests = [request('first', 'Гордей'), request('second', 'Агафья')]
    vi.spyOn(f.workers, 'list').mockImplementation(() =>
        structuredClone(requests)
    )
    const accept = vi.spyOn(f.workers, 'accept')
    expect(
        f.service.workerPropose(f.issuer, f.player.id, 'first', 10).accepted
    ).toBe(true)
    const previous = offer(f)
    const decision: NpcQuestDecision = {
        type: 'worker_quest_propose',
        targetId: f.player.id,
        requestId: 'second',
        replaceOffer: replacement(previous),
    }
    const context = { freshDialogueTargetId: f.player.id }
    expect(
        f.service.handleDecision(f.issuer, decision, 30, context).accepted
    ).toBe(true)
    const current = offer(f, 30)
    expect(current).toMatchObject({
        workerRequestId: 'second',
        title: 'Вернуть к работе: Агафья',
    })
    expect(
        f.service.handleDecision(
            f.issuer,
            {
                ...decision,
                requestId: 'unpublished',
                replaceOffer: replacement(current),
            },
            40,
            context
        ).accepted
    ).toBe(false)
    expect(offer(f, 40)).toEqual(current)
    expect(accept).not.toHaveBeenCalled()
    expect(f.workers.list()).toEqual(requests)
    expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
    expect(
        f.parties.contractSlots.idsFor(f.parties.contractGroup(f.player.id).key)
            .size > 0
    ).toBe(false)
})

it.each(['quest_propose', 'worker_quest_propose'] as const)(
    'parses replacement references strictly for %s',
    (type) => {
        const f = npcQuestFixture()
        const decision =
            type === 'quest_propose'
                ? { type, targetId: f.player.id, draft: f.draft() }
                : { type, targetId: f.player.id, requestId: 'request-1' }
        const reference = { offerId: 'offer-1', revision: 2 }
        expect(
            parseNpcQuestDecision({ ...decision, replaceOffer: reference })
        ).toEqual({ ...decision, replaceOffer: reference })
        for (const invalid of [
            null,
            {},
            { ...reference, revision: 0 },
            { ...reference, revision: 1.5 },
            { ...reference, offerId: '' },
            { ...reference, revision: Number.MAX_SAFE_INTEGER + 1 },
            { ...reference, freshDialogueTargetId: f.player.id },
        ]) {
            expect(
                parseNpcQuestDecision({ ...decision, replaceOffer: invalid })
            ).toBeUndefined()
        }
    }
)
