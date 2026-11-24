import type { AbilityId, DamageKind } from './abilities'
import type { ProjectilePath } from './combatAim'
import type { ItemId, Vector2 } from './index'

export type CombatHitQuality =
    'miss' | 'weak' | 'normal' | 'strong' | 'critical'

/** Audible range in world pixels for each short world effect. */
export const WORLD_SOUND_RADII = {
    chestOpen: 160,
    pickup: 120,
    drop: 160,
    attack: 240,
    hit: 240,
    drink: 120,
    chop: 240,
    mine: 240,
    harvest: 120,
    bell: 640,
    doorOpen: 160,
    doorClose: 160,
    doorKnock: 160,
} as const

export type WorldSoundEffect = keyof typeof WORLD_SOUND_RADII

export interface WorldAudioCue {
    id: string
    effect: WorldSoundEffect
    locationId: string
    position: Vector2
    obstructed?: true
}

export type GameEventKind =
    | 'bell_activate'
    | 'door_interact'
    | 'resource_gather'
    | 'tree_plant'
    | 'heal'
    | 'absorb'
    | 'cast'
    | 'status'
    | 'parry'
    | 'miss'
    | 'attack'
    | 'dash'
    | 'chat'
    | 'npc_request_status'
    | 'chest_open'
    | 'water_drink'
    | 'barrel_search'
    | 'farm_sow'
    | 'farm_harvest'
    | 'damage'
    | 'world_damage'
    | 'grave_ruined'
    | 'grave_purified'
    | 'grave_purification_progress'
    | 'grave_restored'
    | 'death'
    | 'item_drop'
    | 'item_eat'
    | 'item_equip'
    | 'item_pickup'
    | 'item_stash'
    | 'join'
    | 'leave'
    | 'respawn'
    | 'notice'
    | 'permadeath'
    | 'revive'
    | 'level_up'
    | 'skill_up'

export interface GameEventPayload {
    /** A server-projected world sound for this listener. */
    audioCue?: WorldAudioCue
    actionId?: string
    locationId?: string
    attackOrigin?: import('./combat').AttackOrigin
    delivery?: import('./combat').AttackDelivery
    attackGeometry?: import('./combat').AttackGeometry
    objectId?: string
    eventId?: string
    position?: import('./index').Vector2
    /** Server-authored status earned by a successful private worker inspection. */
    workerActivity?: import('./workerRequests').WorkerActivitySnapshot
    requestStatus?: import('./social').NpcRequestStatus
    noticeKind?: 'dash_rejected' | 'prayer_unanswered'
    speakerName?: string
    channel?: import('./social').SpeechChannel
    hitQuality?: CombatHitQuality
    /** Server-authored projectile path when the launch direction is fixed. */
    projectile?: ProjectilePath
    /** New utterance receipt; repeated text receives a new value. */
    speechId?: number
    /** Live NPC speech projected only to an authorized listener. */
    voice?: 'dialogue' | 'ambient'
    /** Language of the original utterance when known. */
    language?: import('./locales').GameLocale
    abilityId?: AbilityId
    damageKind?: DamageKind
    critical?: boolean
    statusId?:
        'stun' | 'barrier' | 'reviving' | 'defensive_stance' | 'ash_exhaustion'
    expiresAt?: number
    /** Fixed authoritative action duration, including phase-dependent rituals. */
    durationMs?: number
    phase?: 'started' | 'completed' | 'interrupted'
    /** A successful standalone devotional action, with no ongoing cast. */
    castMode?: 'devotion'

    /** Authoritative recipient filter; stripped before sending over a socket. */
    audienceIds?: string[]
    amount?: number
    actorId?: string
    chestId?: string
    plotId?: string
    itemId?: ItemId
    kind: GameEventKind
    targetId?: string
    target?: import('./graves').WorldCombatTarget
    text?: string
    textMessage?: import('./locales').LocalizedMessage
}
