import {
    CENTER_LOCATION_ID,
    type MarketItemId,
    quoteMarketTrade,
    quoteMarketTradeBreakdown,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { adventureRecipes } from '../src/game/adventureResources'
import { createAdventureState } from '../src/game/adventureState'
import { repairSnapshot } from '../src/game/adventureTrading'
import { GameCharacter } from '../src/game/character'
import { CityEconomyService } from '../src/game/cityEconomy'
import {
    addInventoryItems,
    countInventoryItem,
    createItemInstance,
    equipDirect,
} from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'
import { QuestFunding } from '../src/game/questFunding'

function character(id = 'hero', scripted = false): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: scripted ? 'scripted' : 'network_player',
        faction: 'peaceful',
        spawnPosition: { x: 24, y: 24 },
    })
}
function row(
    economy: CityEconomyService,
    itemId: MarketItemId,
    now = 0,
    city = CENTER_LOCATION_ID
) {
    return required(
        required(economy.snapshot(city, now)).rows.find(
            (entry) => entry.itemId === itemId
        )
    )
}
function grid(): NavigationService {
    return new NavigationService({
        id: 'test',
        solidLayerNames: [],
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(400).fill(false),
    })
}

it('prices every stock boundary with a spread, including batch splits and reserve edges', () => {
    const template = row(new CityEconomyService(0), 'wood')
    for (let stock = 0; stock <= template.capacity; stock += 1) {
        const source = { ...template, stock }
        for (let amount = 1; amount <= Math.min(stock, 8); amount += 1) {
            const buy = required(
                quoteMarketTradeBreakdown(source, 'buy', amount)
            )
            const sell = required(
                quoteMarketTradeBreakdown(
                    { ...source, stock: stock - amount },
                    'sell',
                    amount
                )
            )
            expect(buy.total).toBeGreaterThan(sell.total)
            expect(buy.total - buy.tax).toBeGreaterThanOrEqual(sell.subtotal)
            const split = Array.from({ length: amount }, (_, index) =>
                required(
                    quoteMarketTrade(
                        { ...source, stock: stock - index },
                        'buy',
                        1
                    )
                )
            ).reduce((sum, value) => sum + value, 0)
            expect(split).toBe(buy.total)
        }
        if (stock < source.capacity) {
            const proceeds = required(quoteMarketTrade(source, 'sell', 1))
            expect(
                required(
                    quoteMarketTrade({ ...source, stock: stock + 1 }, 'buy', 1)
                )
            ).toBeGreaterThan(proceeds)
        }
    }
    expect(quoteMarketTrade({ ...template, stock: 0 }, 'buy', 1)).toBeNull()
    expect(
        quoteMarketTrade({ ...template, stock: template.capacity }, 'sell', 1)
    ).toBeNull()
})

it('consumes evenly on server deadlines, catches up without debt, and snapshots do not tick', () => {
    const economy = new CityEconomyService(0)
    expect(row(economy, 'wood', 10_000_000).stock).toBe(6)
    economy.update(299_999)
    expect(row(economy, 'wood').stock).toBe(6)
    economy.update(300_000)
    expect(row(economy, 'wood').stock).toBe(5)
    expect(row(economy, 'food').stock).toBe(10)
    economy.update(600_000)
    expect(row(economy, 'wood').stock).toBe(4)
    economy.update(6_000_000)
    expect(row(economy, 'wood').stock).toBe(0)
    expect(row(economy, 'wood', 6_000_000).consumedLast10Minutes).toBe(0)
    const actor = character()
    const wallet = createAdventureState()
    actor.inventory.push(createItemInstance('wood'))
    const price = required(quoteMarketTrade(row(economy, 'wood'), 'sell', 1))
    expect(
        economy.trade(
            actor,
            wallet,
            {
                type: 'market_trade',
                side: 'sell',
                itemId: 'wood',
                npcId: 'merchant',
                quantity: 1,
                expectedTotal: price,
                requestId: 'new',
            },
            6_000_001
        ).accepted
    ).toBe(true)
    economy.update(6_000_002)
    expect(row(economy, 'wood').stock).toBe(1)
})

