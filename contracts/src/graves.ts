import type { Vector2 } from './index'

export const GRAVE_SPAWN_INTERVAL_MS = 10 * 60_000
export const GRAVE_MAX_LIVING = 3

/** A semantic authored or resolved world source, independent of its rendered sprite. */
export interface GraveSourceDefinition {
    id: string
    locationId: string
    position: Vector2
}

/** A dynamic grave marker; its loot container and spawned actors are independent. */
export type WorldGraveSnapshot = GraveSourceDefinition
