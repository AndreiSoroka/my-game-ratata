import {
    type GameEventPayload,
    MOVEMENT_RULES,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { constellationModifiers } from './constellationModifiers'
import { effectiveMoveSpeed } from './effectiveParameters'
import { wearWalkingEquipment } from './itemDurability'
import { distance, moveToward, zeroVector } from './math'
import { cancelMovementMode } from './movementActions'
import { type MovementNoise, movementNoise } from './movementNoise'
import type { NavigationService } from './navigation'
import { boundedPursuitStep } from './pursuitMovement'
import { confirmResourceSpend } from './resourcePractice'

interface MovementContext {
    character: GameCharacter
    deltaMs: number
    navigation: NavigationService
    now: number
    onNoise?: (noise: MovementNoise) => void
    onEvents?: (events: GameEventPayload[]) => void
}

export function advanceCharacter(
    context: MovementContext
): GameEventPayload | undefined {
    const { character, deltaMs, now } = context
    const wasAlive = character.alive
    character.tickTimedState(now)
    if (!wasAlive && character.alive) {
        return { actorId: character.id, kind: 'respawn' }
    }
    if (
        !character.alive ||
        character.tags.has('offline') ||
        character.stunUntil > now
    ) {
        character.velocity = zeroVector()
        cancelMovementMode(character)
        return undefined
    }
    if (character.isActionLocked(now)) {
        character.velocity = zeroVector()
        character.movement.dashUntil = 0
        const events = character.applyRegen(deltaMs, false, true, now)
        context.onEvents?.(events)
        return undefined
    }
    moveCharacter(context)
    return undefined
}

function moveCharacter(context: MovementContext): void {
    const { character, deltaMs, now, navigation } = context
    const before = { ...character.position }
    const dashMs = dashTime(character, now, deltaMs)
    character.position = boundedPursuitStep(
        character,
        before,
        nextPosition(context, dashMs),
        now
    )
    const traveled = distance(before, character.position)
    if (dashMs > 0 && traveled > 0) {
        confirmResourceSpend(character.movement.dashResourceSpend)
        delete character.movement.dashResourceSpend
    }
    wearWalkingEquipment(character, traveled)
    character.velocity = {
        x: character.position.x - before.x,
        y: character.position.y - before.y,
    }
    character.updateFacing(character.velocity)
    const moving = traveled > 0
    const noise = movementNoise(
        character,
        navigation,
        traveled,
        dashMs > 0,
        now
    )
    if (noise !== undefined) {
        context.onNoise?.(noise)
    }
    character.updateMovementAnimation(moving, now)
    const events = character.applyRegen(
        deltaMs,
        moving,
        !moving || dashMs === 0,
        now
    )
    context.onEvents?.(events)
    if (now >= character.movement.dashUntil) {
        character.movement.dashUntil = 0
    }
}

function dashTime(
    character: GameCharacter,
    now: number,
    deltaMs: number
): number {
    const state = character.movement
    return Math.max(
        0,
        Math.min(now, state.dashUntil) -
            Math.max(now - deltaMs, state.dashStartedAt)
    )
}

function nextPosition(context: MovementContext, dashMs: number): Vector2 {
    const { character, deltaMs, navigation } = context
    if (dashMs > 0) {
        const step =
            (effectiveMoveSpeed(character) *
                MOVEMENT_RULES.dashSpeedMultiplier *
                dashMs) /
            1000
        return navigation.moveWithCollision(character.position, {
            x: character.movement.dashDirection.x * step,
            y: character.movement.dashDirection.y * step,
        })
    }
    const step = (movementSpeed(character) * deltaMs) / 1000
    const input = character.getMoveInput()
    if (input.x !== 0 || input.y !== 0) {
        return navigation.moveWithCollision(character.position, {
            x: input.x * step,
            y: input.y * step,
        })
    }
    return advancePath(character, navigation, step)
}

function movementSpeed(character: GameCharacter): number {
    const multiplier =
        character.movement.mode === 'sneaking'
            ? MOVEMENT_RULES.sneakSpeedMultiplier *
              constellationModifiers(character).sneakSpeedMultiplier
            : 1
    return effectiveMoveSpeed(character) * multiplier
}

function advancePath(
    character: GameCharacter,
    navigation: NavigationService,
    step: number
): Vector2 {
    const target = character.nextPathPoint()
    if (target === undefined) {
        return { ...character.position }
    }
    const next = moveToward(character.position, target, step)
    const moved = navigation.moveWithCollision(character.position, {
        x: next.x - character.position.x,
        y: next.y - character.position.y,
    })
    if (distance(moved, target) <= 1) {
        character.completePathPoint()
        return target
    }
    return moved
}