it('transfers actual instances atomically and keeps cities independent', () => {
    const cities = [CENTER_LOCATION_ID, 'second-city']
    const funding = new QuestFunding(cities)
    const economy = new CityEconomyService(0, cities, funding)
    const actor = character()
    const wallet = createAdventureState()
    const wood = createItemInstance('wood')
    actor.inventory.push(wood)
    const initial = row(economy, 'wood')
    const openingQuestGold = funding.availableGold(CENTER_LOCATION_ID)
    const otherQuestGold = funding.availableGold('second-city')
    const sale = {
        type: 'market_trade' as const,
        npcId: 'merchant',
        side: 'sell' as const,
        itemId: 'wood' as const,
        quantity: 1,
        expectedTotal: required(initial.sellPrice),
        requestId: 'sell',
    }
    expect(economy.trade(actor, wallet, sale, 0).accepted).toBe(true)
    expect(actor.inventory).toHaveLength(0)
    expect(row(economy, 'wood').stock).toBe(initial.stock + 1)
    expect(row(economy, 'wood', 0, 'second-city').stock).toBe(initial.stock)
    expect(funding.availableGold(CENTER_LOCATION_ID)).toBe(openingQuestGold + 1)
    expect(funding.availableGold('second-city')).toBe(otherQuestGold)
    wallet.gold = 100
    actor.inventory = Array.from({ length: 50 }, () =>
        createItemInstance('food')
    )
    const before = row(economy, 'wood').stock
    const purchase = {
        ...sale,
        side: 'buy' as const,
        expectedTotal: required(row(economy, 'wood').buyPrice),
    }
    expect(economy.trade(actor, wallet, purchase, 0).accepted).toBe(false)
    expect(wallet.gold).toBe(100)
    expect(row(economy, 'wood').stock).toBe(before)
    actor.inventory = []
    expect(
        economy.trade(actor, wallet, { ...purchase, expectedTotal: 0 }, 0)
            .accepted
    ).toBe(false)
    expect(row(economy, 'wood').stock).toBe(before)
    expect(funding.availableGold(CENTER_LOCATION_ID)).toBe(openingQuestGold + 1)
})

it('rejects the second buyer of a finite last unit and the second seller at reserve cap', () => {
    const economy = new CityEconomyService(0)
    const actor = character(),
        other = character('other')
    const wallet = createAdventureState(),
        otherWallet = createAdventureState()
    wallet.gold = otherWallet.gold = 1000
    for (let index = 0; index < 3; index += 1) {
        expect(
            economy.trade(
                actor,
                wallet,
                {
                    type: 'market_trade',
                    npcId: 'merchant',
                    side: 'buy',
                    itemId: 'axe',
                    quantity: 1,
                    expectedTotal: 25,
                    requestId: String(index),
                },
                0
            ).accepted
        ).toBe(true)
    }
    expect(
        economy.trade(
            other,
            otherWallet,
            {
                type: 'market_trade',
                npcId: 'merchant',
                side: 'buy',
                itemId: 'axe',
                quantity: 1,
                expectedTotal: 25,
                requestId: 'last',
            },
            0
        ).accepted
    ).toBe(false)
    addInventoryItems(actor.inventory, [createItemInstance('wood', 18)])
    const fill = required(quoteMarketTrade(row(economy, 'wood'), 'sell', 18))
    expect(
        economy.trade(
            actor,
            wallet,
            {
                type: 'market_trade',
                npcId: 'merchant',
                side: 'sell',
                itemId: 'wood',
                quantity: 18,
                expectedTotal: fill,
                requestId: 'fill',
            },
            0
        ).accepted
    ).toBe(true)
    other.inventory.push(createItemInstance('wood'))
    expect(
        economy.trade(
            other,
            otherWallet,
            {
                type: 'market_trade',
                npcId: 'merchant',
                side: 'sell',
                itemId: 'wood',
                quantity: 1,
                expectedTotal: 1,
                requestId: 'overflow',
            },
            0
        ).accepted
    ).toBe(false)
    expect(countInventoryItem(other.inventory, 'wood')).toBe(1)
})

