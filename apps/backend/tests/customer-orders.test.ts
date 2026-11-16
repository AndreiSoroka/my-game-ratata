import { expect, it } from 'vitest'

import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { orderFixture, required } from './craft-order-fixture'

it('charges 13+12 for a 25 gold item, reserves the actual output, and deduplicates submit/claim', () => {
    const f = orderFixture()
    const before = f.service.snapshot(f.buyer.id).gold
    const submit = {
        type: 'craft_order_place' as const,
        npcId: f.artisan.id,
        itemId: 'axe' as const,
        expectedTotal: 25,
        requestId: 'stable-submit',
    }
    expect(f.act(f.buyer, submit).accepted).toBe(true)
    expect(f.act(f.buyer, submit).accepted).toBe(true)
    expect(f.service.economy.customerOrders.snapshot(f.buyer.id)).toHaveLength(
        1
    )
    expect(f.service.snapshot(f.buyer.id).gold).toBe(before - 13)
    expect(f.place().accepted).toBe(false)
    expect(f.craft()).toBe('axe')
    expect(f.marketRow('axe').stock).toBe(0)
    const order = f.order()
    expect(order).toMatchObject({
        status: 'ready',
        fullPrice: 25,
        deposit: 13,
        remaining: 12,
    })
    const claim = {
        type: 'craft_order_claim' as const,
        npcId: f.artisan.id,
        orderId: order.id,
        expectedRemaining: 12,
        requestId: 'stable-claim',
    }
    expect(f.act(f.other, claim).accepted).toBe(false)
    expect(f.act(f.buyer, claim).accepted).toBe(true)
    expect(f.act(f.buyer, claim).accepted).toBe(true)
    expect(countInventoryItem(f.buyer.inventory, 'axe')).toBe(4)
    expect(f.service.snapshot(f.buyer.id).gold).toBe(before - 25)
    expect(f.order().status).toBe('collected')
})

it('does not charge remainder or lose a reserved item on full bag, insufficient gold, or stale quote', () => {
    const f = orderFixture()
    expect(f.place().accepted).toBe(true)
    f.craft()
    const gold = f.service.snapshot(f.buyer.id).gold
    f.buyer.inventory = Array.from({ length: 50 }, () =>
        createItemInstance('food')
    )
    const claim = () =>
        f.act(f.buyer, {
            type: 'craft_order_claim',
            npcId: f.artisan.id,
            orderId: f.order().id,
            expectedRemaining: 12,
            requestId: f.requestId(),
        })
    expect(claim().accepted).toBe(false)
    expect(f.order().status).toBe('ready')
    expect(f.service.snapshot(f.buyer.id).gold).toBe(gold)
    f.buyer.inventory = []
    f.service.drainGold(f.buyer.id)
    expect(claim().accepted).toBe(false)
    f.service.creditLootGold(f.buyer.id, 12)
    expect(
        f.act(f.buyer, {
            type: 'craft_order_claim',
            npcId: f.artisan.id,
            orderId: f.order().id,
            expectedRemaining: 11,
            requestId: f.requestId(),
        }).accepted
    ).toBe(false)
    expect(claim().accepted).toBe(true)
})

it('schedules FIFO among fulfillable paid orders and uses only canonical recipes', () => {
    const f = orderFixture('stone_axe')
    expect(
        f.trade(f.other, 'stone', 'buy', f.marketRow('stone').stock).accepted
    ).toBe(true)
    expect(f.place().accepted).toBe(true)
    expect(f.order().status).toBe('waiting_materials')
    expect(
        f.trade(f.other, 'axe', 'buy', f.marketRow('axe').stock).accepted
    ).toBe(true)
    expect(f.place(f.other, 'axe').accepted).toBe(true)
    expect(f.craft()).toBe('axe')
    expect(f.order(f.other).status).toBe('ready')
    expect(f.order().status).toBe('waiting_materials')
    expect(f.trade(f.other, 'stone', 'sell', 2).accepted).toBe(true)
    f.tick(1)
    expect(f.order().status).toBe('queued')
    expect(f.craft()).toBe('stone_axe')
    expect(f.order().status).toBe('ready')
})

it('never accepts an unrelated gifted item as a production result; lost inputs retry without refunds or minting', () => {
    const f = orderFixture()
    expect(f.place().accepted).toBe(true)
    expect(f.service.economy.startNextWork(f.artisan, 0)).toBe('axe')
    f.artisan.inventory.push(createItemInstance('axe'))
    expect(f.service.economy.completeWorkOrder(f.artisan, 0)).toBe(false)
    const stolen = required(
        f.artisan.inventory.find((item) => item.itemId === 'scrap')
    )
    f.artisan.inventory.splice(f.artisan.inventory.indexOf(stolen), 1)
    f.other.inventory.push(stolen)
    f.service.economy.reconcileWorkOrder(f.artisan)
    expect(f.order().status).toBe('waiting_materials')
    expect(f.service.economy.hasWorkOrder(f.artisan.id)).toBe(false)
    expect(f.marketRow('scrap').stock).toBe(0)
    expect(countInventoryItem(f.other.inventory, 'scrap')).toBe(1)
    expect(f.marketRow('axe').stock).toBe(0)
})

it('supports ready goods and orders at each artisan and validates direct service access', () => {
    for (const [npcId, itemId] of [
        ['npc_weaver_1', 'boots'],
        ['npc_baker_1', 'food'],
    ] as const) {
        const f = orderFixture(itemId, npcId)
        expect(
            f.act(f.buyer, {
                type: 'interact',
                targetId: npcId,
                service: 'orders',
            }).accepted
        ).toBe(true)
        expect(f.service.snapshot(f.buyer.id).dialogue?.initialView).toBe(
            'orders'
        )
        expect(f.place().accepted).toBe(true)
        f.craft()
        expect(f.order().status).toBe('ready')
        expect(
            f.act(f.buyer, {
                type: 'interact',
                targetId: npcId,
                service: 'repair',
            }).accepted
        ).toBe(false)
    }
})
