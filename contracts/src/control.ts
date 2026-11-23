import type {
    AbilityId,
    AshRiteId,
    PrayerActionId,
    PrayerIntent,
} from './abilities'
import type { Vector2 } from './index'

export type CharacterRelationship = 'self' | 'friendly' | 'hostile'

export type CharacterAutoAction =
    | {
          kind: 'attack'
          targetId?: string
          target?: import('./graves').WorldCombatTarget
          once?: never
      }
    | { kind: 'attack'; targetId: string; target?: never; once: true }
    | {
          kind: 'ability'
          abilityId: Exclude<AbilityId, PrayerActionId | AshRiteId>
          targetId?: string
          target?: import('./graves').WorldCombatTarget
      }
    | { kind: 'prayer'; abilityId?: PrayerActionId; intent: PrayerIntent }
    | {
          kind: 'gather'
          nodeId: string
          operation?: 'harvest' | 'clear_stump' | 'cut_sapling'
      }
    | { kind: 'plant_tree'; position: Vector2 }

export type AutoActionWaiting =
    'cooldown' | 'resources' | 'range' | 'action' | null

export interface CharacterRoutePoint {
    number: number
    position: Vector2
}

export interface CharacterRouteSnapshot {
    locationId: string
    points: CharacterRoutePoint[]
    waiting: 'blocked' | null
    /** Authoritative no-progress time left; pauses follow server control locks. */
    remainingFailureMs?: number
}

export interface CharacterControlSnapshot {
    mode: 'none' | 'follow' | 'attack' | 'action' | 'route'
    targetId: string | null
    action?: CharacterAutoAction
    waiting?: AutoActionWaiting
    route?: CharacterRouteSnapshot
}

export type CharacterControlCommand =
    | { type: 'auto_action'; action: CharacterAutoAction | null }
    | { type: 'auto_attack'; targetId: string | null }
    | { type: 'follow'; targetId: string | null }
    | { type: 'cancel_control' }
