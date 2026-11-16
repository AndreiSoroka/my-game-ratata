import {
    type AdventureClientMessage,
    CENTER_LOCATION_ID,
    type CraftOrderSnapshot,
    type ItemId,
    quoteMarketTrade,
} from '@my-game-ratata/contracts'
import { expect } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'

export function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) {
        throw new Error('Missing fixture value')
    }
    return value
}
export function orderFixture(itemId: ItemId = 'axe', npcId = 'npc_smith_1') {
    let now = 0
    let nextRequest = 1
    const service = new AdventureService({
        now: () => now,
        resourceNodes: [],
        worldObjects: [],
    })
    const navigation = new NavigationService({
        id: 'orders',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(400).fill(false),
    })
    const make = (id: string, scripted = false) =>
        new GameCharacter({
            id,
            nickname: id,
            archetype: 'human',
            controllerKind: scripted ? 'scripted' : 'network_player',
            faction: 'peaceful',
            spawnPosition: { x: 24, y: 24 },
        })
    const buyer = make('buyer'),
        other = make('other'),
        artisan = make(npcId, true),
        merchant = make('npc_merchant_1', true)
    const characters = [buyer, other, artisan, merchant]
    service.grantGoldOnce(buyer.id, 1000, 'initial')
    service.grantGoldOnce(other.id, 1000, 'initial')
    const act = (actor: GameCharacter, message: AdventureClientMessage) =>
        service.handleResult(actor, message, characters, navigation, now)
    const requestId = () => `test-${String(nextRequest++)}`
    const marketRow = (id: ItemId) =>
        required(
            service.economy
                .snapshot(CENTER_LOCATION_ID, now)
                ?.rows.find((row) => row.itemId === id)
        )
    const trade = (
        actor: GameCharacter,
        id: ItemId,
        side: 'buy' | 'sell',
        quantity: number
    ) =>
        act(actor, {
            type: 'market_trade',
            npcId: merchant.id,
            itemId: marketRow(id).itemId,
            side,
            quantity,
            expectedTotal: required(
                quoteMarketTrade(marketRow(id), side, quantity)
            ),
            requestId: requestId(),
        })
    expect(trade(buyer, itemId, 'buy', marketRow(itemId).stock).accepted).toBe(
        true
    )
    const place = (actor = buyer, id = itemId) =>
        act(actor, {
            type: 'craft_order_place',
            npcId: artisan.id,
            itemId: id,
            expectedTotal: required(
                service.economy.customerOrders
                    .workshopSnapshot(actor.id, artisan.id, now)
                    ?.offers.find((offer) => offer.itemId === id)
            ).fullPrice,
            requestId: requestId(),
        })
    const order = (actor = buyer): CraftOrderSnapshot =>
        required(service.economy.customerOrders.snapshot(actor.id).at(-1))
    const craft = () => {
        const recipe = required(service.economy.startNextWork(artisan, now))
        expect(act(artisan, { type: 'craft', recipeId: recipe }).accepted).toBe(
            true
        )
        expect(service.economy.completeWorkOrder(artisan, now)).toBe(true)
        return recipe
    }
    const tick = (at: number) => {
        now = at
        service.update(now, () => navigation, characters)
    }
    return {
        service,
        navigation,
        buyer,
        other,
        artisan,
        characters,
        act,
        requestId,
        marketRow,
        trade,
        place,
        order,
        craft,
        tick,
        now: () => now,
    }
}
