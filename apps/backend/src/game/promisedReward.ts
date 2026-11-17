import type { ItemInstanceSnapshot } from '@my-game-ratata/contracts'

import { type InventoryItemInstance, snapshotItem } from './inventoryItems'

/** The accepted visible condition is part of the promise, even after theft and return. */
export function promisedItemsUnchanged(
    inventory: readonly InventoryItemInstance[],
    promised: readonly ItemInstanceSnapshot[]
): boolean {
    return promised.every((expected) => {
        const item = inventory.find(
            (entry) => entry.instanceId === expected.instanceId
        )
        return (
            item !== undefined &&
            JSON.stringify({
                ...snapshotItem(item),
                quantity: expected.quantity ?? 1,
            }) ===
                JSON.stringify({
                    ...expected,
                    quantity: expected.quantity ?? 1,
                })
        )
    })
}
