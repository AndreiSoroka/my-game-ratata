import {
    type GameEventPayload,
    MOVEMENT_RULES,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { regenerateCharacter } from './characterRecovery'
import { combatMovementTime, lungeDisplacement } from './combatMovement'
import { clearCombatTransient } from './combatState'
import { constellationModifiers } from './constellationModifiers'
import { effectiveMoveSpeed } from './effectiveParameters'
import { wearWalkingEquipment } from './itemDurability'
import { distance, moveToward, zeroVector } from './math'
import { cancelMovementMode } from './movementActions'
import { type MovementNoise, movementNoise } from './movementNoise'
import type { NavigationService } from './navigation'
import { prayerAuraEffects } from './prayerAuras'
import { resolvePrayerMovement } from './prayerFearMovement'
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
    if (cannotMove(character, now)) {
        character.velocity = zeroVector()
        cancelMovementMode(character)
        return undefined
    }
    const feared = prayerAuraEffects(character, now).feared
    if (feared) {
        clearCombatTransient(character, now)
        character.clearPendingAttackHit()
    }
    if (character.combat.defensiveStance) {
        character.velocity = zeroVector()
        character.movement.dashUntil = 0
        context.onEvents?.(character.applyRegen(deltaMs, false, false, now))
        return undefined
    }
    const forced = lungeDisplacement(character, now, deltaMs)
    if (forced !== undefined) {
        moveCharacter(context, deltaMs, forced)
        return undefined
    }
    if (character.isActionLocked(now) && !feared) {
        character.velocity = zeroVector()
        character.movement.dashUntil = 0
        const events = character.applyRegen(deltaMs, false, true, now)
        context.onEvents?.(events)
        return undefined
    }
    moveCharacter(
        context,
        feared ? deltaMs : combatMovementTime(character, now, deltaMs)
    )
    return undefined
}
function cannotMove(character: GameCharacter, now: number): boolean {
    return (
        !character.alive ||
        character.tags.has('offline') ||
        character.stunUntil > now
    )
}

function moveCharacter(
    context: MovementContext,
    movementMs = context.deltaMs,
    forced?: Vector2
): void {
    const { character, deltaMs, now, navigation } = context
    const before = { ...character.position }
    const dashMs = dashTime(character, now, deltaMs)
    const effects = prayerAuraEffects(character, now)
    const slow = effects.slowMultiplier
    const step = (movementSpeed(character) * slow * movementMs) / 1000
    const next = resolvePrayerMovement(
        character,
        effects.feared
            ? before
            : forced === undefined
              ? nextPosition({ ...context, deltaMs: movementMs }, dashMs, slow)
              : navigation.moveWithCollision(before, forced),
        step,
        navigation,
        now
    )
    character.position = boundedPursuitStep(character, before, next, now)
    const traveled = distance(before, character.position)
    if (dashMs > 0 && traveled > 0) {
        confirmResourceSpend(character.movement.dashResourceSpend)
        delete character.movement.dashResourceSpend
    }
    const moving = traveled > 0
    const walking = isOrdinaryWalk(
        character,
        moving,
        dashMs,
        forced !== undefined || effects.feared
    )
    wearWalkingEquipment(character, traveled, walking)
    character.velocity = {
        x: character.position.x - before.x,
        y: character.position.y - before.y,
    }
    character.updateFacing(character.velocity)
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
    const events = regenerateCharacter(
        character,
        deltaMs,
        moving,
        !moving || dashMs === 0,
        now,
        walking
    )
    context.onEvents?.(events)
    if (now >= character.movement.dashUntil) {
        character.movement.dashUntil = 0
    }
}

function isOrdinaryWalk(
    character: GameCharacter,
    moving: boolean,
    dashMs: number,
    forced: boolean
): boolean {
    return (
        moving &&
        !forced &&
        dashMs === 0 &&
        character.movement.mode === 'walking'
    )
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

function nextPosition(
    context: MovementContext,
    dashMs: number,
    slow: number
): Vector2 {
    const { character, deltaMs, navigation } = context
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
    const step = (movementSpeed(character) * slow * deltaMs) / 1000
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
