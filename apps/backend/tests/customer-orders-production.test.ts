import { expect, it } from 'vitest'

import { ArtisanController } from '../src/game/artisanController'
import { GameCharacter } from '../src/game/character'
import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import type { GameRoom } from '../src/game/room'
import { orderFixture, required } from './craft-order-fixture'

it('retains the thirty-second production interval while prioritizing queued paid work', () => {
    const f = orderFixture()
    const controller = new ArtisanController()
    const room = {
        adventureForWorkers: () => f.service,
        navigationFor: () => f.navigation,
        requestAdventure: (
            actor: GameCharacter,
            message: Parameters<typeof f.act>[1]
        ) => f.act(actor, message),
        publishEvents: () => undefined,
    } as unknown as GameRoom
    expect(f.place().accepted).toBe(true)
    controller.update(f.artisan, room, 0)
    expect(f.order().status).toBe('ready')
    expect(f.place(f.other).accepted).toBe(true)
    f.buyer.inventory.push(
        createItemInstance('scrap'),
        createItemInstance('scrap'),
        createItemInstance('scrap')
    )
    expect(f.trade(f.buyer, 'scrap', 'sell', 3).accepted).toBe(true)
    f.tick(29_999)
    controller.update(f.artisan, room, 29_999)
    expect(f.order(f.other).status).toBe('queued')
    f.tick(30_000)
    controller.update(f.artisan, room, 30_000)
    expect(f.order(f.other).status).toBe('ready')
    expect(f.marketRow('axe').stock).toBe(0)
})

it('releases actual reserved outputs above the public procurement cap without duplication or discounts', () => {
    const f = orderFixture()
    const count = f.marketRow('axe').capacity + 1
    const owners: GameCharacter[] = []
    for (let index = 0; index < count; index += 1) {
        const customer =
            index === 0
                ? f.buyer
                : new GameCharacter({
                      id: `customer-${String(index)}`,
                      nickname: 'customer',
                      archetype: 'human',
                      controllerKind: 'network_player',
                      faction: 'peaceful',
                      spawnPosition: { x: 24, y: 24 },
                  })
        if (index > 0) {
            f.characters.push(customer)
            f.service.grantGoldOnce(customer.id, 50, 'seed')
            f.buyer.inventory.push(
                ...Array.from({ length: 3 }, () => createItemInstance('scrap')),
                ...Array.from({ length: 2 }, () => createItemInstance('wood'))
            )
            expect(f.trade(f.buyer, 'scrap', 'sell', 3).accepted).toBe(true)
            expect(f.trade(f.buyer, 'wood', 'sell', 2).accepted).toBe(true)
        }
        expect(f.place(customer).accepted).toBe(true)
        f.craft()
        owners.push(customer)
    }
    expect(f.marketRow('axe').stock).toBe(0)
    for (const owner of owners) {
        f.service.economy.customerOrders.retire(owner.id, 0)
    }
    f.tick(600_000)
    expect(f.marketRow('axe').stock).toBe(count)
    expect(f.marketRow('axe').buyPrice).toBe(25)
    expect(f.marketRow('axe').sellPrice).toBeNull()
    expect(f.trade(f.other, 'axe', 'buy', count).accepted).toBe(true)
    expect(countInventoryItem(f.other.inventory, 'axe')).toBe(count)
    expect(new Set(f.other.inventory.map((item) => item.instanceId)).size).toBe(
        count
    )
    f.tick(600_001)
    expect(f.marketRow('axe').stock).toBe(0)
})

it('losing an exact crafted output retries the order even if spare ingredients remain', () => {
    const f = orderFixture()
    expect(f.place().accepted).toBe(true)
    expect(f.service.economy.startNextWork(f.artisan, 0)).toBe('axe')
    f.artisan.inventory.push(
        ...Array.from({ length: 3 }, () => createItemInstance('scrap')),
        ...Array.from({ length: 2 }, () => createItemInstance('wood'))
    )
    expect(f.act(f.artisan, { type: 'craft', recipeId: 'axe' }).accepted).toBe(
        true
    )
    const produced = required(
        f.artisan.inventory.find((item) => item.itemId === 'axe')
    )
    f.artisan.inventory.splice(f.artisan.inventory.indexOf(produced), 1)
    f.other.inventory.push(produced)
    f.service.economy.reconcileWorkOrder(f.artisan)
    expect(f.service.economy.hasWorkOrder(f.artisan.id)).toBe(false)
    expect(f.order().status).toBe('waiting_materials')
    expect(f.marketRow('axe').stock).toBe(0)
    expect(countInventoryItem(f.other.inventory, 'axe')).toBe(1)
})

it('order placement revalidates service, merchant life, sight, location, crime and current price before taking money', () => {
    const f = orderFixture()
    const before = f.service.snapshot(f.buyer.id).gold
    f.artisan.alive = false
    expect(f.place().accepted).toBe(false)
    f.artisan.alive = true
    f.buyer.tags.add('city.blacklisted')
    expect(f.place().accepted).toBe(false)
    f.buyer.tags.delete('city.blacklisted')
    expect(
        f.act(f.buyer, {
            type: 'craft_order_place',
            npcId: f.artisan.id,
            itemId: 'axe',
            expectedTotal: 24,
            requestId: f.requestId(),
        }).accepted
    ).toBe(false)
    f.artisan.position = { x: 56, y: 24 }
    f.navigation.grid.solid[22] = true
    expect(f.place().accepted).toBe(false)
    f.navigation.grid.solid[22] = false
    f.artisan.locationId = 'map-0-0'
    expect(f.place().accepted).toBe(false)
    expect(f.service.snapshot(f.buyer.id).gold).toBe(before)
    expect(f.service.economy.customerOrders.snapshot(f.buyer.id)).toHaveLength(
        0
    )
})
