import type { Vector2 } from './index'

export const MAGIC_ABILITY_RULES = {
    chains: { radiusTiles: 3, drainManaPerSecond: 6 },
    blink: { rangeTiles: 3 },
    dispel_magic: { radiusTiles: 7 },
    fireball: { rangeTiles: 10, radiusTiles: 4 },
    greater_fireball: { rangeTiles: 12, radiusTiles: 5 },
} as const

export const CITY_PORTAL_MANA_FRACTION = 0.7
export const PORTAL_INTERACTION_TILES = 2
export const PORTAL_LIFETIME_MS = 60_000

export interface MagicChannelSnapshot {
    abilityId: 'chains' | 'city_portal'
    startedAt: number
    completesAt: number
    radius?: number
}

export type MagicEffectSnapshot =
    | {
          id: string
          abilityId: 'chains'
          center: Vector2
          radius: number
          expiresAt: number
      }
    | {
          id: string
          abilityId: 'fireball' | 'greater_fireball'
          phase: 'flight' | 'impact'
          position: Vector2
          direction: Vector2
          radius: number
          expiresAt: number
      }

export interface PortalEndpointSnapshot {
    id: string
    locationId: string
    position: Vector2
    destinationLocationId: string
    destinationName: string
    expiresAt: number
}

export interface UsePortalCommand {
    type: 'use_portal'
    endpointId: string
}

export function isFireSpell(id: string): id is 'fireball' | 'greater_fireball' {
    return id === 'fireball' || id === 'greater_fireball'
}
