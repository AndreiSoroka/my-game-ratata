import { MOVEMENT_RULES, type Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { walkingTime } from './combatMovement'
import { constellationModifiers } from './constellationModifiers'
import { effectiveMoveSpeed } from './effectiveParameters'
import { distance, moveToward } from './math'
import type { MovementContext } from './movement'
import { openPathDoor } from './worldDoors'

export function nextPosition(
    context: MovementContext,
    dashMs: number,
    slow: number
): Vector2 {
    const { character, deltaMs, navigation, now } = context
    if (dashMs > 0) {
        const step =
            (effectiveMoveSpeed(character) *
                MOVEMENT_RULES.dashSpeedMultiplier *
                slow *
                dashMs) /
            1000
        return navigation.moveWithCollision(character.position, {
            x: character.movement.dashDirection.x * step,
            y: character.movement.dashDirection.y * step,
        })
    }
    const step =
        (movementSpeed(character) *
            slow *
            walkingTime(character, now, deltaMs)) /
        1000
    const input = character.getMoveInput()
    if (input.x !== 0 || input.y !== 0) {
        return navigation.moveWithCollision(character.position, {
            x: input.x * step,
            y: input.y * step,
        })
    }
    return advancePath(context, step)
}

export function movementSpeed(character: GameCharacter): number {
    const multiplier =
        character.movement.mode === 'sneaking'
            ? MOVEMENT_RULES.sneakSpeedMultiplier *
              constellationModifiers(character).sneakSpeedMultiplier
            : 1
    return effectiveMoveSpeed(character) * multiplier
}

function advancePath(context: MovementContext, step: number): Vector2 {
    const { character, navigation, idleDestination, now } = context
    const waypoint = character.nextPathPoint()
    const target = waypoint ?? idleDestination
    if (target === undefined) {
        return { ...character.position }
    }
    if (waypoint !== undefined && step > 0) {
        const opened = openPathDoor(character, navigation, waypoint, now)
        if (opened !== undefined && opened.length > 0) {
            context.onEvents?.(opened)
        }
    }
    const next = moveToward(character.position, target, step)
    const moved = navigation.moveWithCollision(character.position, {
        x: next.x - character.position.x,
        y: next.y - character.position.y,
    })
    if (waypoint !== undefined && distance(moved, waypoint) <= 1) {
        character.completePathPoint()
        return waypoint
    }
    return moved
}
