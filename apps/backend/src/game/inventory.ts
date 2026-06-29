import {
    type EquipmentSlotId,
    type EquipmentSnapshot,
    ITEM_DEFINITIONS,
    type ItemId,
    type ItemInstanceSnapshot,
} from '@my-game-ratata/contracts'

export interface InventoryItemInstance {
    instanceId: string
    itemId: ItemId
}

export type EquipmentState = Partial<
    Record<EquipmentSlotId, InventoryItemInstance>
>

export const inventoryCapacity = 50

let nextItemInstanceIndex = 1

export function createItemInstance(itemId: ItemId): InventoryItemInstance {
    const instanceId = `${itemId}_${String(nextItemInstanceIndex)}`
    nextItemInstanceIndex += 1

    return { instanceId, itemId }
}

export function snapshotItem(
    item: InventoryItemInstance
): ItemInstanceSnapshot {
    return {
        instanceId: item.instanceId,
        itemId: item.itemId,
    }
}

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
    return ITEM_DEFINITIONS[item.itemId].equipmentSlots?.includes(slot) ?? false
}

export function addInventoryItem(
    inventory: InventoryItemInstance[],
    item: InventoryItemInstance
): boolean {
    if (inventory.length >= inventoryCapacity) {
        return false
    }

    inventory.push(item)

    return true
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
    if (inventory.length >= inventoryCapacity) {
        return undefined
    }

    const item = equipment[slot]

    if (item === undefined) {
        return undefined
    }

    Reflect.deleteProperty(equipment, slot)
    inventory.push(item)

    return item
}

const equipmentSlots: EquipmentSlotId[] = ['boots', 'weapon']
