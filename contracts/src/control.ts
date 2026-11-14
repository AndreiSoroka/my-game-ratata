import type { AbilityId, PrayerIntent } from './abilities'

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

export type AutoActionWaiting =
    'cooldown' | 'resources' | 'range' | 'action' | null

export interface CharacterControlSnapshot {
    mode: 'none' | 'follow' | 'attack' | 'action'
    targetId: string | null
    action?: CharacterAutoAction
    waiting?: AutoActionWaiting
}

export type CharacterControlCommand =
    | { type: 'auto_action'; action: CharacterAutoAction | null }
    | { type: 'auto_attack'; targetId: string | null }
    | { type: 'follow'; targetId: string | null }
    | { type: 'cancel_control' }
