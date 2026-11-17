import {
    type AdventureClientMessage,
    CENTER_LOCATION_ID,
    FARM_PLOTS,
    FARM_WORK_CYCLE_MS,
    type GameEventPayload,
    quoteMarketTrade,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import type { AdventureActionResult } from '../src/game/adventureTrading'
import { GameCharacter } from '../src/game/character'
import { EconomyWorkerController } from '../src/game/economyWorkers'
import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import type { GameRoom } from '../src/game/room'
import { WorldLocations } from '../src/game/worldLocations'

interface CommandRecord {
    message: AdventureClientMessage
    result: AdventureActionResult
    grainBefore: number
    seedsBefore: number
    goldBefore: number
    grainAfter: number
    seedsAfter: number
    locationId: string
}

describe('municipally supplied farming uses the ordinary character commands', () => {
    it('sows a carried seed without requesting a municipal advance', () => {
        const test = new FarmerSimulation({ seeds: 1 })
        test.runUntil(() =>
            test.events.some((event) => event.kind === 'farm_sow')
        )
        expect(
            test.records.filter(
                (record) => record.message.type === 'farm_supply'
            )
        ).toEqual([])
        expect(test.count('wheat_seed')).toBe(0)
        expect(
            test.records.find((record) => record.message.type === 'farm_action')
        ).toMatchObject({
            message: { action: 'sow' },
            result: { accepted: true },
            seedsBefore: 1,
            seedsAfter: 0,
        })
    })

    it('walks for grain exchanges and free advances while retail seeds and starting gold are exhausted', () => {
        const test = new FarmerSimulation({ grain: 1 })
        test.emptyRetailSeeds()
        test.tick()
        test.service.drainGold(test.worker.id)
        test.runUntil(
            () =>
                test.events.filter((event) => event.kind === 'farm_harvest')
                    .length >= 4,
            20_000
        )
        const supplies = test.records.filter(
            (record) => record.message.type === 'farm_supply'
        )
        expect(supplies.length).toBeGreaterThanOrEqual(3)
        expect(supplies.filter((record) => !record.result.accepted)).toEqual([])
        expect(supplies[0]).toMatchObject({
            locationId: CENTER_LOCATION_ID,
            grainBefore: 1,
            grainAfter: 0,
            seedsBefore: 0,
            seedsAfter: 1,
            goldBefore: 0,
        })
        expect(
            supplies.some(
                (record) => record.grainBefore === 0 && record.grainAfter === 0
            )
        ).toBe(true)
        expect(supplies.every((record) => record.seedsAfter === 1)).toBe(true)
        expect(test.stock('wheat_seed')).toBe(0)
        expect(test.locationsVisited.has(CENTER_LOCATION_ID)).toBe(true)
        expect(test.locationsVisited.has(test.plot.locationId)).toBe(true)
        expect(test.movedPixels).toBeGreaterThan(1000)
        expect(
            test.records
                .filter((record) => record.message.type === 'farm_action')
                .every((record) => record.result.accepted)
        ).toBe(true)
        expect(
            test.records
                .filter((record) => record.message.type === 'market_trade')
                .every(
                    (record) =>
                        record.message.type === 'market_trade' &&
                        record.message.side === 'sell'
                )
        ).toBe(true)
    })
})

describe('municipal farm work recovers without bypassing the quota', () => {
    it.each(['missing supplier', 'blocked route'] as const)(
        'pauses an unfinished batch after a %s, preserves its quota and delivers surplus grain when access returns',
        (failure) => {
            const test = new FarmerSimulation({ grain: 3, failure })
            test.tick()
            expect(test.service.farmSupply.remaining(test.worker.id)).toBe(6)
            for (let step = 0; step < 100; step += 1) {
                test.tick()
            }
            expect(
                test.records.filter(
                    (record) => record.message.type === 'farm_action'
                )
            ).toEqual([])
            expect(test.count('grain')).toBe(3)
            test.restoreAccess()
            test.runUntil(() =>
                test.records.some(
                    (record) =>
                        record.message.type === 'market_trade' &&
                        record.result.accepted
                )
            )
            expect(test.count('grain')).toBe(1)
            expect(test.service.farmSupply.remaining(test.worker.id)).toBe(6)
            expect(
                test.records.find(
                    (record) => record.message.type === 'market_trade'
                )
            ).toMatchObject({
                message: { side: 'sell', itemId: 'grain', quantity: 2 },
                result: { accepted: true },
                grainBefore: 3,
                grainAfter: 1,
            })
        }
    )

    it('keeps a lost advance quota across controller replacement until the server work deadline', () => {
        const test = new FarmerSimulation()
        test.runUntil(() =>
            test.records.some(
                (record) =>
                    record.message.type === 'farm_supply' &&
                    record.result.accepted
            )
        )
        const seed = test.worker.inventory.find(
            (item) => item.itemId === 'wheat_seed'
        )
        if (seed === undefined) {
            throw new Error('Missing municipal seed')
        }
        test.world
            .get(test.worker.locationId)
            .inventory.applyInventoryAction(
                test.worker,
                'drop',
                seed.instanceId,
                test.now
            )
        expect(test.count('wheat_seed')).toBe(0)
        test.controller = new EconomyWorkerController('farmer')
        test.runUntil(() => test.now >= FARM_WORK_CYCLE_MS - 1000)
        expect(test.service.farmSupply.remaining(test.worker.id)).toBe(0)
        expect(
            test.records.filter(
                (record) => record.message.type === 'farm_supply'
            )
        ).toHaveLength(1)
        expect(
            test.events.filter((event) => event.kind === 'farm_sow')
        ).toEqual([])
        test.runUntil(
            () =>
                test.records.filter(
                    (record) => record.message.type === 'farm_supply'
                ).length === 2
        )
        expect(test.now).toBeGreaterThanOrEqual(FARM_WORK_CYCLE_MS)
        expect(test.count('wheat_seed')).toBe(1)
    })
})

class FarmerSimulation {
    public now = 0
    public controller = new EconomyWorkerController('farmer')
    public readonly world: WorldLocations
    public readonly service: AdventureService
    public readonly worker: GameCharacter
    public readonly supplier: GameCharacter
    public readonly characters: GameCharacter[]
    public readonly records: CommandRecord[] = []
    public readonly events: GameEventPayload[] = []
    public readonly locationsVisited = new Set<string>()
    public readonly plot = firstPlot()
    public movedPixels = 0
    private readonly room: GameRoom

    public constructor(
        options: {
            seeds?: number
            grain?: number
            failure?: 'missing supplier' | 'blocked route'
        } = {}
    ) {
        const navigation = new NavigationService({
            id: 'farmer-supply-tests',
            width: 96,
            height: 80,
            tileWidth: 16,
            tileHeight: 16,
            solid: Array<boolean>(96 * 80).fill(false),
            solidLayerNames: [],
        })
        this.world = new WorldLocations(navigation)
        this.service = new AdventureService({
            now: () => this.now,
            farmRandom: () => 0,
            resourceNodes: [],
            worldObjects: [],
        })
        exhaustInitialRipePlots(this.service, this.world)
        this.worker = character(
            'farmer-worker',
            this.plot.locationId,
            this.plot.position
        )
        this.worker.tags.add('worker.farmer')
        this.worker.tags.add(`worker.city.${CENTER_LOCATION_ID}`)
        if (options.seeds !== undefined) {
            this.worker.inventory.push(
                createItemInstance('wheat_seed', options.seeds)
            )
        }
        if (options.grain !== undefined) {
            this.worker.inventory.push(
                createItemInstance('grain', options.grain)
            )
        }
        this.supplier = character('npc_merchant_1', CENTER_LOCATION_ID, {
            x: 768,
            y: 104,
        })
        this.characters =
            options.failure === 'missing supplier'
                ? [this.worker]
                : [this.worker, this.supplier]
        if (options.failure === 'blocked route') {
            const grid = this.world.get(this.plot.locationId).navigation.grid
            for (let x = 0; x < grid.width; x += 1) {
                grid.solid[60 * grid.width + x] = true
            }
        }
        this.room = {
            adventureForWorkers: () => this.service,
            navigationFor: (actor: GameCharacter) =>
                this.world.get(actor.locationId).navigation,
            findVisibleTarget: () => undefined,
            getCharacter: (id: string) =>
                this.characters.find((actor) => actor.id === id),
            requestAdventure: (
                actor: GameCharacter,
                message: AdventureClientMessage,
                at: number
            ) => this.request(actor, message, at),
            publishEvents: (events: GameEventPayload[]) =>
                this.events.push(...events),
        } as unknown as GameRoom
        expect(this.service.farmSupply.beginWork(this.worker, this.now)).toBe(
            true
        )
        this.locationsVisited.add(this.worker.locationId)
    }

    public tick(): void {
        this.now += 100
        this.service.update(
            this.now,
            (id) => this.world.get(id).navigation,
            this.characters
        )
        this.controller.update(this.worker, this.room, this.now)
        const before = { ...this.worker.position }
        const input = this.worker.getMoveInput()
        const next = this.worker.nextPathPoint()
        const intent =
            input.x !== 0 || input.y !== 0 || next === undefined
                ? input
                : {
                      x: next.x - before.x,
                      y: next.y - before.y,
                  }
        advanceCharacter({
            character: this.worker,
            deltaMs: 100,
            now: this.now,
            navigation: this.world.get(this.worker.locationId).navigation,
        })
        this.movedPixels += Math.hypot(
            this.worker.position.x - before.x,
            this.worker.position.y - before.y
        )
        this.world.travel(this.worker, intent, this.now)
        this.locationsVisited.add(this.worker.locationId)
    }

    public runUntil(predicate: () => boolean, steps = 10_000): void {
        for (let step = 0; step < steps && !predicate(); step += 1) {
            this.tick()
        }
        expect(predicate()).toBe(true)
    }

    public count(itemId: 'grain' | 'wheat_seed'): number {
        return countInventoryItem(this.worker.inventory, itemId)
    }

    public stock(itemId: 'grain' | 'wheat_seed'): number {
        return (
            this.service.economy
                .snapshot(CENTER_LOCATION_ID, this.now)
                ?.rows.find((row) => row.itemId === itemId)?.stock ?? 0
        )
    }

    public restoreAccess(): void {
        if (!this.characters.includes(this.supplier)) {
            this.characters.push(this.supplier)
        }
        this.world.get(this.plot.locationId).navigation.grid.solid.fill(false)
    }

    public emptyRetailSeeds(): void {
        const customer = character(
            'seed-customer',
            CENTER_LOCATION_ID,
            this.supplier.position
        )
        this.service.grantGoldOnce(customer.id, 1000, 'retail-test-budget')
        const row = this.service.economy
            .snapshot(CENTER_LOCATION_ID, this.now)
            ?.rows.find((candidate) => candidate.itemId === 'wheat_seed')
        if (row === undefined) {
            throw new Error('Missing seed commodity')
        }
        const total = quoteMarketTrade(row, 'buy', row.stock)
        if (total === null) {
            throw new Error('Missing seed quote')
        }
        const result = this.service.handleResult(
            customer,
            {
                type: 'market_trade',
                npcId: this.supplier.id,
                itemId: 'wheat_seed',
                side: 'buy',
                quantity: row.stock,
                expectedTotal: total,
                requestId: 'empty-retail-seeds',
            },
            [...this.characters, customer],
            this.world.get(CENTER_LOCATION_ID).navigation,
            this.now
        )
        expect(result.accepted).toBe(true)
        expect(this.stock('wheat_seed')).toBe(0)
    }

    private request(
        actor: GameCharacter,
        message: AdventureClientMessage,
        at: number
    ): AdventureActionResult {
        const grainBefore = this.count('grain')
        const seedsBefore = this.count('wheat_seed')
        const goldBefore = this.service.snapshot(actor.id).gold
        const result = this.service.handleResult(
            actor,
            message,
            this.characters,
            this.world.get(actor.locationId).navigation,
            at
        )
        this.records.push({
            message,
            result,
            grainBefore,
            seedsBefore,
            goldBefore,
            grainAfter: this.count('grain'),
            seedsAfter: this.count('wheat_seed'),
            locationId: actor.locationId,
        })
        return result
    }
}

function firstPlot() {
    const plot = FARM_PLOTS[0]
    if (plot === undefined) {
        throw new Error('Missing farm plot')
    }
    return plot
}

function character(
    id: string,
    locationId: string,
    position: { x: number; y: number }
) {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: 'scripted',
        faction: 'peaceful',
        locationId,
        spawnPosition: position,
    })
}

function exhaustInitialRipePlots(
    service: AdventureService,
    world: WorldLocations
) {
    for (const plot of FARM_PLOTS.filter(
        (candidate) => candidate.initiallyRipe === true
    )) {
        const harvester = character(
            `initial-harvester-${plot.id}`,
            plot.locationId,
            plot.position
        )
        expect(
            service.handle(
                harvester,
                { type: 'farm_action', plotId: plot.id, action: 'harvest' },
                [],
                world.get(plot.locationId).navigation,
                0
            )
        ).toHaveLength(1)
    }
}
