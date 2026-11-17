import { INVENTORY_CAPACITY } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { parseExchangeCommand } from '../src/game/exchangeCommands'
import { createItemInstance, itemQuantity } from '../src/game/inventoryItems'
import { RewardReservations } from '../src/game/rewardReservations'
import { exchangeFixture } from './exchangeFixture'

it('transfers a gift exactly once and exposes only offered inventory', () => {
    const f = exchangeFixture()
    const gift = createItemInstance('boots')
    gift.durability = 9
    gift.wearDistance = 0.25
    f.a.inventory.push(gift, createItemInstance('food'))
    f.open()
    expect(
        f.offer(f.a, 0, [{ instanceId: gift.instanceId, quantity: 1 }]).accepted
    ).toBe(true)
    const snapshot = f.service.snapshot(f.b.id)
    expect(snapshot?.other.items).toHaveLength(1)
    expect(snapshot?.other).not.toHaveProperty('inventory')
    expect(f.a.inventory).toHaveLength(2)
    f.accept(f.a)
    const revision = f.service.snapshot(f.a.id)?.revision ?? 0
    const id = f.service.snapshot(f.a.id)?.id ?? ''
    expect(f.accept(f.b).accepted).toBe(true)
    expect(f.a.inventory).toHaveLength(1)
    expect(f.b.inventory).toEqual([gift])
    expect(f.b.inventory[0]?.wearDistance).toBe(0.25)
    expect(f.service.snapshot(f.b.id)?.other.items).toEqual([
        expect.objectContaining({
            instanceId: gift.instanceId,
            itemId: 'boots',
            quantity: 1,
            durability: 9,
        }),
    ])
    expect(f.service.snapshot(f.a.id)?.own.items).toHaveLength(1)
    expect(f.service.snapshot(f.a.id)?.receiptId).toBe(
        `${id}:${String(revision)}`
    )
    expect(
        f.send(f.a, { type: 'exchange_accept', exchangeId: id, revision })
            .accepted
    ).toBe(true)
    expect(f.b.inventory).toHaveLength(1)
})

it('exchanges a sword for five existing gold without revealing the wallet', () => {
    const f = exchangeFixture()
    const sword = createItemInstance('simple_sword')
    f.b.inventory.push(sword)
    f.adventure.walletFor(f.a.id).gold = 8
    f.open()
    f.offer(f.a, 5)
    f.offer(f.b, 0, [{ instanceId: sword.instanceId, quantity: 1 }])
    expect(f.service.snapshot(f.b.id)?.other.gold).toBe(5)
    f.accept(f.a)
    f.accept(f.b)
    expect(f.a.inventory[0]?.instanceId).toBe(sword.instanceId)
    expect(f.adventure.walletFor(f.a.id).gold).toBe(3)
    expect(f.adventure.walletFor(f.b.id).gold).toBe(5)
})

it('removes both outgoing sets before checking two full bags', () => {
    const f = exchangeFixture()
    f.a.inventory.push(
        ...Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('wood')
        )
    )
    f.b.inventory.push(
        ...Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('stone')
        )
    )
    const wood = f.a.inventory[0]
    const stone = f.b.inventory[0]
    f.open()
    f.offer(f.a, 0, [{ instanceId: wood?.instanceId ?? '', quantity: 1 }])
    f.offer(f.b, 0, [{ instanceId: stone?.instanceId ?? '', quantity: 1 }])
    f.accept(f.a)
    expect(f.accept(f.b).accepted).toBe(true)
    expect(f.a.inventory).toHaveLength(INVENTORY_CAPACITY)
    expect(f.b.inventory).toHaveLength(INVENTORY_CAPACITY)
    expect(
        f.a.inventory.some((item) => item.instanceId === stone?.instanceId)
    ).toBe(true)
})

it('leaves everything untouched when the gift does not fit', () => {
    const f = exchangeFixture()
    const food = createItemInstance('food')
    f.a.inventory.push(food)
    f.b.inventory.push(
        ...Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('wood')
        )
    )
    f.open()
    f.offer(f.a, 0, [{ instanceId: food.instanceId, quantity: 1 }])
    f.accept(f.a)
    expect(f.accept(f.b).accepted).toBe(false)
    expect(f.a.inventory).toEqual([food])
    expect(f.b.inventory).toHaveLength(INVENTORY_CAPACITY)
    expect(f.service.snapshot(f.a.id)?.own.accepted).toBe(false)
})

