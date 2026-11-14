import type { WorldObjectBounds } from './environment'
import type {
    CharacterFacing,
    CharacterVisualId,
    ItemId,
    ItemInstanceSnapshot,
    Vector2,
} from './index'

export type ContainerKind = 'chest' | 'barrel' | 'corpse'
export interface ContainerContentsDefinition {
    itemId: ItemId
    quantity: number
}
export interface AuthoredContainerDefinition {
    id: string
    kind: 'barrel'
    title: string
    propId: string
    bounds: WorldObjectBounds
    contents: ContainerContentsDefinition[]
}

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
    | { type: 'take_chest_gold'; chestId: string }

export interface CorpseAppearance {
    characterId: string
    visualId: CharacterVisualId
    facing: CharacterFacing
}

export interface ChestContainerSnapshot {
    kind?: ContainerKind
    title?: string
    gold?: number
    chestId: string
    items: ItemInstanceSnapshot[]
}

/** Distance to the physical chest footprint, not its tall visual sprite. */
export function chestInteractionDistance(
    actor: Vector2,
    chest: Vector2,
    bounds = containerBounds(chest)
): number {
    return Math.hypot(
        Math.max(0, bounds.x - actor.x, actor.x - bounds.x - bounds.width),
        Math.max(0, bounds.y - actor.y, actor.y - bounds.y - bounds.height)
    )
}

export function containerBounds(position: Vector2): WorldObjectBounds {
    const half = CHEST_FOOTPRINT_SIZE / 2
    return {
        x: position.x - half,
        y: position.y - half,
        width: CHEST_FOOTPRINT_SIZE,
        height: CHEST_FOOTPRINT_SIZE,
    }
}
