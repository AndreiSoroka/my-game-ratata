import { INVENTORY_CAPACITY } from '@my-game-ratata/contracts'

import {
    createItemInstance,
    type InventoryItemInstance,
    itemQuantity,
} from './inventoryItems'
import { addInventoryItems, transferInventoryItem } from './inventoryStacks'

/** Atomically transfers a real portion; failed capacity checks preserve both bags. */
export function transferInventoryQuantity(
    source: InventoryItemInstance[],
    destination: InventoryItemInstance[],
    instanceId: string,
    quantity: number,
    capacity = INVENTORY_CAPACITY
): InventoryItemInstance | undefined {
    const item = source.find((entry) => entry.instanceId === instanceId)
    if (
        item === undefined ||
        source === destination ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > itemQuantity(item)
    ) {
        return undefined
    }
    if (quantity === itemQuantity(item)) {
        return transferInventoryItem(source, destination, instanceId, capacity)
    }
    const portion = {
        ...item,
        instanceId: createItemInstance(item.itemId).instanceId,
        quantity,
    }
    if (!addInventoryItems(destination, [portion], capacity)) {
        return undefined
    }
    const remaining = itemQuantity(item) - quantity
    if (remaining === 1) {
        Reflect.deleteProperty(item, 'quantity')
    } else {
        item.quantity = remaining
    }
    return portion
}
