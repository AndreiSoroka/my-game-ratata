import {
    CENTER_LOCATION_ID,
    FARM_GROW_MS,
    INVENTORY_CAPACITY,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import {
    countInventoryItem,
    createItemInstance,
    itemQuantity,
} from '../src/game/inventory'
import { readWorkerActivity } from '../src/game/workerActivityState'
import { createEconomyWorkers } from '../src/game/workerSpawns'
import { required } from './containerTestHelpers'
import { WorkerSimulation } from './workerRequestFixture'

function startTrial(test: WorkerSimulation): void {
    test.publish()
    test.accept()
    test.player.inventory.push(createItemInstance('bone'))
    expect(test.report()).toBeNull()
}

describe('real work steps verify a saved worksite', () => {
    it('starts Agafya with ten real wheat seeds in legal stacks', () => {
        const test = new WorkerSimulation('farmer')
        const farmer = createEconomyWorkers(
            test.room.navigationFor({ locationId: CENTER_LOCATION_ID })
        ).find(({ character }) => character.id === 'npc_farmer_1')?.character
        expect(farmer?.inventory.map(itemQuantity)).toEqual([9, 1])
        expect(
            farmer?.inventory.every((item) => item.itemId === 'wheat_seed')
        ).toBe(true)
    })

    it('counts generic scrap accepted with no domain event as a real step', () => {
        const test = new WorkerSimulation('miner', { scrap: true })
        startTrial(test)
        test.until(() => test.current().stage === 'ready')
        expect(test.commands).toHaveLength(1)
        expect(test.commands[0]?.result).toMatchObject({
            accepted: true,
            events: [],
        })
        expect(countInventoryItem(test.worker.inventory, 'scrap')).toBe(1)
        expect(
            test.adventure.resourceSnapshot(test.worksite.locationId)[0]
                ?.remaining
        ).toBe(7)
    })

    it('accepts real sowing without waiting for that crop to grow', () => {
        const test = new WorkerSimulation('farmer')
        test.prepareFarm('bare')
        test.worker.inventory.push(createItemInstance('wheat_seed'))
        startTrial(test)
        test.until(() => test.current().stage === 'ready')
        expect(test.commands).toHaveLength(1)
        expect(test.commands[0]?.message).toMatchObject({
            type: 'farm_action',
            action: 'sow',
        })
        expect(countInventoryItem(test.worker.inventory, 'wheat_seed')).toBe(0)
        expect(countInventoryItem(test.worker.inventory, 'grain')).toBe(0)
    })
})

describe('seed supply during a verification trip', () => {
    it('visits the city supplier and returns to the original plot for a real test planting', () => {
        const test = new WorkerSimulation('farmer')
        test.prepareFarm('bare')
        test.worker.inventory.push(createItemInstance('grain'))
        const supplier = required(test.characters.get('npc_merchant_1'))
        supplier.alive = false
        startTrial(test)
        const site = required(readWorkerActivity(test.worker)?.worksite)
        test.until(
            () =>
                test
                    .current()
                    .reason?.includes('поставщик семян сейчас недоступен') ===
                true
        )
        expect(test.current().stage).toBe('working')
        expect(test.commands).toHaveLength(0)

        supplier.alive = true
        test.until(() => test.current().stage === 'ready')
        expect(test.commands).toHaveLength(2)
        expect(test.commands[0]).toMatchObject({
            message: {
                type: 'farm_supply',
                npcId: supplier.id,
                plotId: site.sourceId,
            },
            locationId: CENTER_LOCATION_ID,
            permitted: true,
            result: { accepted: true },
        })
        expect(test.commands[1]).toMatchObject({
            message: {
                type: 'farm_action',
                action: 'sow',
                plotId: site.sourceId,
            },
            locationId: test.worksite.locationId,
            permitted: true,
            result: { accepted: true },
        })
        expect(test.player.inventory).toHaveLength(0)
        expect(test.worker.inventory).toHaveLength(0)
        expect(test.adventure.farmSupply.remaining(test.worker.id)).toBe(0)
    })

    it('keeps the single seed advance bound to the incident across another claim', () => {
        const test = new WorkerSimulation('farmer')
        test.prepareFarm('bare')
        startTrial(test)
        test.until(
            () => countInventoryItem(test.worker.inventory, 'wheat_seed') === 1
        )
        test.worker.inventory.length = 0
        expect(
            test.requests.abandon(test.current().id, 'solo:hero', test.now)
        ).toBeNull()
        test.until(() => test.current().stage === 'waiting')
        test.accept()
        expect(test.report()).toBeNull()
        test.until(
            () =>
                test.current().reason ===
                'Для настоящего посева на проверке нужно семя пшеницы.'
        )
        for (let tick = 0; tick < 40; tick += 1) {
            test.tick()
        }
        expect(test.commands).toHaveLength(1)
        expect(test.current()).toMatchObject({
            stage: 'working',
            proofAccepted: true,
        })
    })
})

describe('farming and gathering availability during verification', () => {
    it('waits for actual crop growth before asking for a seed advance', () => {
        const growing = new WorkerSimulation('farmer')
        growing.prepareFarm('growing')
        startTrial(growing)
        growing.until(
            () => growing.current().reason?.includes('созревания') === true
        )
        expect(growing.now).toBeLessThan(FARM_GROW_MS)
        expect(growing.commands).toHaveLength(0)
        growing.until(() => growing.current().stage === 'ready')
        expect(growing.now).toBeGreaterThanOrEqual(FARM_GROW_MS)
        expect(growing.commands[0]?.message).toMatchObject({
            type: 'farm_action',
            action: 'harvest',
        })
    })

    it('cannot credit an exhausted site using a rich resource on another map', () => {
        const test = new WorkerSimulation('lumberjack', {
            sourceRemaining: 0,
            additionalSources: [
                {
                    id: 'foreign-wood',
                    kind: 'wood',
                    locationId: 'map-2-3',
                    remaining: 8,
                    position: { x: 488, y: 744 },
                },
            ],
        })
        startTrial(test)
        test.until(
            () => test.current().reason?.includes('не осталось') === true
        )
        expect(test.current().stage).toBe('working')
        expect(test.commands).toHaveLength(0)
        expect(test.adventure.resourceSnapshot('map-2-3')[0]?.remaining).toBe(8)
    })

    it('can use a surviving alternate source inside the same small worksite', () => {
        const test = new WorkerSimulation('miner', {
            sourceRemaining: 0,
            additionalSources: [
                {
                    id: 'nearby-scrap',
                    kind: 'scrap',
                    locationId: 'map-2-1',
                    remaining: 8,
                    position: { x: 536, y: 744 },
                },
            ],
        })
        startTrial(test)
        test.until(() => test.current().stage === 'ready')
        expect(test.commands[0]?.message).toMatchObject({
            type: 'gather',
            nodeId: 'nearby-scrap',
        })
    })

    it('keeps all source units when the worker backpack cannot take the result', () => {
        const test = new WorkerSimulation('miner')
        test.worker.inventory = Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('food')
        )
        startTrial(test)
        test.until(() => test.current().reason?.includes('рюкзаке') === true)
        expect(test.current().stage).toBe('working')
        expect(
            test.adventure.resourceSnapshot(test.worksite.locationId)[0]
                ?.remaining
        ).toBe(8)
        expect(test.commands).toHaveLength(0)
    })
})

