import { expect, it } from 'vitest'

import { orderFixture } from './craft-order-fixture'

it('cancellation is nonrefundable before, during, and after production; real finished items become public', () => {
    for (const phase of ['waiting', 'inflight', 'ready'] as const) {
        const f = orderFixture()
        expect(f.place().accepted).toBe(true)
        const gold = f.service.snapshot(f.buyer.id).gold
        if (phase === 'inflight') {
            expect(f.service.economy.startNextWork(f.artisan, 0)).toBe('axe')
        }
        if (phase === 'ready') {
            f.craft()
        }
        const message = {
            type: 'craft_order_cancel' as const,
            npcId: f.artisan.id,
            orderId: f.order().id,
            requestId: 'cancel',
        }
        expect(f.act(f.buyer, message).accepted).toBe(true)
        expect(f.act(f.buyer, message).accepted).toBe(true)
        expect(f.service.snapshot(f.buyer.id).gold).toBe(gold)
        if (phase === 'inflight') {
            expect(
                f.act(f.artisan, { type: 'craft', recipeId: 'axe' }).accepted
            ).toBe(true)
            expect(f.service.economy.completeWorkOrder(f.artisan, 0)).toBe(true)
        }
        expect(f.order().status).toBe(
            phase === 'waiting' ? 'cancelled' : 'released'
        )
        expect(f.marketRow('axe').stock).toBe(phase === 'waiting' ? 0 : 1)
    }
})

it('only permanent death starts ten minutes, duplicate events never extend it, and fresh identities get nothing', () => {
    const f = orderFixture()
    expect(f.place().accepted).toBe(true)
    f.craft()
    const find = (id: string) => f.characters.find((actor) => actor.id === id)
    f.service.observe(
        [{ kind: 'death', actorId: f.other.id, targetId: f.buyer.id }],
        find
    )
    f.service.observe(
        [{ kind: 'revive', actorId: f.other.id, targetId: f.buyer.id }],
        find
    )
    expect(f.order().releaseAt).toBeUndefined()
    f.tick(1000)
    f.service.observe([{ kind: 'permadeath', actorId: f.buyer.id }], find)
    expect(f.order().releaseAt).toBe(601_000)
    f.tick(2000)
    f.service.observe([{ kind: 'permadeath', actorId: f.buyer.id }], find)
    expect(f.order().releaseAt).toBe(601_000)
    f.tick(600_999)
    expect(f.order().status).toBe('ready')
    expect(f.marketRow('axe').stock).toBe(0)
    expect(
        f.act(f.other, {
            type: 'craft_order_claim',
            npcId: f.artisan.id,
            orderId: f.order().id,
            expectedRemaining: 12,
            requestId: f.requestId(),
        }).accepted
    ).toBe(false)
    f.tick(601_000)
    expect(f.order().status).toBe('released')
    expect(f.marketRow('axe').stock).toBe(1)
    expect(f.marketRow('axe').buyPrice).toBe(25)
    f.tick(700_000)
    expect(f.marketRow('axe').stock).toBe(1)
})

it('unstarted orders lose priority on permanent death; an in-flight item finishing after the deadline is immediately public', () => {
    const waiting = orderFixture()
    expect(waiting.place().accepted).toBe(true)
    waiting.service.economy.customerOrders.retire(waiting.buyer.id, 0)
    expect(waiting.order().status).toBe('cancelled')
    expect(
        waiting.service.economy.customerOrders.hasPriority(waiting.artisan.id)
    ).toBe(false)
    const f = orderFixture()
    expect(f.place().accepted).toBe(true)
    expect(f.service.economy.startNextWork(f.artisan, 0)).toBe('axe')
    f.service.economy.customerOrders.retire(f.buyer.id, 0)
    f.tick(600_000)
    expect(f.act(f.artisan, { type: 'craft', recipeId: 'axe' }).accepted).toBe(
        true
    )
    expect(f.service.economy.completeWorkOrder(f.artisan, f.now())).toBe(true)
    expect(f.order().status).toBe('released')
    expect(f.marketRow('axe').stock).toBe(1)
})
