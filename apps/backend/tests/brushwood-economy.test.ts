import {
    CENTER_LOCATION_ID,
    type MarketRow,
    quoteMarketTrade,
    quoteMarketTradeBreakdown,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { createAdventureState } from '../src/game/adventureState'
import { GameCharacter } from '../src/game/character'
import { CityEconomyService } from '../src/game/cityEconomy'
import {
    addInventoryItems,
    countInventoryItem,
    createItemInstance,
} from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'

function character(id = 'hero'): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: 'scripted',
        faction: 'peaceful',
        spawnPosition: { x: 24, y: 24 },
    })
}

function brushwood(economy: CityEconomyService, now = 0): MarketRow {
    const row = economy
        .snapshot(CENTER_LOCATION_ID, now)
        ?.rows.find((entry) => entry.itemId === 'brushwood')
    if (row === undefined) {
        throw new Error('Expected brushwood market row')
    }
    return row
}

it('keeps finite brushwood stock, read-only snapshots and positive proceeds on a taxed sale', () => {
    const economy = new CityEconomyService(0)
    const row = brushwood(economy)
    expect(row).toMatchObject({
        stock: 6,
        target: 12,
        capacity: 24,
        basePrice: 1,
        consumptionPer10Minutes: 1,
        buyPrice: 3,
        sellPrice: 1,
    })
    expect(quoteMarketTradeBreakdown({ ...row, stock: 0 }, 'sell', 1)).toEqual({
        subtotal: 2,
        tax: 1,
        total: 1,
    })
    expect(brushwood(economy, 12_000_000).stock).toBe(6)
    economy.update(599_999)
    expect(brushwood(economy).stock).toBe(6)
    economy.update(600_000)
    expect(brushwood(economy, 600_000)).toMatchObject({
        stock: 5,
        consumedLast10Minutes: 1,
    })
})

it('transfers partial brushwood stacks and rejects overflow, stale quotes and full bags atomically', () => {
    const economy = new CityEconomyService(0)
    const actor = character()
    const wallet = createAdventureState()
    wallet.gold = 100
    actor.inventory.push(createItemInstance('brushwood', 9))
    const sale = {
        type: 'market_trade' as const,
        npcId: 'merchant',
        side: 'sell' as const,
        itemId: 'brushwood' as const,
        quantity: 4,
        expectedTotal: quoteMarketTrade(brushwood(economy), 'sell', 4) ?? 0,
        requestId: 'partial',
    }
    expect(economy.trade(actor, wallet, sale, 0).accepted).toBe(true)
    expect(actor.inventory).toHaveLength(1)
    expect(countInventoryItem(actor.inventory, 'brushwood')).toBe(5)
    expect(brushwood(economy)).toMatchObject({
        stock: 10,
        deliveredLast10Minutes: 4,
    })
    const buy = {
        ...sale,
        side: 'buy' as const,
        quantity: 2,
        expectedTotal: quoteMarketTrade(brushwood(economy), 'buy', 2) ?? 0,
    }
    expect(economy.trade(actor, wallet, buy, 0).accepted).toBe(true)
    expect(countInventoryItem(actor.inventory, 'brushwood')).toBe(7)
    expect(actor.inventory).toHaveLength(1)
    expect(
        economy.trade(actor, wallet, { ...sale, expectedTotal: 0 }, 0).accepted
    ).toBe(false)
    addInventoryItems(actor.inventory, [createItemInstance('brushwood', 16)])
    const fill = {
        ...sale,
        quantity: 16,
        expectedTotal: quoteMarketTrade(brushwood(economy), 'sell', 16) ?? 0,
    }
    expect(economy.trade(actor, wallet, fill, 0).accepted).toBe(true)
    expect(brushwood(economy).stock).toBe(24)
    const gold = wallet.gold
    expect(
        economy.trade(
            actor,
            wallet,
            { ...sale, quantity: 1, expectedTotal: 1 },
            0
        ).accepted
    ).toBe(false)
    expect(wallet.gold).toBe(gold)
    actor.inventory = Array.from({ length: 50 }, () =>
        createItemInstance('wood')
    )
    expect(
        economy.trade(
            actor,
            wallet,
            {
                ...buy,
                expectedTotal:
                    quoteMarketTrade(brushwood(economy), 'buy', 2) ?? 0,
            },
            0
        ).accepted
    ).toBe(false)
    expect(brushwood(economy).stock).toBe(24)
    expect(wallet.gold).toBe(gold)
})

