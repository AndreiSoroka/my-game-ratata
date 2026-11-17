import type { EquipmentSlotId, ItemId } from './inventory'
export interface ItemInstanceSnapshot {
    quantity?: number
    durability?: number
    instanceId: string
    itemId: ItemId
}

export type EquipmentSnapshot = Partial<
    Record<EquipmentSlotId, ItemInstanceSnapshot>
>
