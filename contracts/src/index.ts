import type { CreatureType } from './creatures'
export * from './creatures'
import type { ChestClientMessage, ChestContainerSnapshot } from './chests'
export * from './chests'
export * from './inventory'
import type {
    EquipmentActionKind,
    EquipmentSlotId,
    InventoryActionKind,
    ItemId,
} from './inventory'
import type { CharacterTheftSnapshot, TheftClientMessage } from './theft'
export * from './theft'
import type {
    CharacterMovementSnapshot,
    MovementClientMessage,
} from './movement'
export * from './movement'
import type { GameEventPayload } from './events'
export type * from './events'
import type { PartyClientMessage, PartySnapshot } from './party'
export type * from './party'
import type { CompanionClientMessage, SoulSnapshot } from './soul'
export type * from './soul'
import type {
    ProgressionClientMessage,
    ProgressionSnapshot,
} from './progression'
export * from './progression'
import type { WorldLocation } from './world'
export * from './world'
import type { CharacterLifeSnapshot, HeroClass } from './life'
export * from './life'
import type { AdventureClientMessage, AdventureSnapshot } from './adventure'
export type * from './adventure'
export * from './farming'
export * from './farms'

import type { ContractProtocolVersion } from './service'
export type { PlayerIdentity, WorldPosition } from './identity'
export * from './service'

export interface Vector2 {
    x: number
    y: number
}

export type CharacterFacing = 'up' | 'down' | 'left' | 'right'

export type CharacterArchetype = 'human' | 'skeleton' | 'slime'

export type CharacterControllerKind = 'network_player' | 'mob1' | 'scripted'

export type CharacterFactionId = 'monsters' | 'peaceful'

export const characterVisualIds = [
    'female_mage',
    'female_player',
    'male_mage',
    'male_player_2',
    'player',
    'skeleton',
    'skeleton_mace',
    'skeleton_swordless',
    'slime',
    'zombie',
    'zombie_mage',
] as const

export type CharacterVisualId = (typeof characterVisualIds)[number]

export type CharacterReputation = Partial<Record<CharacterFactionId, number>>

export type CharacterAnimationAction =
    'idle' | 'walk' | 'attack' | 'damaged' | 'death'

export interface AttackZone {
    maxX: number
    maxY: number
    minX: number
    minY: number
    ownerId: string
}

export interface CharacterResourcesSnapshot {
    energy: number
    mana: number
    maxEnergy: number
    maxMana: number
}

export interface CharacterCooldownsSnapshot {
    attackMsLeft: number
    respawnMsLeft: number
    stunMsLeft: number
}

export interface CharacterAnimationSnapshot {
    action: CharacterAnimationAction
    startedAt: number
}

export interface ItemInstanceSnapshot {
    quantity?: number
    instanceId: string
    itemId: ItemId
}

export type EquipmentSnapshot = Partial<
    Record<EquipmentSlotId, ItemInstanceSnapshot>
>

export interface CharacterStatsSnapshot {
    attackCooldownMs: number
    critChance: number
    dodgeChance: number
    maxDamage: number
    minDamage: number
    moveSpeed: number
}

export interface CharacterSnapshot {
    creatureType: CreatureType
    theft?: CharacterTheftSnapshot
    movement?: CharacterMovementSnapshot
    soul?: SoulSnapshot
    progression?: ProgressionSnapshot
    heroClass?: HeroClass | null
    level?: number
    xp?: number
    xpToNext?: number
    life?: CharacterLifeSnapshot
    alive: boolean
    animation: CharacterAnimationSnapshot
    archetype: CharacterArchetype
    attackZones: AttackZone[]
    controllerKind: CharacterControllerKind
    cooldowns: CharacterCooldownsSnapshot
    equipment: EquipmentSnapshot
    facing: CharacterFacing
    faction: CharacterFactionId
    hp: number
    id: string
    inventory: ItemInstanceSnapshot[]
    maxHp: number
    nickname: string
    path: Vector2[]
    position: Vector2
    reputation: CharacterReputation
    resources: CharacterResourcesSnapshot
    stats: CharacterStatsSnapshot
    tags: string[]
    velocity: Vector2
    visualId: CharacterVisualId
}

export interface WorldItemSnapshot {
    quantity?: number
    id: string
    itemId: ItemId
    position: Vector2
}

export type WorldChestState = 'closed' | 'open'

export interface WorldChestSnapshot {
    id: string
    itemCount: number
    position: Vector2
    state: WorldChestState
}

export interface MapSummary {
    height: number
    id: string
    solidLayerNames: string[]
    tileHeight: number
    tileWidth: number
    width: number
    worldHeight: number
    worldWidth: number
}

export interface JoinClientMessage {
    heroClass?: HeroClass
    archetype?: CharacterArchetype
    nickname: string
    type: 'join'
}

export interface MoveInputClientMessage {
    axis: Vector2
    type: 'move_input'
}

export interface MoveToClientMessage {
    target: Vector2
    type: 'move_to'
}

export interface AttackClientMessage {
    type: 'attack'
}

export interface PickupItemClientMessage {
    type: 'pickup_item'
    worldItemId?: string
}

export interface InventoryActionClientMessage {
    action: InventoryActionKind
    itemInstanceId: string
    type: 'inventory_action'
}

export interface EquipmentActionClientMessage {
    action: EquipmentActionKind
    slot: EquipmentSlotId
    type: 'equipment_action'
}

export interface ChatClientMessage {
    text: string
    type: 'chat'
}

export type ClientMessage =
    | ChestClientMessage
    | TheftClientMessage
    | MovementClientMessage
    | PartyClientMessage
    | CompanionClientMessage
    | ProgressionClientMessage
    | { type: 'revive'; targetId: string }
    | AdventureClientMessage
    | AttackClientMessage
    | ChatClientMessage
    | EquipmentActionClientMessage
    | InventoryActionClientMessage
    | JoinClientMessage
    | MoveInputClientMessage
    | MoveToClientMessage
    | PickupItemClientMessage

export interface WorldSnapshot {
    chest?: ChestContainerSnapshot | null
    party?: PartySnapshot
    location?: WorldLocation
    adventure?: AdventureSnapshot
    chests: WorldChestSnapshot[]
    characters: CharacterSnapshot[]
    items: WorldItemSnapshot[]
    serverTime: number
    tick: number
}

export interface WorldInitServerMessage {
    map: MapSummary
    playerId: string
    protocolVersion: ContractProtocolVersion
    snapshot: WorldSnapshot
    tickMs: number
    type: 'world_init'
}

export interface GameEventServerMessage {
    event: GameEventPayload
    serverTime: number
    type: 'event'
}

export interface SnapshotServerMessage {
    snapshot: WorldSnapshot
    type: 'snapshot'
}

export interface ErrorServerMessage {
    code: string
    message: string
    type: 'error'
}

export type ServerMessage =
    | ErrorServerMessage
    | GameEventServerMessage
    | SnapshotServerMessage
    | WorldInitServerMessage
