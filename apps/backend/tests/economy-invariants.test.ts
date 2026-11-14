import {
    CENTER_LOCATION_ID,
    type MarketItemId,
    type MarketSide,
    quoteMarketTrade,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { createAdventureState } from '../src/game/adventureState'
import { CityEconomyService } from '../src/game/cityEconomy'
import {
    addInventoryItems,
    countInventoryItem,
    createItemInstance,
} from '../src/game/inventory'
import { abilityHero } from './abilityTestHelpers'

describe('finite city warehouse invariants', () => {
    it('conserves material quantities across whole and partial-stack trades', () => {
        const setup = fixture()
        const initial = setup.row('grain').stock
        expect(setup.trade('buy', 'grain', 4).accepted).toBe(true)
        expect(setup.trade('sell', 'grain', 1).accepted).toBe(true)
        expect(
            setup.row('grain').stock +
                countInventoryItem(setup.actor.inventory, 'grain')
        ).toBe(initial)
        expect(countInventoryItem(setup.actor.inventory, 'grain')).toBe(3)
        expect(
            new Set(setup.actor.inventory.map((item) => item.instanceId)).size
        ).toBe(setup.actor.inventory.length)
        const before = setup.row('grain')
        for (let index = 0; index < 10; index += 1) {
            setup.economy.snapshot(CENTER_LOCATION_ID, 0)
        }
        expect(setup.row('grain')).toEqual(before)
    })

    it('keeps warehouse and gold unchanged when inventory capacity or quoted price fails', () => {
        const setup = fixture()
        addInventoryItems(
            setup.actor.inventory,
            Array.from({ length: 50 }, () => createItemInstance('food'))
        )
        const stock = setup.row('wood').stock
        const gold = setup.wallet.gold
        expect(setup.trade('buy', 'wood', 1).accepted).toBe(false)
        expect(setup.row('wood').stock).toBe(stock)
        expect(setup.wallet.gold).toBe(gold)
        setup.actor.inventory = []
        expect(
            setup.economy.trade(
                setup.actor,
                setup.wallet,
                {
                    type: 'market_trade',
                    npcId: 'npc_merchant_1',
                    itemId: 'wood',
                    side: 'buy',
                    quantity: 1,
                    expectedTotal: 999,
                    requestId: 'wrong-price',
                },
                0
            ).accepted
        ).toBe(false)
        expect(setup.actor.inventory).toHaveLength(0)
        expect(setup.row('wood').stock).toBe(stock)
        expect(setup.wallet.gold).toBe(gold)
    })

    it('enforces the reserve limit without partially consuming a sale', () => {
        const setup = fixture()
        const row = setup.row('wood')
        const quantity = row.capacity - row.stock
        addInventoryItems(setup.actor.inventory, [
            createItemInstance('wood', quantity + 1),
        ])
        const before = structuredClone(setup.actor.inventory)
        const gold = setup.wallet.gold
        expect(setup.trade('sell', 'wood', quantity + 1).accepted).toBe(false)
        expect(setup.actor.inventory).toEqual(before)
        expect(setup.wallet.gold).toBe(gold)
        expect(setup.trade('sell', 'wood', quantity).accepted).toBe(true)
        expect(setup.row('wood').stock).toBe(row.capacity)
        expect(setup.trade('sell', 'wood', 1).accepted).toBe(false)
        expect(countInventoryItem(setup.actor.inventory, 'wood')).toBe(1)
    })

    it('leaves an exhausted stock empty without accruing a consumption debt', () => {
        const setup = fixture()
        setup.economy.update(3_600_000)
        expect(setup.row('wood').stock).toBe(0)
        addInventoryItems(setup.actor.inventory, [
            createItemInstance('wood', 2),
        ])
        expect(setup.trade('sell', 'wood', 2, 3_600_000).accepted).toBe(true)
        setup.economy.update(3_600_001)
        expect(setup.row('wood').stock).toBe(2)
        setup.economy.update(4_200_000)
        expect(setup.row('wood').stock).toBe(0)
    })
})

describe('warehouse prices and identity isolation', () => {
    it.each([1, 2, 5, 6])(
        'cannot profit by reversing a purchase of %s wood',
        (quantity) => {
            const setup = fixture()
            const initial = setup.wallet.gold
            expect(setup.trade('buy', 'wood', quantity).accepted).toBe(true)
            expect(setup.trade('sell', 'wood', quantity).accepted).toBe(true)
            expect(setup.wallet.gold).toBeLessThan(initial)
            expect(setup.row('wood').stock).toBe(6)
        }
    )

    it('shares a finite last tool among buyers and creates no replacement on reads', () => {
        const setup = fixture()
        const count = setup.row('axe').stock
        expect(setup.trade('buy', 'axe', count).accepted).toBe(true)
        expect(setup.row('axe').stock).toBe(0)
        expect(setup.trade('buy', 'axe', 1).accepted).toBe(false)
        expect(
            setup.actor.inventory.filter((item) => item.itemId === 'axe')
        ).toHaveLength(count)
        expect(
            setup.actor.inventory.every((item) => item.durability === 1000)
        ).toBe(true)
        expect(setup.row('axe').stock).toBe(0)
    })

    it('updates separate city warehouses without allowing remote inventory transfers', () => {
        const setup = fixture(['map-2-2', 'test-city'])
        expect(setup.trade('buy', 'wood', 1).accepted).toBe(true)
        expect(
            setup.economy
                .snapshot('test-city', 0)
                ?.rows.find((row) => row.itemId === 'wood')?.stock
        ).toBe(6)
        setup.actor.locationId = 'map-0-0'
        const before = structuredClone(setup.actor.inventory)
        expect(setup.trade('sell', 'wood', 1).accepted).toBe(false)
        expect(setup.actor.inventory).toEqual(before)
    })
})

function fixture(cityIds: string[] = [CENTER_LOCATION_ID]) {
    const economy = new CityEconomyService(0, cityIds)
    const actor = abilityHero()
    const wallet = createAdventureState()
    wallet.gold = 10_000
    const row = (id: MarketItemId) => {
        const result = economy
            .snapshot(CENTER_LOCATION_ID, 0)
            ?.rows.find((entry) => entry.itemId === id)
        if (result === undefined) {
            throw new Error('Missing market row')
        }
        return result
    }
    const trade = (
        side: MarketSide,
        itemId: MarketItemId,
        quantity: number,
        now = 0
    ) =>
        economy.trade(
            actor,
            wallet,
            {
                type: 'market_trade',
                npcId: 'npc_merchant_1',
                itemId,
                side,
                quantity,
                expectedTotal:
                    quoteMarketTrade(row(itemId), side, quantity) ?? 0,
                requestId: 'test-request',
            },
            now
        )
    return { economy, actor, wallet, row, trade }
}