it('transfers a free part of a reserved stack and keeps reserved identity', () => {
    const f = exchangeFixture()
    const herbs = createItemInstance('herbs', 8)
    f.a.inventory.push(herbs)
    const reservations = new RewardReservations()
    reservations.reserve(
        'quest',
        { inventory: f.a.inventory, wallet: f.adventure.walletFor(f.a.id) },
        0,
        [{ instanceId: herbs.instanceId, quantity: 3 }]
    )
    f.open()
    expect(
        f.offer(f.a, 0, [{ instanceId: herbs.instanceId, quantity: 6 }])
            .accepted
    ).toBe(false)
    f.offer(f.a, 0, [{ instanceId: herbs.instanceId, quantity: 5 }])
    f.accept(f.a)
    f.accept(f.b)
    expect(f.a.inventory[0]?.instanceId).toBe(herbs.instanceId)
    expect(itemQuantity(f.a.inventory[0] ?? herbs)).toBe(3)
    expect(f.b.inventory[0]?.instanceId).not.toBe(herbs.instanceId)
    expect(itemQuantity(f.b.inventory[0] ?? herbs)).toBe(5)
    expect(reservations.valid('quest')).toBe(true)
})

it('invalidates confirmations on revision and durability changes', () => {
    const f = exchangeFixture()
    const sword = createItemInstance('simple_sword')
    f.a.inventory.push(sword)
    f.open()
    f.offer(f.a, 0, [{ instanceId: sword.instanceId, quantity: 1 }])
    f.accept(f.a)
    const revision = f.service.snapshot(f.a.id)?.revision ?? 0
    sword.durability = 1
    f.service.update(1)
    expect(f.service.snapshot(f.a.id)?.revision).toBe(revision + 1)
    expect(f.service.snapshot(f.a.id)?.own.accepted).toBe(false)
    expect(
        f.send(f.b, {
            type: 'exchange_accept',
            exchangeId: f.service.snapshot(f.b.id)?.id ?? '',
            revision,
        }).accepted
    ).toBe(false)
})

it('never confirms unavailable gold and resets on a lost balance', () => {
    const f = exchangeFixture()
    f.adventure.walletFor(f.a.id).gold = 10
    f.open()
    f.offer(f.a, 8)
    f.accept(f.a)
    f.adventure.walletFor(f.a.id).gold = 7
    f.service.update(1)
    expect(f.service.snapshot(f.a.id)?.own.gold).toBe(0)
    expect(f.service.snapshot(f.a.id)?.own.accepted).toBe(false)
    expect(f.adventure.walletFor(f.b.id).gold).toBe(0)
})

it.each(['death', 'disconnect', 'location', 'distance'] as const)(
    'cancels without transfer on %s',
    (cause) => {
        const f = exchangeFixture()
        f.a.inventory.push(createItemInstance('food'))
        f.open()
        f.offer(f.a, 0, [
            { instanceId: f.a.inventory[0]?.instanceId ?? '', quantity: 1 },
        ])
        f.accept(f.a)
        if (cause === 'death') {
            f.b.alive = false
        }
        if (cause === 'disconnect') {
            f.b.connected = false
        }
        if (cause === 'location') {
            f.b.locationId = 'map-0-0'
        }
        if (cause === 'distance') {
            f.b.position.x += 49
        }
        f.service.update(1)
        expect(f.service.snapshot(f.a.id)?.status).toBe('cancelled')
        expect(f.a.inventory).toHaveLength(1)
        expect(f.b.inventory).toHaveLength(0)
        expect(f.service.isPaused(f.a.id)).toBe(false)
    }
)

it('does not pause an invitee until consent and requires an AI lease', () => {
    const f = exchangeFixture(true)
    f.b.setPath([{ x: 120, y: 80 }])
    expect(
        f.send(f.a, { type: 'exchange_invite', targetId: f.b.id }).accepted
    ).toBe(true)
    const exchangeId = f.service.snapshot(f.a.id)?.id ?? ''
    expect(f.invites).toEqual([`b:${exchangeId}`])
    expect(f.service.isPaused(f.b.id)).toBe(false)
    expect(f.b.hasPath()).toBe(true)
    expect(
        f.send(f.b, { type: 'exchange_answer', exchangeId, accept: true })
            .accepted
    ).toBe(false)
    f.setLease(true)
    expect(
        f.send(f.b, { type: 'exchange_answer', exchangeId, accept: true })
            .accepted
    ).toBe(true)
    expect(f.service.isPaused(f.b.id)).toBe(true)
    f.setLease(false)
    f.service.update(1)
    expect(f.service.snapshot(f.a.id)?.status).toBe('cancelled')
})

it('rejects malformed, fractional, duplicate and negative offers at boundary', () => {
    for (const patch of [
        { gold: -1 },
        { gold: 0.5 },
        { revision: 0 },
        { items: [{ instanceId: 'x', quantity: 0 }] },
        {
            items: [
                { instanceId: 'x', quantity: 1 },
                { instanceId: 'x', quantity: 1 },
            ],
        },
    ]) {
        expect(
            parseExchangeCommand({
                type: 'exchange_offer',
                exchangeId: 'trade',
                revision: 1,
                gold: 0,
                items: [],
                ...patch,
            })
        ).toBeUndefined()
    }
})
