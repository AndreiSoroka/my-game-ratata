import type { HealthSnapshot } from './health'
import type { Vector2, WorldObjectBounds } from './index'

export const GRAVE_SPAWN_INTERVAL_MS = 10 * 60_000
export const GRAVE_MAX_LIVING = 3
export const GRAVE_MAX_HP = 100
export const GRAVE_RESTORE_MS = 30 * 60_000
export const GRAVE_PURIFY_CAST_MS = 3_000
export const GRAVE_RUINED_PURIFY_CAST_MS = 3_000
export const GRAVE_PURIFY_MANA_COST = 5
export const GRAVE_PURIFY_STEPS = 5
export const GRAVE_PURIFY_BASE_CHANCE = 0.2
export const GRAVE_PURIFY_RANGE = 48
export const GRAVE_INTERACTION_RANGE = 48
export const GRAVE_FOOTPRINT_SIZE = 16

/** Purification uses the ordinary prayer channel in either grave phase. */
export function gravePurifyCastMs(phase: WorldGraveSnapshot['phase']): number {
    return phase === 'ruined'
        ? GRAVE_RUINED_PURIFY_CAST_MS
        : GRAVE_PURIFY_CAST_MS
}

export function graveBounds(position: Vector2): WorldObjectBounds {
    return {
        x: position.x - 8,
        y: position.y - 8,
        width: GRAVE_FOOTPRINT_SIZE,
        height: GRAVE_FOOTPRINT_SIZE,
    }
}

export interface WorldCombatTarget {
    kind: 'grave'
    id: string
}

/** A semantic authored or resolved world source, independent of its rendered sprite. */
export interface GraveSourceDefinition {
    id: string
    locationId: string
    position: Vector2
    propId?: string
}

/** A dynamic grave marker; its loot container and spawned actors are independent. */
export interface WorldGraveSnapshot extends GraveSourceDefinition {
    phase: 'active' | 'ruined' | 'purified'
    material: 'stone'
    purification?: { completed: number; required: number }
    health: HealthSnapshot
    restoresAt?: number
}
