import { expect, it } from 'vitest'

import { createItemInstance } from '../src/game/inventoryItems'
import { TradeNotifications } from '../src/game/tradeNotifications'
import { exchangeFixture } from './exchangeFixture'

function view(f: ReturnType<typeof exchangeFixture>, id: string) {
    const snapshot = f.service.snapshot(id)
    if (snapshot === null) {
        throw new Error('Missing exchange')
    }
    return snapshot
}
function getOwnRevision(f: ReturnType<typeof exchangeFixture>, id: string) {
    return view(f, id).own.revision ?? 1
}

it('acknowledges repeated invitation acceptance without a bogus refusal or new expiry', () => {
    const f = exchangeFixture()
    const exchangeId = f.open()
    expect(
        f.send(f.b, { type: 'exchange_answer', exchangeId, accept: true })
    ).toEqual({ accepted: true, error: null })
    expect(f.service.snapshot(f.b.id)?.status).toBe('active')
    expect(f.service.snapshot(f.b.id)?.notice).toBeUndefined()
})

it('accepts independent per-side proposals, preserves consent on no-op and deduplicates retried IDs', () => {
    const f = exchangeFixture()
    const exchangeId = f.open()
    f.adventure.walletFor(f.a.id).gold = 10
    f.adventure.walletFor(f.b.id).gold = 10
    const ownRevision = getOwnRevision(f, f.a.id)
    const bRevision = getOwnRevision(f, f.b.id)
    const aCommand = {
        type: 'exchange_offer' as const,
        exchangeId,
        revision: ownRevision,
        requestId: 'a1',
        items: [],
        gold: 5,
    }
    expect(f.send(f.a, aCommand).accepted).toBe(true)
    expect(
        f.send(f.b, {
            type: 'exchange_offer',
            exchangeId,
            revision: bRevision,
            requestId: 'b1',
            items: [],
            gold: 3,
        }).accepted
    ).toBe(true)
    f.accept(f.a)
    const revision = view(f, f.a.id).revision
    expect(f.send(f.a, aCommand).accepted).toBe(true)
    expect(view(f, f.a.id).revision).toBe(revision)
    expect(view(f, f.a.id).own.accepted).toBe(true)
    expect(
        f.send(f.a, {
            ...aCommand,
            requestId: 'a2',
            revision: getOwnRevision(f, f.a.id),
        }).accepted
    ).toBe(true)
    expect(view(f, f.a.id).own.lastRequestId).toBe('a2')
    expect(view(f, f.a.id).own.accepted).toBe(true)
    expect(
        f.send(f.a, { ...aCommand, requestId: 'bad', revision: ownRevision })
            .accepted
    ).toBe(false)
    expect(view(f, f.a.id).own.lastRequestId).toBe('bad')
    expect(view(f, f.a.id).own.requestError).toBeTruthy()
    expect(view(f, f.a.id).other).not.toHaveProperty('inventory')
})

it('declines terms without cancelling a gift negotiation, then starts a new exchange from a closed one', () => {
    const f = exchangeFixture()
    const exchangeId = f.open()
    const food = createItemInstance('food')
    f.a.inventory.push(food)
    expect(
        f.send(f.b, {
            type: 'exchange_decline',
            exchangeId,
            revision: view(f, f.b.id).revision,
            reason: 'Предложи что-нибудь.',
        }).accepted
    ).toBe(true)
    expect(view(f, f.a.id).status).toBe('active')
    f.offer(f.a, 0, [{ instanceId: food.instanceId, quantity: 1 }])
    f.accept(f.a)
    f.accept(f.b)
    expect(view(f, f.a.id).status).toBe('completed')
    const receipt = view(f, f.a.id).receiptId
    f.send(f.a, { type: 'exchange_invite', targetId: f.b.id })
    expect(view(f, f.a.id).id).not.toBe(exchangeId)
    f.send(f.a, { type: 'exchange_cancel', exchangeId })
    expect(view(f, f.a.id).status).toBe('invited')
    expect(f.b.inventory[0]?.instanceId).toBe(food.instanceId)
    expect(receipt).toBeTruthy()
})

it('notifies only the partner of a new refusal, with stable repeated receipts', () => {
    const f = exchangeFixture()
    const exchangeId = f.open()
    const notifications = new TradeNotifications()
    notifications.changed(f.b.id, view(f, f.b.id))
    const command = {
        type: 'exchange_decline' as const,
        exchangeId,
        revision: view(f, f.a.id).revision,
        reason: 'Хочу другие условия.',
    }
    f.send(f.a, command)
    expect(notifications.changed(f.b.id, view(f, f.b.id))).toBe(true)
    expect(notifications.changed(f.b.id, view(f, f.b.id))).toBe(false)
    f.send(f.a, command)
    expect(notifications.changed(f.b.id, view(f, f.b.id))).toBe(false)
    expect(view(f, f.b.id).other.refusal?.reason).toBe(command.reason)
})
