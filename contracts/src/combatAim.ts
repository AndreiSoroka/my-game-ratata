import { ABILITY_DEFINITIONS } from './abilities'
import type { CharacterFacing, Vector2 } from './index'

export const SHOT_HALF_WIDTH = 11.2
export interface ProjectilePath {
    origin: Vector2
    endpoint: Vector2
}

/** A visual/rule projection from authoritative facing; no target selection. */
export function forwardShot(
    position: Vector2,
    facing: CharacterFacing
): ProjectilePath {
    const axis: Record<CharacterFacing, Vector2> = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
    }
    const direction = axis[facing],
        range = ABILITY_DEFINITIONS.shot.range
    return {
        origin: { ...position },
        endpoint: {
            x: position.x + direction.x * range,
            y: position.y + direction.y * range,
        },
    }
}