it('does not accumulate heating debt while empty or consume new deliveries on snapshot reads', () => {
    const economy = new CityEconomyService(0)
    economy.update(9_000_000)
    expect(brushwood(economy, 9_000_000)).toMatchObject({
        stock: 0,
        consumedLast10Minutes: 0,
    })
    const actor = character()
    const wallet = createAdventureState()
    actor.inventory.push(createItemInstance('brushwood', 3))
    expect(
        economy.trade(
            actor,
            wallet,
            {
                type: 'market_trade',
                npcId: 'merchant',
                side: 'sell',
                itemId: 'brushwood',
                quantity: 3,
                expectedTotal:
                    quoteMarketTrade(brushwood(economy), 'sell', 3) ?? 0,
                requestId: 'after-empty',
            },
            9_000_001
        ).accepted
    ).toBe(true)
    economy.update(9_000_002)
    expect(brushwood(economy, 9_000_002)).toMatchObject({
        stock: 3,
        deliveredLast10Minutes: 3,
        consumedLast10Minutes: 0,
    })
    expect(brushwood(economy, 9_600_000).stock).toBe(3)
    economy.update(9_600_000)
    expect(brushwood(economy, 9_600_000).stock).toBe(2)
})

it('funds city quests once per brushwood sale and rejects a competing last-unit sale', () => {
    const service = new AdventureService({
        now: () => 0,
        resourceNodes: [],
        worldObjects: [],
    })
    const actor = character(),
        merchant = character('npc_merchant_1'),
        other = character('other')
    const navigation = new NavigationService({
        id: 'market',
        width: 5,
        height: 5,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(25).fill(false),
    })
    actor.inventory.push(
        createItemInstance('brushwood', 9),
        createItemInstance('brushwood', 8)
    )
    const cityQuestGold = () =>
        service.questFunding.availableGold(CENTER_LOCATION_ID)
    const openingQuestGold = cityQuestGold()
    const fill = {
        type: 'market_trade' as const,
        npcId: merchant.id,
        side: 'sell' as const,
        itemId: 'brushwood' as const,
        quantity: 17,
        expectedTotal:
            quoteMarketTrade(brushwood(service.economy), 'sell', 17) ?? 0,
        requestId: 'fill',
    }
    expect(
        service.handleResult(actor, fill, [merchant], navigation, 0).accepted
    ).toBe(true)
    const gold = service.snapshot(actor.id).gold
    expect(gold).toBe(27)
    expect(cityQuestGold()).toBe(openingQuestGold + 7)
    expect(
        service.handleResult(actor, fill, [merchant], navigation, 0).accepted
    ).toBe(true)
    expect(brushwood(service.economy).stock).toBe(23)
    expect(service.snapshot(actor.id).gold).toBe(gold)
    expect(cityQuestGold()).toBe(openingQuestGold + 7)
    expect(
        service.handleResult(
            actor,
            { ...fill, quantity: 1, expectedTotal: 1, requestId: 'no-goods' },
            [merchant],
            navigation,
            0
        ).accepted
    ).toBe(false)
    expect(cityQuestGold()).toBe(openingQuestGold + 7)
    actor.inventory.push(createItemInstance('brushwood'))
    other.inventory.push(createItemInstance('brushwood'))
    const last = { ...fill, quantity: 1, expectedTotal: 1, requestId: 'last' }
    expect(
        service.handleResult(actor, last, [merchant], navigation, 0).accepted
    ).toBe(true)
    expect(service.snapshot(actor.id).gold).toBe(gold + 1)
    expect(cityQuestGold()).toBe(openingQuestGold + 8)
    expect(
        service.handleResult(
            other,
            { ...last, requestId: 'competing' },
            [merchant],
            navigation,
            0
        ).accepted
    ).toBe(false)
    expect(countInventoryItem(other.inventory, 'brushwood')).toBe(1)
    expect(brushwood(service.economy).stock).toBe(24)
    expect(cityQuestGold()).toBe(openingQuestGold + 8)
})
