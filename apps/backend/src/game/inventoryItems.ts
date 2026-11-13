import type { ItemId, ItemInstanceSnapshot } from '@my-game-ratata/contracts'

export interface InventoryItemInstance {
    instanceId: string
    itemId: ItemId
    quantity?: number
}

let nextItemInstanceIndex = 1

export function itemQuantity(item: InventoryItemInstance): number {
    return item.quantity ?? 1
}

/** Bulk output is split into legal stacks when it enters an inventory. */
export function createItemInstance(
    itemId: ItemId,
    quantity = 1
): InventoryItemInstance {
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
        throw new RangeError('Item quantity must be a positive safe integer')
    }
    const instanceId = `${itemId}_${String(nextItemInstanceIndex)}`
    nextItemInstanceIndex += 1
    return { instanceId, itemId, ...(quantity === 1 ? {} : { quantity }) }
}

export function snapshotItem(
    item: InventoryItemInstance
): ItemInstanceSnapshot {
    const quantity = itemQuantity(item)
    return {
        instanceId: item.instanceId,
        itemId: item.itemId,
        ...(quantity === 1 ? {} : { quantity }),
    }
}
