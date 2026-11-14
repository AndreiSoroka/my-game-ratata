import type { Vector2 } from './index'

export * from './environmentGeometry'

export type WorldObjectKind = 'sign' | 'barrel' | 'water'

export interface WorldObjectBounds {
    x: number
    y: number
    width: number
    height: number
}

export interface WorldObjectSnapshot {
    id: string
    kind: WorldObjectKind
    name: string
    position: Vector2
    bounds: WorldObjectBounds
    /** Exact compound footprint. Bounds alone is only its enclosing rectangle. */
    interactionAreas?: WorldObjectBounds[]
    depleted: boolean
}

export interface WorldObjectClientMessage {
    type: 'world_interact'
    objectId: string
}
