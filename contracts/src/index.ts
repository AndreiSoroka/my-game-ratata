export const CONTRACT_PROTOCOL_VERSION = '0.1.0'

export type ContractProtocolVersion = typeof CONTRACT_PROTOCOL_VERSION

export type ServiceName = 'backend' | 'frontend'

export interface ServiceHealth {
    checkedAt: string
    protocolVersion: ContractProtocolVersion
    service: ServiceName
    status: 'ok'
}

export interface PlayerIdentity {
    displayName: string
    id: string
}

export interface WorldPosition {
    x: number
    y: number
    z?: number
}

export interface Vector2 {
    x: number
    y: number
}

export type CharacterFacing = 'up' | 'down' | 'left' | 'right'

export type CharacterArchetype = 'human' | 'skeleton' | 'slime'

export type CharacterControllerKind = 'network_player' | 'mob1'

export type CharacterFactionId = 'monsters' | 'peaceful'

export type CharacterReputation = Partial<Record<CharacterFactionId, number>>

export type CharacterAnimationAction =
    'idle' | 'walk' | 'attack' | 'damaged' | 'death'

export const itemIds = ['boots', 'food', 'old_sword', 'simple_sword'] as const

export type ItemId = (typeof itemIds)[number]

export type EquipmentSlotId = 'boots' | 'weapon'

export type InventoryActionKind = 'drop' | 'eat' | 'equip' | 'stash'

export type EquipmentActionKind = 'unequip'

export interface ItemWeaponStats {
    maxDamage: number
    minDamage: number
}

export interface ItemStatBonuses {
    dodgeChance?: number
}

export interface ItemDefinition {
    equipmentSlots?: readonly EquipmentSlotId[]
    healHp?: number
    id: ItemId
    name: string
    statBonuses?: ItemStatBonuses
    weapon?: ItemWeaponStats
}

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
    boots: {
        equipmentSlots: ['boots'],
        id: 'boots',
        name: 'Old Boots',
        statBonuses: {
            dodgeChance: 0.08,
        },
    },
    food: {
        healHp: 10,
        id: 'food',
        name: 'Apple',
    },
    old_sword: {
        equipmentSlots: ['weapon'],
        id: 'old_sword',
        name: 'Old Sword',
        weapon: {
            maxDamage: 6,
            minDamage: 3,
        },
    },
    simple_sword: {
        equipmentSlots: ['weapon'],
        id: 'simple_sword',
        name: 'Simple Sword',
        weapon: {
            maxDamage: 11,
            minDamage: 7,
        },
    },
}

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
}

export interface WorldItemSnapshot {
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
    | AttackClientMessage
    | ChatClientMessage
    | EquipmentActionClientMessage
    | InventoryActionClientMessage
    | JoinClientMessage
    | MoveInputClientMessage
    | MoveToClientMessage
    | PickupItemClientMessage

export interface WorldSnapshot {
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

export type GameEventKind =
    | 'attack'
    | 'chat'
    | 'chest_open'
    | 'damage'
    | 'death'
    | 'item_drop'
    | 'item_eat'
    | 'item_equip'
    | 'item_pickup'
    | 'item_stash'
    | 'join'
    | 'leave'
    | 'respawn'

export interface GameEventPayload {
    amount?: number
    actorId?: string
    chestId?: string
    itemId?: ItemId
    kind: GameEventKind
    targetId?: string
    text?: string
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
