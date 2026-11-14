import { ABILITY_DEFINITIONS } from './abilities'
import type { CharacterFacing, Vector2 } from './index'

export const SHOT_HALF_WIDTH = 11.2
export const SPARK_HALF_WIDTH = 16
export interface ProjectilePath {
    origin: Vector2
    endpoint: Vector2
    halfWidth?: number
}

/** A visual/rule projection from authoritative facing; no target selection. */
export function forwardShot(
    position: Vector2,
    facing: CharacterFacing
): ProjectilePath {
    return projectForward(position, facing, ABILITY_DEFINITIONS.shot.range)
}

export function forwardAbilityAttack(
    position: Vector2,
    facing: CharacterFacing,
    abilityId: 'shot' | 'spark'
): ProjectilePath {
    return {
        ...projectForward(
            position,
            facing,
            ABILITY_DEFINITIONS[abilityId].range
        ),
        halfWidth: abilityId === 'shot' ? SHOT_HALF_WIDTH : SPARK_HALF_WIDTH,
    }
}

function projectForward(
    position: Vector2,
    facing: CharacterFacing,
    range: number
): ProjectilePath {
    const axis: Record<CharacterFacing, Vector2> = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
    }
    const direction = axis[facing]
    return {
        origin: { ...position },
        endpoint: {
            x: position.x + direction.x * range,
            y: position.y + direction.y * range,
        },
    }
}