it('funds city quests once per purchase and rejects stale price, crime, distance and wall', () => {
    const service = new AdventureService({
        now: () => 0,
        resourceNodes: [],
        worldObjects: [],
    })
    const actor = character(),
        merchant = character('npc_merchant_1', true),
        smith = character('npc_smith_1', true)
    const navigation = grid()
    service.grantGoldOnce(actor.id, 100, 'seed')
    const cityQuestGold = () =>
        service.questFunding.availableGold(CENTER_LOCATION_ID)
    const openingQuestGold = cityQuestGold()
    const market = required(service.economy.snapshot(CENTER_LOCATION_ID, 0))
    const offer = required(market.rows.find((entry) => entry.itemId === 'axe'))
    const buy = {
        type: 'market_trade' as const,
        npcId: merchant.id,
        side: 'buy' as const,
        itemId: 'axe' as const,
        quantity: 1,
        expectedTotal: required(offer.buyPrice),
        requestId: 'buy',
    }
    expect(buy.expectedTotal).toBe(25)
    expect(
        service.handleResult(
            actor,
            { ...buy, expectedTotal: 24, requestId: 'stale' },
            [merchant],
            navigation,
            0
        ).accepted
    ).toBe(false)
    expect(cityQuestGold()).toBe(openingQuestGold)
    expect(service.snapshot(actor.id).gold).toBe(100)
    expect(actor.inventory).toHaveLength(0)
    expect(
        service.handleResult(actor, buy, [merchant], navigation, 0).accepted
    ).toBe(true)
    const snapshot = service.snapshot(actor.id, actor.locationId, actor)
    expect(snapshot.gold).toBe(75)
    expect(cityQuestGold()).toBe(openingQuestGold + 5)
    expect(
        service.handleResult(actor, buy, [merchant], navigation, 0).accepted
    ).toBe(true)
    expect(actor.inventory).toHaveLength(1)
    expect(service.snapshot(actor.id, actor.locationId, actor)).toMatchObject({
        gold: snapshot.gold,
        noticeId: snapshot.noticeId,
    })
    expect(cityQuestGold()).toBe(openingQuestGold + 5)
    const axe = required(actor.inventory[0])
    axe.durability = 0
    const quote = repairSnapshot(actor)
    const repair = {
        type: 'repair_items' as const,
        npcId: smith.id,
        instanceIds: [axe.instanceId],
        expectedTotal: quote.total,
        requestId: 'repair',
    }
    expect(
        service.handleResult(actor, repair, [smith], navigation, 0).accepted
    ).toBe(true)
    const gold = service.snapshot(actor.id).gold
    expect(
        service.handleResult(actor, repair, [smith], navigation, 0).accepted
    ).toBe(true)
    expect(service.snapshot(actor.id).gold).toBe(gold)
    expect(axe.durability).toBeGreaterThan(0)
    actor.tags.add('city.blacklisted')
    expect(
        service.handleResult(
            actor,
            { ...buy, requestId: 'banned' },
            [merchant],
            navigation,
            0
        ).accepted
    ).toBe(false)
    actor.tags.delete('city.blacklisted')
    merchant.position = { x: 56, y: 24 }
    navigation.grid.solid[1 * 20 + 2] = true
    expect(
        service.handleResult(
            actor,
            { ...buy, requestId: 'wall' },
            [merchant],
            navigation,
            0
        ).accepted
    ).toBe(false)
    merchant.position.x = 200
    expect(
        service.handleResult(
            actor,
            { ...buy, requestId: 'far' },
            [merchant],
            navigation,
            0
        ).accepted
    ).toBe(false)
    expect(cityQuestGold()).toBe(openingQuestGold + 5)
})

it('repairs equipment and inventory together atomically; no coins or condition change on bad quote', () => {
    const service = new AdventureService({
        now: () => 0,
        resourceNodes: [],
        worldObjects: [],
    })
    const actor = character(),
        smith = character('npc_smith_1', true)
    equipDirect(actor.equipment, createItemInstance('boots'))
    required(actor.equipment.boots).durability = 0
    actor.inventory.push(createItemInstance('simple_sword'))
    required(actor.inventory[0]).durability = 0
    service.grantGoldOnce(actor.id, 100, 'seed')
    const quote = repairSnapshot(actor)
    const message = {
        type: 'repair_items' as const,
        npcId: smith.id,
        instanceIds: quote.items.map((item) => item.instanceId),
        expectedTotal: quote.total - 1,
        requestId: 'bad',
    }
    expect(
        service.handleResult(actor, message, [smith], grid(), 0).accepted
    ).toBe(false)
    expect(required(actor.equipment.boots).durability).toBe(0)
    expect(required(actor.inventory[0]).durability).toBe(0)
    expect(service.snapshot(actor.id).gold).toBe(100)
    expect(
        service.handleResult(
            actor,
            { ...message, expectedTotal: quote.total, requestId: 'good' },
            [smith],
            grid(),
            0
        ).accepted
    ).toBe(true)
    expect(repairSnapshot(actor).total).toBe(0)
})

it('artisans withdraw finite inputs, use shared crafting and preserve a blocked output', () => {
    const service = new AdventureService({
        now: () => 0,
        resourceNodes: [],
        worldObjects: [],
    })
    const smith = character('npc_smith_1', true),
        buyer = character()
    service.grantGoldOnce(buyer.id, 100, 'seed')
    service.handleResult(
        buyer,
        {
            type: 'market_trade',
            npcId: smith.id,
            side: 'buy',
            itemId: 'axe',
            quantity: 1,
            expectedTotal: 25,
            requestId: 'buy',
        },
        [smith],
        grid(),
        0
    )
    const recipe = required(
        adventureRecipes.find((entry) => entry.id === 'axe')
    )
    const before = row(service.economy, 'scrap').stock
    expect(service.economy.startWorkOrder(buyer, recipe, 0)).toBe(false)
    expect(service.economy.startWorkOrder(smith, recipe, 0)).toBe(true)
    expect(service.economy.startWorkOrder(smith, recipe, 0)).toBe(false)
    expect(row(service.economy, 'scrap').stock).toBe(before - 3)
    expect(
        service.handleResult(
            smith,
            { type: 'craft', recipeId: 'axe' },
            [],
            grid(),
            0
        ).accepted
    ).toBe(true)
    expect(service.economy.completeWorkOrder(smith, 0)).toBe(true)
    expect(service.economy.completeWorkOrder(smith, 0)).toBe(false)
    expect(countInventoryItem(smith.inventory, 'axe')).toBe(0)
    expect(row(service.economy, 'axe').stock).toBe(3)
})

function required<T>(value: T | null | undefined): T {
    if (value === undefined || value === null) {
        throw new Error('Expected defined test value')
    }
    return value
}
