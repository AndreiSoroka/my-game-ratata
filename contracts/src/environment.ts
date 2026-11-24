import type { Vector2 } from './index'
import type { LocalizedMessage } from './locales'

export * from './environmentGeometry'

export type WorldObjectKind =
    'sign' | 'barrel' | 'water' | 'bell' | 'quest_board' | 'door'
export type DoorState = 'open' | 'closed' | 'locked'
export type DoorAction = 'open' | 'close' | 'knock'

export const DOOR_INTERACTION_RANGE = 48

export interface WorldObjectBounds {
    x: number
    y: number
    width: number
    height: number
}

export interface WorldObjectSnapshot {
    bell?: { state: import('./cityState').CityBellState; activationId?: string }
    door?: { state: DoorState }
    id: string
    kind: WorldObjectKind
    name: string
    nameMessage?: LocalizedMessage
    position: Vector2
    bounds: WorldObjectBounds
    /** Exact compound footprint. Bounds alone is only its enclosing rectangle. */
    interactionAreas?: WorldObjectBounds[]
    depleted: boolean
}

export interface WorldObjectClientMessage {
    type: 'world_interact'
    objectId: string
    doorAction?: DoorAction
}

export function doorActionForState(state: DoorState): DoorAction {
    if (state === 'locked') {
        return 'knock'
    }
    return state === 'open' ? 'close' : 'open'
}

/** Authored entrances face south, with an interior approach for unlocked doors. */
export function doorApproachPoints(
    bounds: WorldObjectBounds,
    state: DoorState
) {
    const x = bounds.x + bounds.width / 2
    const outside = { x, y: bounds.y + bounds.height + 1 }
    return state === 'locked' ? [outside] : [outside, { x, y: bounds.y - 1 }]
}
