import { ITEM_DEFINITIONS } from '@my-game-ratata/contracts'

import { type InventoryItemInstance, itemQuantity } from './inventoryItems'
export function validQuantity(item: InventoryItemInstance): boolean {
    const amount = itemQuantity(item)
    return Number.isSafeInteger(amount) && amount > 0
}

export function validCondition(item: InventoryItemInstance): boolean {
    if (!Object.hasOwn(ITEM_DEFINITIONS, item.itemId)) {
        return false
    }
    const definition = ITEM_DEFINITIONS[item.itemId]
    if (
        item.durability !== undefined &&
        (definition.maxDurability === undefined ||
            !Number.isSafeInteger(item.durability) ||
            item.durability < 0 ||
            item.durability > definition.maxDurability)
    ) {
        return false
    }
    return (
        item.wearDistance === undefined ||
        (definition.durabilityWear?.walkPixels !== undefined &&
            Number.isFinite(item.wearDistance) &&
            item.wearDistance >= 0 &&
            item.wearDistance < definition.durabilityWear.walkPixels)
    )
}

export function validInventory(
    inventory: readonly InventoryItemInstance[]
): boolean {
    const ids = new Set<string>()
    for (const item of inventory) {
        const definition = ITEM_DEFINITIONS[item.itemId]
        if (
            !Object.hasOwn(ITEM_DEFINITIONS, item.itemId) ||
            !validQuantity(item) ||
            !validCondition(item) ||
            itemQuantity(item) > (definition.maxStack ?? 1) ||
            ids.has(item.instanceId)
        ) {
            return false
        }
        ids.add(item.instanceId)
    }
    return true
}
