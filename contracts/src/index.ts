export * from './backgrounds'
import type { EquipmentSnapshot, ItemInstanceSnapshot } from './inventoryTypes'
export type * from './inventoryTypes'
import type {
    AbilityClientMessage,
    BasicAttackKind,
    CharacterAbilitiesSnapshot,
} from './abilities'
export * from './abilities'
export * from './combat'
import type { AttackZone } from './combat'
export * from './ash'
export * from './combatAim'
export * from './development'
export * from './discipline'
export * from './mastery'
export * from './prayer'
export * from './prayerPreview'
export * from './questRewards'
export * from './questTrophies'
export * from './resurrection'
export * from './stealthTheftBonuses'
export * from './workerRequests'
import type { PlantTreePreviewCommand } from './planting'
export * from './planting'
import type {
    CharacterControlCommand,
    CharacterControlSnapshot,
    CharacterRelationship,
} from './control'
import type { CreatureType } from './creatures'
export * from './control'
import type { AutomationCommand } from './scenarios'
export * from './creatures'
export * from './scenarios'
import type {
    ChestClientMessage,
    ContainerKind,
    CorpseAppearance,
} from './chests'
export * from './chests'
export type * from './cityState'
export * from './craftOrders'
export * from './economy'
export * from './farmSupply'
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
export type * from './events'
export * from './movement'
import type { PartyClientMessage } from './party'
export type * from './party'
import type { CompanionClientMessage, SoulSnapshot } from './soul'
export * from './soul'
import type {
    ProgressionClientMessage,
    ProgressionSnapshot,
} from './progression'
export * from './progression'
export * from './snapshots'
export type * from './viewport'
export * from './world'
import type { CharacterLifeSnapshot, HeroClass } from './life'
export * from './life'
import type { UsePortalCommand } from './magic'
export * from './magic'
import type { AdventureClientMessage } from './adventure'
export type * from './adventure'
export { BASE_STOCK_MERCHANT_IDS } from './adventure'
export * from './environmentGeometry'
import type { WorldObjectBounds } from './environment'
export * from './farming'
export * from './farms'
export * from './graves'
import type { HealthSnapshot } from './health'
export * from './health'
import type { CharacterResourceChecks, ResourceSnapshot } from './resources'
export * from './exchange'
import type { JoinClientMessage } from './identity'
export * from './authoredText'
export type {
    JoinClientMessage,
    PlayerIdentity,
    WorldPosition,
} from './identity'
export * from './locales'
export * from './materials'
export { NPC_ENGLISH_NAMES } from './npcNames'
export * from './npcQuests'
export * from './npcQuestText'
export * from './pursuit'
export * from './resources'
export * from './service'
export * from './social'
export * from './training'
export * from './trees'
export * from './worldSignText'
import type { ExchangeClientMessage } from './exchange'
import type { NpcQuestClientMessage } from './npcQuests'
import type { CharacterInteractions, WhisperClientMessage } from './social'

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
    'necromancer',
    'player',
    'skeleton',
    'skeleton_mace',
    'skeleton_swordless',
    'slime',
    'zombie',
    'training_dummy',
    'zombie_mage',
] as const

export type CharacterVisualId = (typeof characterVisualIds)[number]

export type CharacterReputation = Partial<Record<CharacterFactionId, number>>

export type CharacterAnimationAction =
    'idle' | 'walk' | 'attack' | 'damaged' | 'death'

export interface CharacterResourcesSnapshot {
    energy: ResourceSnapshot
    mana: ResourceSnapshot
}

export interface CharacterCooldownsSnapshot {
    attackMsLeft: number
    respawnMsLeft: number
    stunMsLeft: number
}

export interface CharacterAnimationSnapshot {
    /** Server-authored action phases; absent on looping or legacy animations. */
    durationMs?: number
    hitAt?: number
    movementAt?: number
    action: CharacterAnimationAction
    startedAt: number
}

export interface CharacterStatsSnapshot {
    attackCooldownMs: number
    critChance: number
    dodgeChance: number
    maxDamage: number
    minDamage: number
    moveSpeed: number
}

export interface CharacterSnapshot {
    workerActivity?: import('./workerRequests').WorkerActivitySnapshot
    interactions?: CharacterInteractions
    trainingTarget?: { areaId: string }
    connected?: boolean
    relationship?: CharacterRelationship
    personalHostile?: boolean
    control?: CharacterControlSnapshot
    combat?: import('./combat').CharacterCombatSnapshot
    basicAttackKind?: BasicAttackKind
    abilities?: CharacterAbilitiesSnapshot
    creatureType: CreatureType
    theft?: CharacterTheftSnapshot
    movement?: CharacterMovementSnapshot
    /** Active prayer aura effects are visible only to this character. */
    prayerAuraEffects?: ReadonlyArray<import('./prayer').PrayerAuraEffectId>
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
    health: HealthSnapshot
    id: string
    inventory: ItemInstanceSnapshot[]
    nickname: string
    path: Vector2[]
    position: Vector2
    reputation: CharacterReputation
    resources: CharacterResourcesSnapshot
    resourceChecks?: CharacterResourceChecks
    /** Internal raw snapshots may contain stats; observer projections remove them. */
    stats?: CharacterStatsSnapshot
    characterSheet?: import('./development').CharacterSheetSnapshot
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
    kind?: ContainerKind
    title?: string
    propId?: string
    bounds?: WorldObjectBounds
    corpse?: CorpseAppearance
    /** Finalized remains available for a shared Ash ritual. */
    raisable?: true
    /** The corpse has only ritual remains. Ordinary loot has already been taken. */
    ashOnly?: true
    id: string
    itemCount: number
    position: Vector2
    state: WorldChestState
}

export interface MapSummary {
    asset: { url: string; revision: string }
    height: number
    id: string
    solidLayerNames: string[]
    tileHeight: number
    tileWidth: number
    width: number
    worldHeight: number
    worldWidth: number
}

export interface MoveInputClientMessage {
    axis: Vector2
    type: 'move_input'
}

export interface MoveToClientMessage {
    append?: boolean
    target: Vector2
    type: 'move_to'
}

export interface AttackClientMessage {
    type: 'attack'
    targetId?: string
    target?: import('./graves').WorldCombatTarget
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

export type ChatClientMessage = import('./social').ChatClientMessage

export type ClientMessage =
    | { type: 'snapshot_resync' }
    | import('./viewport').SetViewportClientMessage
    | import('./social').SpeechActivityCommand
    | { type: 'set_locale'; locale: import('./locales').GameLocale }
    | { type: 'set_personal_hostility'; targetId: string; hostile: boolean }
    | WhisperClientMessage
    | ExchangeClientMessage
    | NpcQuestClientMessage
    | PlantTreePreviewCommand
    | AutomationCommand
    | CharacterControlCommand
    | AbilityClientMessage
    | UsePortalCommand
    | ChestClientMessage
    | TheftClientMessage
    | MovementClientMessage
    | PartyClientMessage
    | CompanionClientMessage
    | ProgressionClientMessage
    | { type: 'revive'; targetId: string }
    | { type: 'abandon_life' }
    | AdventureClientMessage
    | AttackClientMessage
    | ChatClientMessage
    | EquipmentActionClientMessage
    | InventoryActionClientMessage
    | JoinClientMessage
    | MoveInputClientMessage
    | MoveToClientMessage
    | PickupItemClientMessage

export * from './bladeTechniques'
export * from './weapons'
