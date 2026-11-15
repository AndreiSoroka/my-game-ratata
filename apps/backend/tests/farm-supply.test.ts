import {
    CENTER_LOCATION_ID,
    FARM_PLOTS,
    FARM_WORK_CYCLE_MS,
    INVENTORY_CAPACITY,
    quoteMarketTrade,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { retireCharacter } from '../src/game/characterLife'
import { isAdventureCommand } from '../src/game/extraCommands'
import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { parseClientMessage } from '../src/game/messages'
import { NavigationService } from '../src/game/navigation'
import { required } from './containerTestHelpers'

function fixture(controllerKind: GameCharacter['controllerKind'] = 'scripted') {
    let now = 1_000
    const service = new AdventureService({
        now: () => now,
        resourceNodes: [],
        worldObjects: [],
        farmRandom: () => 0,
    })
    const navigation = new NavigationService({
        id: CENTER_LOCATION_ID,
        width: 96,
        height: 80,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(96 * 80).fill(false),
    })
    const actor = new GameCharacter({
        id: 'city-farmer',
        nickname: 'farmer',
        archetype: 'human',
        controllerKind,
        faction: 'peaceful',
        locationId: CENTER_LOCATION_ID,
        spawnPosition: { x: 24, y: 24 },
    })
    actor.tags.add('worker.farmer')
    actor.tags.add(`worker.city.${CENTER_LOCATION_ID}`)
    const merchant = new GameCharacter({
        id: 'npc_merchant_1',
        nickname: 'supplier',
        archetype: 'human',
        controllerKind: 'scripted',
        faction: 'peaceful',
        locationId: CENTER_LOCATION_ID,
        spawnPosition: { x: 24, y: 24 },
    })
    const plot = required(FARM_PLOTS[1])
    expect(service.farmSupply.beginWork(actor, now)).toBe(true)
    const supply = (
        requestId = 'supply-1',
        plotId = plot.id,
        npcId = merchant.id
    ) =>
        service.handleResult(
            actor,
            {
                type: 'farm_supply',
                npcId,
                plotId,
                requestId,
            },
            [merchant],
            navigation,
            now
        )
    const sow = () => {
        actor.locationId = plot.locationId
        actor.position = { ...plot.position }
        const result = service.handleResult(
            actor,
            { type: 'farm_action', plotId: plot.id, action: 'sow' },
            [],
            navigation,
            now
        )
        actor.locationId = CENTER_LOCATION_ID
        actor.position = { ...merchant.position }
        return result
    }
    return {
        actor,
        service,
        merchant,
        plot,
        navigation,
        supply,
        sow,
        now: () => now,
        advance: (ms: number) => {
            now += ms
        },
        row: () =>
            required(
                required(
                    service.economy.snapshot(CENTER_LOCATION_ID, now)
                ).rows.find((row) => row.itemId === 'wheat_seed')
            ),
    }
}

describe('municipal farming seed supply', () => {
    it.each(['scripted', 'network_player'] as const)(
        'exchanges a real grain for one seed for an assigned %s, without gold or retail stock changes',
        (controllerKind) => {
            const f = fixture(controllerKind)
            f.actor.inventory.push(createItemInstance('grain', 2))
            const stock = f.row().stock
            expect(f.supply().accepted).toBe(true)
            expect(countInventoryItem(f.actor.inventory, 'grain')).toBe(1)
            expect(countInventoryItem(f.actor.inventory, 'wheat_seed')).toBe(1)
            expect(f.row().stock).toBe(stock)
            expect(f.service.snapshot(f.actor.id).gold).toBe(0)
            const bag = structuredClone(f.actor.inventory)
            expect(f.supply()).toMatchObject({ accepted: true, events: [] })
            expect(f.actor.inventory).toEqual(bag)
            expect(
                f.supply('supply-1', required(FARM_PLOTS[2]).id).accepted
            ).toBe(false)
            expect(f.supply('new-request').accepted).toBe(false)
        }
    )

    it('subsidizes one actual seed with no grain even after players buy every retail seed', () => {
        const f = fixture()
        const buyer = new GameCharacter({
            id: 'buyer',
            nickname: 'buyer',
            archetype: 'human',
            controllerKind: 'network_player',
            faction: 'peaceful',
            spawnPosition: f.merchant.position,
        })
        f.service.grantGoldOnce(buyer.id, 100, 'test-budget')
        const row = f.row()
        expect(
            f.service.handleResult(
                buyer,
                {
                    type: 'market_trade',
                    npcId: f.merchant.id,
                    side: 'buy',
                    itemId: 'wheat_seed',
                    quantity: row.stock,
                    expectedTotal: required(
                        quoteMarketTrade(row, 'buy', row.stock)
                    ),
                    requestId: 'empty-stock',
                },
                [f.merchant],
                f.navigation,
                f.now()
            ).accepted
        ).toBe(true)
        expect(f.row().stock).toBe(0)
        expect(f.supply().accepted).toBe(true)
        expect(f.actor.inventory).toEqual([
            expect.objectContaining({ itemId: 'wheat_seed' }),
        ])
        expect(f.row().stock).toBe(0)
    })

    it('checks resulting bag capacity atomically and can reuse a consumed grain slot', () => {
        const f = fixture()
        f.actor.inventory.push(
            createItemInstance('grain', 2),
            ...Array.from({ length: INVENTORY_CAPACITY - 1 }, () =>
                createItemInstance('food')
            )
        )
        const before = structuredClone(f.actor.inventory)
        expect(f.supply().accepted).toBe(false)
        expect(f.actor.inventory).toEqual(before)
        f.actor.inventory[0] = createItemInstance('grain')
        expect(f.supply('fits-after-consumption').accepted).toBe(true)
        expect(f.actor.inventory).toHaveLength(INVENTORY_CAPACITY)
        expect(countInventoryItem(f.actor.inventory, 'grain')).toBe(0)
        expect(countInventoryItem(f.actor.inventory, 'wheat_seed')).toBe(1)
    })
})

describe('farm supply access', () => {
    it.each([
        'dead',
        'offline',
        'retired',
        'stunned',
        'remote',
        'cross-location',
        'unassigned',
        'wrong-city',
        'supplier-dead',
    ] as const)(
        'rejects %s supply without spending grain or work allowance',
        (invalid) => {
            const f = fixture()
            f.actor.inventory.push(createItemInstance('grain'))
            switch (invalid) {
                case 'dead':
                    f.actor.alive = false
                    break
                case 'offline':
                    f.actor.tags.add('offline')
                    break
                case 'retired':
                    f.actor.tags.add('state.retired')
                    break
                case 'stunned':
                    f.actor.stunUntil = f.now() + 100
                    break
                case 'remote':
                    f.actor.position.x += 500
                    break
                case 'cross-location':
                    f.actor.locationId = f.plot.locationId
                    break
                case 'unassigned':
                    f.actor.tags.delete('worker.farmer')
                    break
                case 'wrong-city':
                    f.actor.tags.delete(`worker.city.${CENTER_LOCATION_ID}`)
                    break
                case 'supplier-dead':
                    f.merchant.alive = false
                    break
            }
            const before = structuredClone(f.actor.inventory)
            expect(f.supply().accepted).toBe(false)
            expect(f.actor.inventory).toEqual(before)
        }
    )

    it('rejects walls, unknown or occupied plots and the wrong supplier', () => {
        const f = fixture()
        const sight = vi
            .spyOn(f.navigation, 'hasLineOfSight')
            .mockReturnValue(false)
        expect(f.supply().accepted).toBe(false)
        sight.mockRestore()
        expect(f.supply('unknown', 'invented').accepted).toBe(false)
        expect(f.supply('ripe', required(FARM_PLOTS[0]).id).accepted).toBe(
            false
        )
        expect(
            f.supply('provider', f.plot.id, 'npc_friendly_girl_1').accepted
        ).toBe(false)
        expect(f.supply('valid').accepted).toBe(true)
    })
})

describe('municipal farm work quota and identity', () => {
    it('keeps lost advances blocked until the original cycle boundary', () => {
        const f = fixture()
        expect(f.supply().accepted).toBe(true)
        f.actor.inventory = []
        f.service.farmSupply.reconcile(f.actor)
        expect(f.service.farmSupply.remaining(f.actor.id)).toBe(0)
        expect(f.supply('lost').accepted).toBe(false)
        f.advance(FARM_WORK_CYCLE_MS - 1)
        expect(f.service.farmSupply.beginWork(f.actor, f.now())).toBe(false)
        f.advance(1)
        expect(f.service.farmSupply.beginWork(f.actor, f.now())).toBe(true)
        expect(f.supply('renewed').accepted).toBe(true)
        expect(f.supply()).toMatchObject({ accepted: true, events: [] })
        expect(countInventoryItem(f.actor.inventory, 'wheat_seed')).toBe(1)
    })

    it('only successful sowing clears an advance, allows a different bare plot, and bounds each work cycle to two advances', () => {
        const f = fixture()
        expect(f.service.farmSupply.canSupply('unassigned')).toBe(false)
        expect(f.service.farmSupply.canSupply(f.actor.id)).toBe(true)
        expect(f.supply().accepted).toBe(true)
        expect(f.service.farmSupply.canSupply(f.actor.id)).toBe(false)
        f.actor.energy = 0
        expect(f.sow().accepted).toBe(false)
        expect(countInventoryItem(f.actor.inventory, 'wheat_seed')).toBe(1)
        expect(f.supply('not-spent').accepted).toBe(false)
        f.actor.energy = 50
        // A different bare bed can use the same physical seed and release the advance.
        const alternate = required(FARM_PLOTS[2])
        f.actor.locationId = alternate.locationId
        f.actor.position = { ...alternate.position }
        expect(
            f.service.handleResult(
                f.actor,
                { type: 'farm_action', plotId: alternate.id, action: 'sow' },
                [],
                f.navigation,
                f.now()
            ).accepted
        ).toBe(true)
        f.actor.locationId = CENTER_LOCATION_ID
        f.actor.position = { ...f.merchant.position }
        expect(f.service.farmSupply.canSupply(f.actor.id)).toBe(true)
        expect(f.supply('second').accepted).toBe(true)
        f.advance(800)
        expect(f.sow().accepted).toBe(true)
        expect(f.service.farmSupply.canSupply(f.actor.id)).toBe(false)
        expect(f.supply('third', required(FARM_PLOTS[4]).id).accepted).toBe(
            false
        )
        expect(countInventoryItem(f.actor.inventory, 'wheat_seed')).toBe(0)
    })

    it('retires work and receipts with the old living identity', () => {
        const f = fixture()
        expect(f.supply().accepted).toBe(true)
        f.service.observe([retireCharacter(f.actor)], () => f.actor)
        expect(f.service.farmSupply.remaining(f.actor.id)).toBe(0)
        expect(f.supply('after-death').accepted).toBe(false)
    })
})

describe('farm supply boundary', () => {
    it('parses only the intention and strips client-provided assignment and rewards', () => {
        const message = {
            type: 'farm_supply',
            npcId: 'supplier',
            plotId: 'plot',
            requestId: 'receipt',
        }
        expect(
            parseClientMessage(
                JSON.stringify({
                    ...message,
                    ownerId: 'farmer',
                    amount: 50,
                    worker: true,
                })
            ).message
        ).toEqual(message)
        expect(isAdventureCommand(message)).toBe(true)
    })
    it.each(['npcId', 'plotId', 'requestId'] as const)(
        'rejects invalid %s',
        (field) => {
            for (const value of ['', ' ', 5, null, 'x'.repeat(101)]) {
                expect(
                    parseClientMessage(
                        JSON.stringify({
                            type: 'farm_supply',
                            npcId: 'supplier',
                            plotId: 'plot',
                            requestId: 'receipt',
                            [field]: value,
                        })
                    ).error
                ).toBeDefined()
            }
        }
    )
})
