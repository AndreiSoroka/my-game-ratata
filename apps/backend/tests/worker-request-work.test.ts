import { FARM_GROW_MS, INVENTORY_CAPACITY } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { WorkerSimulation } from './workerRequestFixture'

function startTrial(test: WorkerSimulation): void {
    test.publish()
    test.accept()
    test.player.inventory.push(createItemInstance('bone'))
    expect(test.report()).toBeNull()
}

describe('real work steps verify a saved worksite', () => {
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

    it('waits for actual growth and reports missing seeds independently of safety', () => {
        const missing = new WorkerSimulation('farmer')
        missing.prepareFarm('bare')
        startTrial(missing)
        missing.until(() => missing.current().reason?.includes('семя') === true)
        expect(missing.current().stage).toBe('working')
        expect(missing.commands.some((entry) => entry.result.accepted)).toBe(
            false
        )

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

    it('skips the long profession interval for a probe, then preserves its ordinary budget', () => {
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
        test.until(() => test.current().stage === 'ready')
        expect(test.now).toBeLessThan(600_000)
        expect(
            test.commands.filter((entry) => entry.message.type === 'gather')
        ).toHaveLength(2)
        expect(test.requests.complete(test.current().id, 'solo:hero')).toBe(
            true
        )
        for (let tick = 0; tick < 400; tick += 1) {
            test.tick()
        }
        expect(
            test.commands.filter((entry) => entry.message.type === 'gather')
        ).toHaveLength(2)
        expect(
            test.commands.some(
                (entry) =>
                    entry.message.type === 'market_trade' &&
                    entry.result.accepted
            )
        ).toBe(true)
    })
})
