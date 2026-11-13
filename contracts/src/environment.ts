import type { Vector2 } from './index'

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
    depleted: boolean
}

export interface WorldObjectClientMessage {
    type: 'world_interact'
    objectId: string
}
