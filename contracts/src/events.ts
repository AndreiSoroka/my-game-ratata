import type { AbilityId, DamageKind } from './abilities'
import type { ProjectilePath } from './combatAim'
import type { ItemId } from './index'

export type CombatHitQuality =
    'miss' | 'weak' | 'normal' | 'strong' | 'critical'

export type GameEventKind =
    | 'resource_gather'
    | 'tree_plant'
    | 'heal'
    | 'absorb'
    | 'cast'
    | 'status'
    | 'miss'
    | 'attack'
    | 'dash'
    | 'chat'
    | 'chest_open'
    | 'water_drink'
    | 'barrel_search'
    | 'farm_sow'
    | 'farm_harvest'
    | 'damage'
    | 'world_damage'
    | 'grave_ruined'
    | 'grave_purified'
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
    hitQuality?: CombatHitQuality
    /** Server-pinned projectile path for a shot with no selected target. */
    projectile?: ProjectilePath
    /** New utterance receipt; repeated text receives a new value. */
    speechId?: number
    abilityId?: AbilityId
    damageKind?: DamageKind
    critical?: boolean
    statusId?: 'stun' | 'barrier' | 'reviving'
    expiresAt?: number
    /** Fixed authoritative action duration, including phase-dependent rituals. */
    durationMs?: number
    phase?: 'started' | 'completed' | 'interrupted'

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
}
