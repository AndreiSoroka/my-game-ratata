import {
    CENTER_LOCATION_ID,
    CITY_HERB_COLLECTOR_IDS,
    type CityBellState,
    HERBALIST_MERCHANT_ID,
    type MarketItemId,
    type MarketSide,
    PUBLIC_SPEECH_RADIUS,
    quoteMarketTrade,
} from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import type { GameCharacter } from '../src/game/character'
import { takeQuantity } from '../src/game/cityEconomyStock'
import { CONVERSATION_REACH } from '../src/game/conversationSessions'
import {
    addInventoryItems,
    countInventoryItem,
    createItemInstance,
} from '../src/game/inventory'
import { RewardReservations } from '../src/game/rewardReservations'
import { GameRoom } from '../src/game/room'
import { canConverseWithNpc } from '../src/game/socialSpeech'
import { WorldMaps } from '../src/game/worldMaps'
import { required } from './cityBellAiFixture'
import { joinScenarioRoom, waitForScenario } from './scenarioRoomHelpers'

let room: GameRoom | undefined
afterEach(() => {
    room?.stop()
    room = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function setup(initialBellState: CityBellState, merchantId: string) {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const maps = new WorldMaps({
        seed: 'city-herb-trading',
        epoch: 'market-test',
        cityStyle: 'grid',
    })
    const game = new GameRoom(maps.navigation(CENTER_LOCATION_ID), {
        initialBellState,
        worldMaps: maps,
    })
    room = game
    const player = joinScenarioRoom(game, 'Лада')
    const merchant = required(game.getCharacter(merchantId))
    const adventure = game.adventureForWorkers()
    const wallet = adventure.walletFor(player.actor.id)
    game.start()
    return {
        game,
        player,
        merchant,
        adventure,
        wallet,
        view: () =>
            game.snapshot(
                game.gameplayNow(),
                CENTER_LOCATION_ID,
                player.actor.id
            ).adventure,
        stock: (itemId: MarketItemId = 'herbs') =>
            required(
                adventure.economy
                    .snapshot(CENTER_LOCATION_ID, game.gameplayNow())
                    ?.rows.find((row) => row.itemId === itemId)
            ),
    }
}

type Fixture = ReturnType<typeof setup>

function placeShopper(
    f: Fixture,
    minDistance: number,
    maxDistance: number
): void {
    const { game, player, merchant } = f
    const nav = game.navigationFor(merchant)
    const origin = nav.worldToTile(merchant.position)
    // Fixture start only. Navigation after the request belongs to the simulation.
    for (let y = -4; y <= 4; y += 1) {
        for (let x = -4; x <= 4; x += 1) {
            const tile = { x: origin.x + x, y: origin.y + y }
            const point = nav.tileToWorld(tile)
            const range = Math.hypot(
                point.x - merchant.position.x,
                point.y - merchant.position.y
            )
            if (
                range > minDistance &&
                range <= maxDistance &&
                !nav.isSolidTile(tile)
            ) {
                player.actor.position = point
                if (
                    nav.hasLineOfSight(point, merchant.position) &&
                    canConverseWithNpc(
                        merchant,
                        player.actor,
                        nav,
                        game.gameplayNow(),
                        maxDistance
                    )
                ) {
                    return
                }
            }
        }
    }
    throw new Error('No suitable point for the shop fixture')
}

function trade(
    f: Fixture,
    side: MarketSide,
    itemId: MarketItemId,
    requestId: string
) {
    const command = {
        type: 'market_trade' as const,
        npcId: f.merchant.id,
        side,
        itemId,
        quantity: 1,
        expectedTotal: required(quoteMarketTrade(f.stock(itemId), side, 1)),
        requestId,
    }
    f.player.send(command)
    return command
}

it.each(CITY_HERB_COLLECTOR_IDS)(
    'opens the sales view and pays once for real herbs through %s',
    (id) => {
        const f = setup('active', id)
        placeShopper(f, 16, CONVERSATION_REACH)
        const herb = createItemInstance('herbs', 2)
        f.player.actor.inventory.push(herb, createItemInstance('wood'))
        const reservations = new RewardReservations()
        expect(
            reservations.reserve(
                'promised-herb',
                { inventory: f.player.actor.inventory, wallet: f.wallet },
                0,
                [{ instanceId: herb.instanceId, quantity: 1 }]
            )
        ).toBe(true)
        f.player.send({ type: 'interact', targetId: id, service: 'sell' })
        expect(f.view()?.dialogue).toMatchObject({
            npcId: id,
            initialView: 'shop',
            initialMarketSide: 'sell',
        })
        expect(f.view()?.marketInventory?.herbs).toEqual({
            owned: 2,
            sellable: 1,
        })
        expect(
            f.game.snapshot(f.game.gameplayNow(), CENTER_LOCATION_ID, undefined)
                .adventure?.marketInventory
        ).toBeUndefined()
        if (id === HERBALIST_MERCHANT_ID) {
            expect(f.view()?.dialogue?.marketSides).toEqual(['sell'])
            expect(f.view()?.market?.rows.map((row) => row.itemId)).toEqual([
                'herbs',
            ])
            trade(f, 'sell', 'wood', 'not-herbs')
            trade(f, 'buy', 'herbs', 'not-for-sale')
            expect(countInventoryItem(f.player.actor.inventory, 'wood')).toBe(1)
        }
        const before = f.stock().stock
        const gold = f.wallet.gold
        const sale = trade(f, 'sell', 'herbs', 'herb-sale')
        expect(f.view()?.marketInventory?.herbs).toEqual({
            owned: 1,
            sellable: 0,
        })
        expect(f.wallet.gold).toBe(gold + sale.expectedTotal)
        expect(f.stock().stock).toBe(before + 1)
        f.player.send(sale)
        trade(f, 'sell', 'herbs', 'cannot-sell-promised-herb')
        expect(f.wallet.gold).toBe(gold + sale.expectedTotal)
        expect(f.stock().stock).toBe(before + 1)
    }
)

it.each(CITY_HERB_COLLECTOR_IDS)(
    'approaches the addressed shopper and opens Sell only on arrival through %s',
    (id) => {
        const f = setup('active', id)
        placeShopper(f, CONVERSATION_REACH, PUBLIC_SPEECH_RADIUS)
        const position = { ...f.merchant.position }
        f.player.send({ type: 'chat', text: 'Хочу продать лечебные травы' })
        expect(f.game.social.merchantVisits.has(id)).toBe(false)
        f.player.send({
            type: 'chat',
            targetId: id,
            text: 'Хочу продать лечебные травы',
        })
        expect(f.game.social.merchantVisits.has(id)).toBe(true)
        expect(f.view()?.dialogue).toBeNull()
        waitForScenario(
            () => f.view()?.dialogue?.initialMarketSide === 'sell',
            6_000
        )
        expect(f.merchant.position).not.toEqual(position)
        expect(f.view()?.dialogue).toMatchObject({
            npcId: id,
            initialView: 'shop',
        })
        expect(f.game.social.merchantVisits.has(id)).toBe(false)
    }
)

it('only uses an affirmative reply in the current merchant conversation', () => {
    const f = setup('active', HERBALIST_MERCHANT_ID)
    placeShopper(f, 16, CONVERSATION_REACH)
    const whisper = (text: string) =>
        f.player.send({ type: 'whisper', targetId: f.merchant.id, text })
    whisper('давай')
    expect(f.view()?.dialogue).toBeNull()
    whisper('я принёс травы')
    expect(
        f.game.social.whispers
            .snapshot(f.player.actor, f.game.gameplayNow())
            ?.messages.at(-1)?.text
    ).toContain('Хочешь открыть продажу')
    whisper('давай')
    expect(f.view()?.dialogue?.initialMarketSide).toBe('sell')
})

it.each(CITY_HERB_COLLECTOR_IDS)(
    'settles the voluntary exchange with %s before stocking the city and keeps the overflow',
    (id) => {
        const f = setup('silent', id)
        placeShopper(f, 16, CONVERSATION_REACH)
        const cityBag = required(
            f.adventure.economy.questInventory(CENTER_LOCATION_ID)
        )
        const spare = f.stock().capacity - f.stock().stock - 1
        expect(
            addInventoryItems(
                f.merchant.inventory,
                [createItemInstance('herbs', spare)],
                Infinity
            )
        ).toBe(true)
        f.adventure.economy.depositHerbs(f.merchant, f.game.gameplayNow())
        expect(f.stock().stock).toBe(f.stock().capacity - 1)
        const herb = createItemInstance('herbs', 3)
        f.player.actor.inventory.push(herb)
        const gold = f.wallet.gold
        f.player.send({
            type: 'whisper',
            targetId: id,
            text: 'хочу продать травы',
        })
        expect(f.view()?.dialogue).toBeNull()
        expect(
            f.game.social.whispers
                .snapshot(f.player.actor, f.game.gameplayNow())
                ?.messages.at(-1)?.text
        ).toContain('Колокол')
        f.player.send({ type: 'exchange_invite', targetId: id })
        const exchange = () =>
            required(f.game.social.exchanges.snapshot(f.player.actor.id))
        const exchangeId = exchange().id
        waitForScenario(() => exchange().status === 'active', 500)
        f.player.send({
            type: 'exchange_offer',
            exchangeId,
            revision: exchange().revision,
            items: [{ instanceId: herb.instanceId, quantity: 3 }],
            gold: 0,
        })
        waitForScenario(() => exchange().other.accepted, 500)
        expect(countInventoryItem(f.player.actor.inventory, 'herbs')).toBe(3)
        const confirm = {
            type: 'exchange_accept' as const,
            exchangeId,
            revision: exchange().revision,
        }
        f.player.send(confirm)
        expect(
            exchange(),
            JSON.stringify(
                f.player.sent
                    .filter((message) => message.type === 'event')
                    .slice(-5)
            )
        ).toMatchObject({ status: 'completed' })
        expect(f.stock().stock).toBe(f.stock().capacity)
        expect(herbs(f.merchant)).toBe(2)
        expect(herbs(f.player.actor)).toBe(0)
        f.player.send(confirm)
        takeQuantity(cityBag, 'herbs', 1)
        waitForScenario(() => f.stock().stock === f.stock().capacity, 500)
        expect(herbs(f.merchant)).toBe(1)
        expect(f.wallet.gold).toBe(gold)
    }
)

function herbs(actor: GameCharacter): number {
    return countInventoryItem(actor.inventory, 'herbs')
}
