import {
    type EquipmentSlotId,
    type EquipmentSnapshot,
    INVENTORY_CAPACITY,
    ITEM_DEFINITIONS,
} from '@my-game-ratata/contracts'

import {
    type InventoryItemInstance,
    itemQuantity,
    snapshotItem,
} from './inventoryItems'
import { addInventoryItem } from './inventoryStacks'

export {
    createItemInstance,
    type InventoryItemInstance,
    itemQuantity,
    snapshotItem,
} from './inventoryItems'
export {
    addInventoryItem,
    addInventoryItems,
    canAddInventoryItems,
    consumeInventoryItems,
    countInventoryItem,
    craftInventoryItems,
    type InventoryCosts,
    transferInventoryItem,
} from './inventoryStacks'

export type EquipmentState = Partial<
    Record<EquipmentSlotId, InventoryItemInstance>
>
export const inventoryCapacity = INVENTORY_CAPACITY

export function snapshotEquipment(
    equipment: EquipmentState
): EquipmentSnapshot {
    const snapshot: EquipmentSnapshot = {}

    for (const slot of equipmentSlots) {
        const item = equipment[slot]

        if (item !== undefined) {
            snapshot[slot] = snapshotItem(item)
        }
    }

    return snapshot
}

export function preferredEquipmentSlot(
    item: InventoryItemInstance
): EquipmentSlotId | undefined {
    return ITEM_DEFINITIONS[item.itemId].equipmentSlots?.[0]
}

export function itemFitsSlot(
    item: InventoryItemInstance,
    slot: EquipmentSlotId
): boolean {
    return (
        itemQuantity(item) === 1 &&
        (ITEM_DEFINITIONS[item.itemId].equipmentSlots?.includes(slot) ?? false)
    )
}

export function removeInventoryItem(
    inventory: InventoryItemInstance[],
    instanceId: string
): InventoryItemInstance | undefined {
    const index = inventory.findIndex((item) => item.instanceId === instanceId)

    if (index === -1) {
        return undefined
    }

    return inventory.splice(index, 1)[0]
}

export function equipInventoryItem(
    inventory: InventoryItemInstance[],
    equipment: EquipmentState,
    instanceId: string
): InventoryItemInstance | undefined {
    const index = inventory.findIndex((item) => item.instanceId === instanceId)
    const item = inventory[index]

    if (item === undefined) {
        return undefined
    }

    const slot = preferredEquipmentSlot(item)

    if (slot === undefined || !itemFitsSlot(item, slot)) {
        return undefined
    }

    const replaced = equipment[slot]
    inventory.splice(index, 1)
    equipment[slot] = item

    if (replaced !== undefined) {
        inventory.push(replaced)
    }

    return item
}

export function equipDirect(
    equipment: EquipmentState,
    item: InventoryItemInstance
): boolean {
    const slot = preferredEquipmentSlot(item)

    if (slot === undefined || !itemFitsSlot(item, slot)) {
        return false
    }

    equipment[slot] = item

    return true
}

export function unequipItem(
    inventory: InventoryItemInstance[],
    equipment: EquipmentState,
    slot: EquipmentSlotId
): InventoryItemInstance | undefined {
    const item = equipment[slot]

    if (item === undefined || !addInventoryItem(inventory, item)) {
        return undefined
    }

    Reflect.deleteProperty(equipment, slot)
    return item
}

const equipmentSlots: EquipmentSlotId[] = ['boots', 'weapon']
