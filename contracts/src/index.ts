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

export interface CharacterSnapshot {
    alive: boolean
    animation: CharacterAnimationSnapshot
    archetype: CharacterArchetype
    attackZones: AttackZone[]
    controllerKind: CharacterControllerKind
    cooldowns: CharacterCooldownsSnapshot
    facing: CharacterFacing
    faction: CharacterFactionId
    hp: number
    id: string
    maxHp: number
    nickname: string
    path: Vector2[]
    position: Vector2
    reputation: CharacterReputation
    resources: CharacterResourcesSnapshot
    tags: string[]
    velocity: Vector2
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

export interface ChatClientMessage {
    text: string
    type: 'chat'
}

export type ClientMessage =
    | AttackClientMessage
    | ChatClientMessage
    | JoinClientMessage
    | MoveInputClientMessage
    | MoveToClientMessage

export interface WorldSnapshot {
    characters: CharacterSnapshot[]
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
    'attack' | 'chat' | 'damage' | 'death' | 'join' | 'leave' | 'respawn'

export interface GameEventPayload {
    amount?: number
    actorId?: string
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
