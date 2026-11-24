import type { EquipmentSlotId, ItemId } from './inventory'
import type { LightSourceKind } from './portableLights'
export interface ItemInstanceSnapshot {
    quantity?: number
    durability?: number
    instanceId: string
    itemId: ItemId
}

export type EquipmentSnapshot = Partial<
    Record<EquipmentSlotId, ItemInstanceSnapshot>
>

export interface CharacterInventorySnapshot {
    equipment: EquipmentSnapshot
    inventory: ItemInstanceSnapshot[]
    /** Equipped light visibly carried by a living character. */
    lightSource?: LightSourceKind
}
