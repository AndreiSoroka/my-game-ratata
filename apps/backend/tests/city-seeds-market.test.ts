import { CENTER_LOCATION_ID, quoteMarketTrade } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { createAdventureState } from '../src/game/adventureState'
import { GameCharacter } from '../src/game/character'
import { CityEconomyService } from '../src/game/cityEconomy'
import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'

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
function seedRow(economy: CityEconomyService, now = 0) {
    return required(
        economy
            .snapshot(CENTER_LOCATION_ID, now)
            ?.rows.find((entry) => entry.itemId === 'wheat_seed')
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
function required<T>(value: T | null | undefined): T {
    if (value === undefined || value === null) {
        throw new Error('Missing test value')
    }
    return value
}

it('sells six finite wheat seeds through the ordinary merchant and never refills on reads or time', () => {
    const service = new AdventureService({ now: () => 0 })
    const actor = character()
    const merchant = character('npc_merchant_1', true)
    const navigation = grid()
    service.grantGoldOnce(actor.id, 100, 'seed-test')
    const initial = seedRow(service.economy)
    expect(initial).toMatchObject({
        stock: 6,
        target: 12,
        basePrice: 1,
        consumptionPer10Minutes: 0,
    })
    const price = required(quoteMarketTrade(initial, 'buy', 6))
    const command = {
        type: 'market_trade' as const,
        npcId: merchant.id,
        side: 'buy' as const,
        itemId: 'wheat_seed' as const,
        quantity: 6,
        expectedTotal: price,
        requestId: 'all-seeds',
    }
    expect(
        service.handleResult(actor, command, [merchant], navigation, 0).accepted
    ).toBe(true)
    expect(countInventoryItem(actor.inventory, 'wheat_seed')).toBe(6)
    expect(service.snapshot(actor.id).gold).toBe(100 - price)
    expect(
        service.handleResult(actor, command, [merchant], navigation, 0).events
    ).toEqual([])
    expect(countInventoryItem(actor.inventory, 'wheat_seed')).toBe(6)
    expect(
        service.handleResult(
            actor,
            { ...command, quantity: 1, requestId: 'empty-stock' },
            [merchant],
            navigation,
            0
        ).accepted
    ).toBe(false)
    service.economy.update(6_000_000)
    expect(seedRow(service.economy, 6_000_000).stock).toBe(0)
})

it('checks the whole seed purchase fits before taking gold or changing a partial seed stack', () => {
    const economy = new CityEconomyService(0)
    const actor = character()
    const wallet = createAdventureState()
    wallet.gold = 100
    actor.inventory = [
        createItemInstance('wheat_seed', 8),
        ...Array.from({ length: 49 }, () => createItemInstance('food')),
    ]
    const command = {
        type: 'market_trade' as const,
        npcId: 'npc_merchant_1',
        side: 'buy' as const,
        itemId: 'wheat_seed' as const,
        quantity: 2,
        expectedTotal: required(quoteMarketTrade(seedRow(economy), 'buy', 2)),
        requestId: 'overflow-seeds',
    }
    const before = structuredClone(actor.inventory)
    expect(economy.trade(actor, wallet, command, 0).accepted).toBe(false)
    expect(actor.inventory).toEqual(before)
    expect(wallet.gold).toBe(100)
    expect(seedRow(economy).stock).toBe(6)
    const price = required(seedRow(economy).buyPrice)
    expect(
        economy.trade(
            actor,
            wallet,
            { ...command, quantity: 1, expectedTotal: price },
            0
        ).accepted
    ).toBe(true)
    expect(actor.inventory).toHaveLength(50)
    expect(countInventoryItem(actor.inventory, 'wheat_seed')).toBe(9)
    expect(wallet.gold).toBe(100 - price)
    expect(seedRow(economy).stock).toBe(5)
})
