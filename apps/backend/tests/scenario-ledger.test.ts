import { expect, it } from 'vitest'

import {
    addInventoryItems,
    createItemInstance,
    itemQuantity,
    transferInventoryQuantity,
} from '../src/game/inventory'
import { ScenarioLedger } from '../src/game/scenarioLedger'
import { definition, scenarioFixture, treeNode } from './scenarioTestHelpers'

it('tracks merged earned units and conservatively removes lost units before old stock', () => {
    const inventory = [createItemInstance('herbs', 6)]
    const ledger = new ScenarioLedger(inventory)
    const before = structuredClone(inventory)
    addInventoryItems(inventory, [createItemInstance('herbs', 2)])
    ledger.acquired(before, inventory)
    const item = inventory[0]
    expect(item).toBeDefined()
    if (item === undefined) {
        throw new Error('Missing material')
    }
    expect(ledger.quantity(item)).toBe(2)
    item.quantity = 7
    ledger.reconcile(inventory)
    expect(ledger.quantity(item)).toBe(1)
    item.quantity = 6
    ledger.reconcile(inventory)
    expect(ledger.quantity(item)).toBe(0)
})

it('splits exact stack quantities atomically and rejects replay or an overflowing destination', () => {
    const source = [createItemInstance('herbs', 8)]
    const destination = [createItemInstance('herbs', 8)]
    const id = source[0]?.instanceId ?? 'missing'
    const before = structuredClone([source, destination])
    expect(
        transferInventoryQuantity(source, destination, id, 2, 1)
    ).toBeUndefined()
    expect([source, destination]).toEqual(before)
    const moved = transferInventoryQuantity(source, destination, id, 2, 2)
    expect(moved?.instanceId).not.toBe(id)
    expect(source.map(itemQuantity)).toEqual([6])
    expect(destination.map(itemQuantity)).toEqual([9, 1])
    expect(
        transferInventoryQuantity(source, destination, id, 7, 2)
    ).toBeUndefined()
    expect(
        transferInventoryQuantity(source, destination, id, 0, 2)
    ).toBeUndefined()
    expect(source.map(itemQuantity)).toEqual([6])
})

it('counts every blocked second despite throttling failed work commands', () => {
    const f = scenarioFixture([treeNode()])
    f.actor.position = { x: 120, y: 128 }
    Reflect.deleteProperty(f.actor.equipment, 'weapon')
    f.start(
        definition([
            { id: 'work', kind: 'gather', resource: 'wood', amount: 1 },
        ])
    )
    f.tick(199)
    expect(f.snapshot().run?.status).toBe('running')
    f.tick()
    expect(f.snapshot().run?.results[0]).toMatchObject({
        status: 'failed',
        failures: 1,
    })
    expect(f.actor.inventory).toEqual([])
    expect(f.adventure.resourceSnapshot(f.actor.locationId)[0]?.remaining).toBe(
        8
    )
})

it('uses server elapsed time for a blocked deadline even after a delayed tick', () => {
    const f = scenarioFixture()
    f.start(definition([{ id: 'search', kind: 'search', target: 'tree' }]))
    f.scenarios.advance(f.actor, f.room, 11_000, false)
    expect(f.snapshot().run?.status).toBe('completed')
    expect(f.snapshot().run?.results[0]?.status).toBe('failed')
})
