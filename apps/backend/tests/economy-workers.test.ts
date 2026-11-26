import { CENTER_LOCATION_ID, ITEM_DEFINITIONS } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { repairSnapshot } from '../src/game/adventureTrading'
import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { readWorkerActivity } from '../src/game/workerActivityState'
import { required } from './containerTestHelpers'
import { economyWorkerFixture, source } from './workerEconomyFixture'

it('makes two-log trips on foot and transfers only existing goods without a sale', () => {
    const test = economyWorkerFixture([source('tree')])
    for (
        let elapsed = 0;
        elapsed < 20_000 && test.deliveries.mock.results.length === 0;
        elapsed += 100
    ) {
        test.run(100)
    }
    expect(test.remaining('tree')).toBe(6)
    expect(test.row('wood')).toMatchObject({
        stock: 8,
        deliveredLast10Minutes: 2,
    })
    expect(test.deliveries.mock.results).toHaveLength(1)
    expect(test.deliveries.mock.results[0]?.value).toMatchObject({
        accepted: true,
    })
    expect(countInventoryItem(test.worker.inventory, 'wood')).toBe(0)
    expect(test.service.snapshot(test.worker.id).gold).toBe(20)
    expect(test.worker.equipment.weapon?.durability).toBe(994)
    expect(
        test.commands.filter((message) => message.type === 'gather')
    ).toHaveLength(6)
    expect(
        test.commands.some((message) => message.type === 'market_trade')
    ).toBe(false)
})

it('keeps the authored regional order for equally close timber sources', () => {
    const later = {
        ...source('tree'),
        id: 'western-tree',
        locationId: 'map-1-2',
    }
    const earlier = {
        ...source('tree'),
        id: 'northern-tree',
        locationId: 'map-2-1',
    }
    const test = economyWorkerFixture([later, earlier])
    test.run(100)
    expect(readWorkerActivity(test.worker)?.worksite).toMatchObject({
        sourceId: earlier.id,
        locationId: earlier.locationId,
    })
    const snapshot = required(
        test.service.resourceSnapshot(earlier.locationId, earlier.id)[0]
    )
    snapshot.remaining = 0
    expect(
        test.service.resourceSnapshot(earlier.locationId, earlier.id)[0]
            ?.remaining
    ).toBe(8)
})

it('keeps supplies on the worker when dead, too far, blocked by a request, or with no merchant', () => {
    const dead = economyWorkerFixture([source('tree')])
    dead.worker.alive = false
    dead.run(10_000)
    expect(dead.remaining('tree')).toBe(8)
    expect(dead.commands).toHaveLength(0)

    const absent = economyWorkerFixture([source('tree')], {
        merchantPresent: false,
    })
    absent.run(25_000)
    expect(countInventoryItem(absent.worker.inventory, 'wood')).toBe(2)
    expect(absent.row('wood').stock).toBe(6)
    const deposit = () =>
        absent.service.deliverWorkerSupplies(
            absent.worker,
            absent.merchant,
            absent.navigation,
            absent.now()
        )
    expect(deposit().accepted).toBe(false)
    absent.worker.position = { x: 48, y: 72 }
    absent.service.setWorkPermission(
        (_actor, command) => command !== 'worker_delivery'
    )
    expect(deposit().accepted).toBe(false)
    expect(absent.row('wood').stock).toBe(6)
    absent.service.setWorkPermission(() => true)
    expect(deposit().accepted).toBe(true)
    expect(deposit().accepted).toBe(false)
    expect(absent.row('wood').stock).toBe(8)
    expect(absent.service.snapshot(absent.worker.id).gold).toBe(20)
})

