import type { AbilityId } from './abilities'
import type { Vector2 } from './index'

export interface AttackZone {
    maxX: number
    maxY: number
    minX: number
    minY: number
    ownerId: string
}

export type AttackDelivery = 'melee_physical' | 'ranged_physical' | 'magic'
export type AttackOrigin = 'basic' | 'ability' | 'counter'

/** Exact server-authored footprint. Clients draw it; the server resolves contacts. */
export type AttackGeometry =
    | { kind: 'rectangles'; zones: AttackZone[] }
    | {
          kind: 'sector'
          center: Vector2
          radius: number
          direction: Vector2
          angleDegrees: number
      }
    | { kind: 'circle'; center: Vector2; radius: number }

export interface CombatActionSnapshot {
    id: string
    origin: AttackOrigin
    abilityId?: AbilityId
    startedAt: number
    hitAt: number
    readyAt: number
    movementAt: number
    geometry: AttackGeometry
}

export interface BladeComboSnapshot {
    stacks: number
    limit: number
    expiresAt: number
}

export interface CharacterCombatSnapshot {
    action?: CombatActionSnapshot | null
    defensiveStance: boolean
    /** Private projection: never sent to another identity. */
    combo?: BladeComboSnapshot
}
