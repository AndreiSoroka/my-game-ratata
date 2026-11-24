import { describe, expect, it } from 'vitest'

import {
    addInventoryItem,
    addInventoryItems,
    canAddInventoryItems,
    consumeInventoryItems,
    countInventoryItem,
    craftInventoryItems,
    createItemInstance,
    equipDirect,
    type InventoryItemInstance,
    itemQuantity,
    snapshotItem,
    transferInventoryItem,
} from '../src/game/inventory'

function filledBag(
    itemId: 'herbs' | 'grain',
    quantity: number
): InventoryItemInstance[] {
    return [
        ...Array.from({ length: 49 }, () => createItemInstance('wood')),
        createItemInstance(itemId, quantity),
    ]
}

describe('occupied slots and quantity boundaries', () => {
    it('splits ten herbs into nine plus one with unique live IDs and no source mutation', () => {
        const bag: InventoryItemInstance[] = []
        const herbs = createItemInstance('herbs', 10)
        expect(addInventoryItem(bag, herbs)).toBe(true)
        expect(bag.map(itemQuantity)).toEqual([9, 1])
        expect(bag[0]?.instanceId).toBe(herbs.instanceId)
        expect(new Set(bag.map((item) => item.instanceId)).size).toBe(2)
        expect(itemQuantity(herbs)).toBe(10)
        expect(countInventoryItem(bag, 'herbs')).toBe(10)
        expect(snapshotItem(bag[1] ?? herbs)).not.toHaveProperty('quantity')
        expect(snapshotItem(bag[0] ?? herbs).quantity).toBe(9)
    })

    it('merges to nine, preserves overflow and never merges wood, hearts or equipment', () => {
        const first = createItemInstance('herbs', 8)
        const incoming = createItemInstance('herbs', 3)
        const bag = [first]
        expect(addInventoryItem(bag, incoming)).toBe(true)
        expect(bag.map(itemQuantity)).toEqual([9, 2])
        expect(bag.map((item) => item.instanceId)).toEqual([
            first.instanceId,
            incoming.instanceId,
        ])
        expect(itemQuantity(incoming)).toBe(3)
        for (const id of ['wood', 'slime_heart', 'simple_sword'] as const) {
            expect(addInventoryItem(bag, createItemInstance(id, 2))).toBe(true)
            expect(bag.filter((item) => item.itemId === id)).toHaveLength(2)
            expect(
                bag.filter((item) => item.itemId === id).map(itemQuantity)
            ).toEqual([1, 1])
        }
        expect(equipDirect({}, createItemInstance('simple_sword', 2))).toBe(
            false
        )
    })

    it('allows a full bag to fill an existing stack and rejects partial acceptance', () => {
        const bag = filledBag('herbs', 8)
        const herbs = createItemInstance('herbs')
        expect(canAddInventoryItems(bag, [herbs])).toBe(true)
        expect(itemQuantity(bag[49] ?? herbs)).toBe(8)
        expect(addInventoryItem(bag, herbs)).toBe(true)
        expect(bag).toHaveLength(50)
        expect(countInventoryItem(bag, 'herbs')).toBe(9)
        const grainBag = filledBag('grain', 8)
        const before = structuredClone(grainBag)
        expect(addInventoryItem(grainBag, createItemInstance('grain', 3))).toBe(
            false
        )
        expect(grainBag).toEqual(before)
    })

    it('rolls back earlier merges when a later batch item does not fit or repeats an ID', () => {
        const bag = filledBag('herbs', 8)
        const before = structuredClone(bag)
        const herbs = createItemInstance('herbs')
        expect(
            addInventoryItems(bag, [herbs, createItemInstance('wood')])
        ).toBe(false)
        expect(bag).toEqual(before)
        expect(addInventoryItems(bag, [herbs, herbs])).toBe(false)
        expect(bag).toEqual(before)
        const first = bag[0]
        if (first === undefined) {
            throw new Error('Missing test item')
        }
        expect(addInventoryItem(bag, first)).toBe(false)
        expect(bag).toEqual(before)
    })

    it.each([0, -1, 1.5, NaN, Infinity])(
        'rejects invalid quantity %s without mutation',
        (quantity) => {
            const bag = [createItemInstance('herbs', 4)]
            const before = structuredClone(bag)
            const item = {
                instanceId: 'invalid',
                itemId: 'herbs' as const,
                quantity,
            }
            expect(addInventoryItem(bag, item)).toBe(false)
            expect(bag).toEqual(before)
            expect(() => createItemInstance('herbs', quantity)).toThrow(
                RangeError
            )
        }
    )
})

describe('atomic consumption and crafting', () => {
    it('consumes across stacks and leaves ingredients unchanged if any cost is missing', () => {
        const bag = [
            createItemInstance('herbs', 9),
            createItemInstance('herbs', 4),
        ]
        const before = structuredClone(bag)
        expect(consumeInventoryItems(bag, { herbs: 10, wood: 1 })).toBe(false)
        expect(bag).toEqual(before)
        expect(consumeInventoryItems(bag, { herbs: 10 })).toBe(true)
        expect(bag).toHaveLength(1)
        expect(countInventoryItem(bag, 'herbs')).toBe(3)
        expect(consumeInventoryItems(bag, { herbs: 4 })).toBe(false)
        expect(countInventoryItem(bag, 'herbs')).toBe(3)
    })

    it('reuses a fully consumed slot but does not spend a partial stack when output cannot fit', () => {
        const full = filledBag('grain', 3)
        expect(
            craftInventoryItems(full, { grain: 3 }, [
                createItemInstance('food'),
            ])
        ).toBe(true)
        expect(full).toHaveLength(50)
        expect(countInventoryItem(full, 'grain')).toBe(0)
        expect(countInventoryItem(full, 'food')).toBe(1)
        const partial = filledBag('grain', 8)
        const before = structuredClone(partial)
        expect(
            craftInventoryItems(partial, { grain: 3 }, [
                createItemInstance('food'),
            ])
        ).toBe(false)
        expect(partial).toEqual(before)
    })

    it('transfers whole stacks with conservation and no duplicate replay when the source has no slot limit', () => {
        const bag = filledBag('herbs', 8)
        const item = createItemInstance('herbs', 2)
        const storage = [
            item,
            ...Array.from({ length: 55 }, () => createItemInstance('wood')),
        ]
        const before = structuredClone(storage)
        expect(
            transferInventoryItem(storage, bag, item.instanceId)
        ).toBeUndefined()
        expect(storage).toEqual(before)
        bag.shift()
        expect(transferInventoryItem(storage, bag, item.instanceId)).toBe(item)
        expect(countInventoryItem(bag, 'herbs')).toBe(10)
        expect(
            bag.filter((entry) => entry.itemId === 'herbs').map(itemQuantity)
        ).toEqual([9, 1])
        expect(
            transferInventoryItem(storage, bag, item.instanceId)
        ).toBeUndefined()
        expect(
            transferInventoryItem(bag, storage, item.instanceId, Infinity)
        ).toBeDefined()
        expect(
            countInventoryItem(bag, 'herbs') +
                countInventoryItem(storage, 'herbs')
        ).toBe(10)
        expect(storage).toHaveLength(56)
        expect(
            transferInventoryItem(bag, storage, item.instanceId, Infinity)
        ).toBeUndefined()
        expect(
            transferInventoryItem(storage, storage, item.instanceId)
        ).toBeUndefined()
    })
})
