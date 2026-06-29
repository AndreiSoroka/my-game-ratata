import type { GameEventPayload, Vector2 } from '@my-game-ratata/contracts'

import { type GameCharacter } from './character'
import { distance, moveToward, zeroVector } from './math'
import { type NavigationService } from './navigation'

interface MovementContext {
    character: GameCharacter
    deltaMs: number
    navigation: NavigationService
    now: number
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

    if (!character.alive || character.stunUntil > now) {
        character.velocity = zeroVector()
        return undefined
    }

    const before = { ...character.position }
    character.position = nextPosition(context)
    character.velocity = {
        x: character.position.x - before.x,
        y: character.position.y - before.y,
    }
    character.updateFacing(character.velocity)
    const isMoving = character.velocity.x !== 0 || character.velocity.y !== 0
    character.updateMovementAnimation(isMoving, now)
    character.applyRegen(deltaMs, isMoving)

    return undefined
}

function nextPosition(context: MovementContext): Vector2 {
    const { character, deltaMs, navigation } = context
    const input = character.getMoveInput()
    const step = (character.config.moveSpeed * deltaMs) / 1000

    if (input.x !== 0 || input.y !== 0) {
        return navigation.moveWithCollision(character.position, {
            x: input.x * step,
            y: input.y * step,
        })
    }

    return advancePath(character, navigation, step)
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
