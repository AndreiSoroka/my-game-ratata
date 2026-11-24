import type { Vector2 } from '@my-game-ratata/contracts'

import { limitMovementByChains, magicRootedUntil } from './magicState'
import { distance, zeroVector } from './math'
import type { MovementContext } from './movement'
import {
    clearMovementInputHistory,
    type TimedMovementInput,
} from './movementInputHistory'
import { movementSpeed, nextPosition } from './movementNavigation'
import { prayerAuraEffects } from './prayerAuras'
import { resolvePrayerMovement } from './prayerFearMovement'
import { boundedPursuitStep } from './pursuitMovement'
import {
    hasMovementAxis,
    invalidateManualStop,
    recordManualStopStep,
    tracksManualStop,
} from './stopCorrection'
import type { StopCorrectionLeg } from './stopCorrectionGeometry'
import {
    expireTimedWalkingBoost,
    timedWalkingBudget,
} from './timedMovementBudget'

export interface ResolvedMovement {
    traveled: number
    facing: Vector2
    dashMs: number
    forced: boolean
    halted: boolean
    clipping: { desired: Vector2; actual: Vector2 } | undefined
    continuationUntil: number | undefined
}
interface MovementStep {
    movementMs: number
    forced: Vector2 | undefined
    forcedUntil: number | undefined
    manual: TimedMovementInput | undefined
}

export function resolveMovementGeometry(
    context: MovementContext,
    step: MovementStep
): ResolvedMovement {
    const { character, now } = context
    const dashMs = dashTime(context)
    const dashUntil = character.movement.dashUntil
    const effects = prayerAuraEffects(character, now)
    const result: ResolvedMovement = {
        traveled: 0,
        facing: zeroVector(),
        dashMs,
        forced: step.forced !== undefined || effects.feared,
        halted: false,
        clipping: undefined,
        continuationUntil: undefined,
    }
    const manual = step.manual ?? continuingManualInput(context)
    if (
        manual !== undefined &&
        !result.forced &&
        dashMs === 0 &&
        dashUntil <= now
    ) {
        resolveManualLegs(context, manual, effects.slowMultiplier, result)
        return result
    }
    clearMovementInputHistory(character)
    const before = { ...character.position }
    const distanceBudget =
        (movementSpeed(character) * effects.slowMultiplier * step.movementMs) /
        1000
    const next = effects.feared
        ? before
        : step.forced === undefined
          ? nextPosition(
                { ...context, deltaMs: step.movementMs },
                dashMs,
                effects.slowMultiplier
            )
          : context.navigation.moveWithCollision(before, step.forced)
    const desired = resolvePrayerMovement(
        character,
        next,
        distanceBudget,
        context.navigation,
        now
    )
    resolveLeg(context, desired, result)
    result.continuationUntil =
        step.forced === undefined
            ? !effects.feared && dashMs > 0
                ? dashUntil
                : undefined
            : step.forcedUntil
    return result
}

function continuingManualInput({
    character,
    now,
    deltaMs,
}: MovementContext): TimedMovementInput | undefined {
    const axis = character.getMoveInput()
    return tracksManualStop(character) && hasMovementAxis(axis)
        ? {
              finalAxis: axis,
              segments: [
                  {
                      axis,
                      startedAt: now - Math.min(250, deltaMs),
                      endsAt: now,
                  },
              ],
          }
        : undefined
}

function resolveManualLegs(
    context: MovementContext,
    manual: TimedMovementInput,
    slow: number,
    result: ResolvedMovement
): void {
    const { character, now, navigation } = context
    const boost = character.combat.arrowStep
    const speed = (movementSpeed(character) * slow) / 1000
    const trace = tracksManualStop(character)
        ? ([] as StopCorrectionLeg[])
        : undefined
    let permitted = 0
    let lastAxis = zeroVector()
    let lastRemaining = 0
    for (const segment of manual.segments) {
        if (segment.axis.x === 0 && segment.axis.y === 0) {
            continue
        }
        if (magicRootedUntil(character, now) > now) {
            result.halted = true
            break
        }
        const amount = speed * timedWalkingBudget(character, segment, boost)
        let actual = 0
        const next = navigation.moveWithCollision(
            character.position,
            { x: segment.axis.x * amount, y: segment.axis.y * amount },
            trace === undefined
                ? undefined
                : (from, to) => {
                      trace.push({ from, to, at: segment.endsAt })
                      actual += distance(from, to)
                  }
        )
        const desired = resolvePrayerMovement(
            character,
            next,
            amount,
            navigation,
            now
        )
        resolveLeg(context, desired, result)
        if (trace !== undefined) {
            // A constraint applied after tile collision invalidates this trace.
            if (distance(character.position, next) > 1e-8) {
                invalidateManualStop(character)
            }
            permitted += amount
            lastRemaining = Math.max(0, amount - actual)
            lastAxis = segment.axis
        }
        if (result.halted) {
            break
        }
    }
    expireTimedWalkingBoost(character, now, boost)
    if (result.halted) {
        clearMovementInputHistory(character)
        invalidateManualStop(character)
        result.continuationUntil = now
    } else {
        if (trace !== undefined) {
            recordManualStopStep(
                character,
                trace,
                permitted,
                lastAxis,
                lastRemaining,
                now
            )
        }
        result.continuationUntil = manual.stoppedAt
    }
}

function resolveLeg(
    context: MovementContext,
    next: Vector2,
    result: ResolvedMovement
): void {
    const { character, now } = context
    const before = { ...character.position }
    const desired = boundedPursuitStep(character, before, next, now)
    const actual = limitMovementByChains(character, desired, now)
    character.position = actual
    const traveled = distance(before, actual)
    result.traveled += traveled
    if (traveled > 0) {
        result.facing = { x: actual.x - before.x, y: actual.y - before.y }
    }
    if (desired.x !== actual.x || desired.y !== actual.y) {
        result.clipping = { desired, actual }
        result.halted = true
    }
    if (desired === before && next !== before) {
        result.halted = true
    }
}

function dashTime({ character, now, deltaMs }: MovementContext): number {
    const state = character.movement
    return Math.max(
        0,
        Math.min(now, state.dashUntil) -
            Math.max(now - deltaMs, state.dashStartedAt)
    )
}