describe('trial safety and production pacing', () => {
    it.each(['original attack', 'actual work'] as const)(
        'rechecks the %s point even when it is far from the other one',
        (point) => {
            const test = new WorkerSimulation('miner', {
                attackPosition: { x: 104, y: 600 },
            })
            startTrial(test)
            test.until(() => test.current().stage === 'ready')
            test.enemy.alive = true
            if (point === 'actual work') {
                test.enemy.position = {
                    x: test.worksite.position.x + 64,
                    y: test.worksite.position.y + 32,
                }
            }
            expect(
                test.requests.checkTurnIn(
                    test.current().id,
                    'solo:hero',
                    test.room,
                    test.now
                )
            ).toContain('снова опасно')
            expect(test.current()).toMatchObject({
                stage: 'waiting',
                proofAccepted: true,
            })
        }
    )

    it('requires actual timber during the trial and resumes ordinary deliveries after release', () => {
        const test = new WorkerSimulation('lumberjack')
        test.enemy.alive = false
        test.tick()
        expect(
            test.commands.filter((entry) => entry.message.type === 'gather')
        ).toHaveLength(1)
        test.enemy.alive = true
        test.until(() => test.requests.snapshot('worker-request-1') !== null)
        test.enemy.alive = false
        test.until(() => test.requests.list().length === 1)
        test.accept()
        test.player.inventory.push(createItemInstance('bone'))
        expect(test.report()).toBeNull()
        test.until(() => test.commands.length === 2)
        expect(test.current().stage).toBe('working')
        expect(countInventoryItem(test.worker.inventory, 'wood')).toBe(0)
        test.until(() => test.current().stage === 'ready')
        expect(test.now).toBeLessThan(600_000)
        expect(
            test.commands.filter((entry) => entry.message.type === 'gather')
        ).toHaveLength(3)
        expect(countInventoryItem(test.worker.inventory, 'wood')).toBe(1)
        expect(test.requests.complete(test.current().id, 'solo:hero')).toBe(
            true
        )
        test.until(() => test.stock('wood') >= 8)
        expect(test.now).toBeLessThan(600_000)
        expect(
            test.commands.some((entry) => entry.message.type === 'market_trade')
        ).toBe(false)
    })
})
