import type { AbilityId, PrayerIntent } from './abilities'
import type { Vector2 } from './index'

export type CharacterRelationship = 'self' | 'friendly' | 'hostile'

export type CharacterAutoAction =
    | {
          kind: 'attack'
          targetId?: string
          target?: import('./graves').WorldCombatTarget
      }
    | {
          kind: 'ability'
          abilityId: Exclude<AbilityId, 'pray'>
          targetId?: string
          target?: import('./graves').WorldCombatTarget
      }
    | { kind: 'prayer'; intent: PrayerIntent }
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