it('fills one log from 19 and rotates actual town stops as demand returns', () => {
    const test = economyWorkerFixture([source('tree')])
    test.stockTo('wood', 19)
    test.run(20_000)
    expect(test.row('wood').stock).toBe(20)
    expect(test.remaining('tree')).toBe(7)
    expect(readWorkerActivity(test.worker)?.text).toContain('на площади')
    expect(
        Math.hypot(test.worker.position.x - 56, test.worker.position.y - 120)
    ).toBeLessThan(18)
    test.advanceTo(300_000)
    test.run(20_000)
    expect(test.row('wood').stock).toBe(20)
    expect(test.remaining('tree')).toBe(6)
    expect(readWorkerActivity(test.worker)?.text).toContain('у лавки')
    expect(
        Math.hypot(test.worker.position.x - 56, test.worker.position.y - 200)
    ).toBeLessThan(18)
    test.advanceTo(600_000)
    test.run(20_000)
    expect(test.row('wood').stock).toBe(20)
    expect(test.remaining('tree')).toBe(5)
    expect(readWorkerActivity(test.worker)?.text).toContain('у гильдии')
    expect(
        Math.hypot(test.worker.position.x - 56, test.worker.position.y - 280)
    ).toBeLessThan(18)
})

it('replants real saplings after a mature tree falls, using ordinary plant validation', () => {
    const test = economyWorkerFixture(
        [{ ...source('tree', { x: 200, y: 136 }), remaining: 1 }],
        { plantable: true }
    )
    test.stockTo('wood', 19)
    test.run(25_000)
    expect(test.row('wood').stock).toBe(20)
    const replanted = test.service
        .resourceSnapshot(CENTER_LOCATION_ID)
        .filter((node) => node.phase === 'growing')
    expect(replanted.length).toBeGreaterThanOrEqual(1)
    expect(
        countInventoryItem(test.worker.inventory, 'sapling') + replanted.length
    ).toBe(2)
    expect(test.commands.some((message) => message.type === 'plant_tree')).toBe(
        true
    )
})

it('physically visits the smith for sponsored issued equipment repair', () => {
    const test = economyWorkerFixture([source('tree')])
    test.stockTo('wood', 20)
    const axe = required(test.worker.equipment.weapon)
    const boots = required(test.worker.equipment.boots)
    axe.durability = 0
    boots.durability = 0
    const spare = createItemInstance('stone_axe')
    spare.durability = 0
    expect(repairSnapshot(test.worker).total).toBe(0)
    test.worker.inventory.push(spare)
    expect(repairSnapshot(test.worker).total).toBe(4)
    test.smith.alive = false
    test.run(5_000)
    expect(axe.durability).toBe(0)
    expect(boots.durability).toBe(0)
    test.smith.alive = true
    test.run(10_000)
    expect(axe.durability).toBe(ITEM_DEFINITIONS.axe.maxDurability)
    expect(boots.durability).toBe(ITEM_DEFINITIONS.boots.maxDurability)
    expect(spare.durability).toBe(0)
    expect(test.service.snapshot(test.worker.id).gold).toBe(20)
    expect(test.commands).toContainEqual(
        expect.objectContaining({ type: 'repair_items', expectedTotal: 0 })
    )
})

it('covers three hours of twelve-log baseline consumption after filling the real reserve', () => {
    const test = economyWorkerFixture(
        [
            source('tree', { x: 200, y: 72 }, 'tree-a'),
            source('tree', { x: 200, y: 120 }, 'tree-b'),
            source('tree', { x: 200, y: 168 }, 'tree-c'),
            source('tree', { x: 200, y: 216 }, 'tree-d'),
            source('tree', { x: 248, y: 72 }, 'tree-e'),
            source('tree', { x: 248, y: 120 }, 'tree-f'),
            source('tree', { x: 248, y: 168 }, 'tree-g'),
        ],
        { plantable: true }
    )
    test.run(200_000)
    expect(test.row('wood').stock).toBe(20)
    for (let interval = 1; interval <= 36; interval += 1) {
        test.advanceTo(interval * 300_000)
        expect(test.row('wood').stock).toBe(19)
        test.run(25_000)
        expect(test.row('wood').stock).toBe(20)
    }
    expect(test.deliveries.mock.results).toHaveLength(43)
    expect(test.row('wood').consumptionPer10Minutes).toBe(2)
    expect(test.service.snapshot(test.worker.id).gold).toBe(20)
})
