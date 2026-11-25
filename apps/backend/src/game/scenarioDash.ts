import { MOVEMENT_RULES, type Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    effectiveDashDuration,
    effectiveMoveSpeed,
} from './effectiveParameters'
import { distance, normalize } from './math'
import { handleMovementCommand, movementActionAllowed } from './movementActions'
import type { NavigationService } from './navigation'
import type { GameRoom } from './room'

export function tryScenarioDash(
    actor: GameCharacter,
    room: GameRoom,
    now: number
): boolean {
    const command = { type: 'dash' as const }
    if (
        !movementActionAllowed(actor, command, now) ||
        !clearDashRoute(actor, room.navigationFor(actor))
    ) {
        return false
    }
    const events = handleMovementCommand(actor, command, now)
    room.publishEvents(events)
    return events.some((event) => event.kind === 'dash')
}

function clearDashRoute(
    actor: GameCharacter,
    navigation: NavigationService
): boolean {
    const first = actor.nextPathPoint()
    if (first === undefined || distance(first, actor.position) < 0.01) {
        return false
    }
    const input = actor.getMoveInput()
    if (input.x !== 0 || input.y !== 0) {
        return false
    }
    const direction = normalize({
        x: first.x - actor.position.x,
        y: first.y - actor.position.y,
    })
    const travel =
        (effectiveMoveSpeed(actor) *
            MOVEMENT_RULES.dashSpeedMultiplier *
            effectiveDashDuration(actor)) /
        1000
    return (
        fitsStraightPrefix(
            actor.remainingPath(),
            actor.position,
            direction,
            travel
        ) &&
        noDoorOrCollision(navigation, actor.position, {
            x: direction.x * travel,
            y: direction.y * travel,
        })
    )
}

function fitsStraightPrefix(
    path: Vector2[],
    origin: Vector2,
    direction: Vector2,
    travel: number
): boolean {
    let lastDistance = 0
    for (const point of path) {
        const x = point.x - origin.x
        const y = point.y - origin.y
        const along = x * direction.x + y * direction.y
        if (
            along <= lastDistance ||
            Math.abs(x * direction.y - y * direction.x) > 0.01
        ) {
            return false
        }
        if (along >= travel) {
            return true
        }
        lastDistance = along
    }
    return false
}

function noDoorOrCollision(
    navigation: NavigationService,
    origin: Vector2,
    delta: Vector2
): boolean {
    let crossesDoor = navigation.doorAt(origin) !== undefined
    const expected = { x: origin.x + delta.x, y: origin.y + delta.y }
    const moved = navigation.moveWithCollision(
        origin,
        delta,
        (_from, point) => {
            crossesDoor ||= navigation.doorAt(point) !== undefined
        }
    )
    return !crossesDoor && distance(moved, expected) < 0.01
}
