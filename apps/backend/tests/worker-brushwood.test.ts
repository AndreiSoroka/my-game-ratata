import { expect, it } from 'vitest'

import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { economyWorkerFixture, source } from './workerEconomyFixture'

it('picks up loose brushwood along the timber route and adds nearby branches to the same delivery', () => {
    const test = economyWorkerFixture([
        source('tree'),
        source('branches', { x: 168, y: 88 }),
    ])
    test.inventory.dropItemNear(createItemInstance('brushwood', 2), {
        x: 112,
        y: 72,
    })
    test.inventory.dropItemNear(createItemInstance('brushwood'), {
        x: 300,
        y: 300,
    })
    test.run(65_000)
    expect(test.row('wood').stock).toBe(14)
    expect(test.row('brushwood')).toMatchObject({
        stock: 10,
        deliveredLast10Minutes: 4,
    })
    expect(test.remaining('branches')).toBe(0)
    expect(countInventoryItem(test.worker.inventory, 'brushwood')).toBe(0)
    expect(test.inventory.snapshotItems()).toHaveLength(1)
    expect(test.deliveries.mock.results).toHaveLength(1)
})

it('brings the brushwood from the final cut and skips nearby sources when that row is full', () => {
    const test = economyWorkerFixture([
        { ...source('tree'), remaining: 1 },
        source('bush', { x: 168, y: 88 }),
    ])
    test.stockTo('wood', 19)
    test.stockTo('brushwood', 24)
    test.run(20_000)
    expect(test.row('wood').stock).toBe(20)
    expect(test.row('brushwood').stock).toBe(24)
    expect(countInventoryItem(test.worker.inventory, 'brushwood')).toBe(1)
    expect(test.remaining('bush')).toBe(2)
})

it('leaves loose brushwood and branch sources alone while resting or when no timber route exists', () => {
    const resting = economyWorkerFixture([source('branches', { x: 88, y: 72 })])
    resting.stockTo('wood', 20)
    resting.inventory.dropItemNear(
        createItemInstance('brushwood'),
        resting.worker.position
    )
    resting.run(5_000)
    expect(resting.inventory.snapshotItems()).toHaveLength(1)
    expect(resting.remaining('branches')).toBe(1)
    expect(resting.deliveries.mock.results).toHaveLength(0)

    const noRoute = economyWorkerFixture([source('branches', { x: 88, y: 72 })])
    noRoute.inventory.dropItemNear(
        createItemInstance('brushwood'),
        noRoute.worker.position
    )
    noRoute.run(5_000)
    expect(noRoute.inventory.snapshotItems()).toHaveLength(1)
    expect(noRoute.remaining('branches')).toBe(1)
    expect(noRoute.deliveries.mock.results).toHaveLength(0)
})
