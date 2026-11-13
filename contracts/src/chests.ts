import type { ItemInstanceSnapshot, Vector2 } from './index'

export const CHEST_INTERACTION_RANGE = 28
export const CHEST_FOOTPRINT_SIZE = 16

export interface OpenChestClientMessage {
    type: 'open_chest'
    chestId: string
}

export type ChestClientMessage =
    | OpenChestClientMessage
    | { type: 'take_chest_item'; chestId: string; itemInstanceId: string }
    | { type: 'put_chest_item'; chestId: string; itemInstanceId: string }
    | { type: 'take_all_chest_items'; chestId: string }
    | { type: 'close_chest'; chestId: string }

export interface ChestContainerSnapshot {
    chestId: string
    items: ItemInstanceSnapshot[]
}

/** Distance to the physical chest footprint, not its tall visual sprite. */
export function chestInteractionDistance(
    actor: Vector2,
    chest: Vector2
): number {
    const half = CHEST_FOOTPRINT_SIZE / 2
    return Math.hypot(
        Math.max(0, Math.abs(actor.x - chest.x) - half),
        Math.max(0, Math.abs(actor.y - chest.y) - half)
    )
}
