import { type GameEventPayload, type Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    type EnergyRecoveryRate,
    regenerateCharacter,
} from './characterRecovery'
import {
    interruptSniperOnMove,
    markArrowWalking,
    quickShotBlocksMovement,
} from './combatArchery'
import {
    canWalkDuringPrayer,
    combatMovementTime,
    lungeDisplacement,
} from './combatMovement'
import { clearCombatTransient } from './combatState'
import { wearWalkingEquipment } from './itemDurability'
import { haltMagicMovement } from './magicMovement'
import { recordChainsClipping } from './magicPractice'
import { zeroVector } from './math'
import { cancelMovementMode } from './movementActions'
import { resolveMovementGeometry } from './movementGeometry'
import {
    clearMovementInputHistory,
    consumeMovementInputHistory,
    type TimedMovementInput,
} from './movementInputHistory'
import { type MovementNoise, movementNoise } from './movementNoise'
import type { NavigationService } from './navigation'
import { markPositionDiscontinuity } from './positionDiscontinuity'
import { prayerAuraEffects } from './prayerAuras'
import { confirmResourceSpend } from './resourcePractice'
import { invalidateManualStop } from './stopCorrection'

export interface MovementContext {
    character: GameCharacter
    deltaMs: number
    navigation: NavigationService
    now: number
    idleDestination?: Vector2
    onNoise?: (noise: MovementNoise) => void
    onEvents?: (events: GameEventPayload[]) => void
    onEnergyRegen?: (rate: EnergyRecoveryRate) => void
    /** Presentation metadata only; it cannot change resolved movement. */
    onMotionResolved?: (
        sample: Readonly<{ continuationUntil?: number }>
    ) => void
}

export function advanceCharacter(
    context: MovementContext
): GameEventPayload | undefined {
    const { character, deltaMs, now } = context
    const manual = consumeMovementInputHistory(character, now, deltaMs)
    const wasAlive = character.alive
    character.tickTimedState(now)
    if (!wasAlive && character.alive) {
        clearMovementInputHistory(character)
        return { actorId: character.id, kind: 'respawn' }
    }
    if (haltMovement(context)) {
        return undefined
    }
    const feared = prayerAuraEffects(character, now).feared
    if (feared) {
        clearCombatTransient(character, now)
        character.clearPendingAttackHit()
    }
    if (character.combat.defensiveStance) {
        clearMovementInputHistory(character)
        invalidateManualStop(character)
        character.velocity = zeroVector()
        character.movement.dashUntil = 0
        applyMovementRegen(context, false, false)
        return undefined
    }
    interruptSniperOnMove(character, now, context.onEvents)
    const forcedUntil = character.combat.lunge?.endsAt
    const forced = lungeDisplacement(character, now, deltaMs)
    if (forced !== undefined) {
        moveCharacter(context, deltaMs, forced, forcedUntil)
        return undefined
    }
    if (combatBlocksMovement(character, now, feared)) {
        clearMovementInputHistory(character)
        invalidateManualStop(character)
        character.velocity = zeroVector()
        character.movement.dashUntil = 0
        applyMovementRegen(context, false, true)
        return undefined
    }
    moveCharacter(
        context,
        feared ? deltaMs : combatMovementTime(character, now, deltaMs),
        undefined,
        undefined,
        manual
    )
    return undefined
}

function haltMovement(context: MovementContext): boolean {
    const { character, now } = context
    if (cannotMove(character, now)) {
        clearMovementInputHistory(character)
        invalidateManualStop(character)
        character.velocity = zeroVector()
        cancelMovementMode(character)
        return true
    }
    if (haltMagicMovement(character, now, context.onEvents)) {
        clearMovementInputHistory(character)
        invalidateManualStop(character)
        applyMovementRegen(context, false, !character.combat.defensiveStance)
        return true
    }
    return false
}

function cannotMove(character: GameCharacter, now: number): boolean {
    return (
        !character.alive ||
        character.tags.has('offline') ||
        character.stunUntil > now
    )
}

function applyMovementRegen(
    context: MovementContext,
    moving: boolean,
    energyAllowed: boolean,
    walking = false
): void {
    const { character, deltaMs, now, onEvents, onEnergyRegen } = context
    const events = regenerateCharacter(
        character,
        deltaMs,
        moving,
        energyAllowed,
        now,
        walking,
        onEnergyRegen
    )
    onEvents?.(events)
}

function moveCharacter(
    context: MovementContext,
    movementMs = context.deltaMs,
    forced?: Vector2,
    forcedUntil?: number,
    manual?: TimedMovementInput
): void {
    const { character, deltaMs, now, navigation } = context
    const before = { ...character.position }
    const resolved = resolveMovementGeometry(context, {
        movementMs,
        forced,
        forcedUntil,
        manual,
    })
    const { traveled, dashMs, clipping } = resolved
    if (dashMs > 0 && traveled > 0) {
        confirmResourceSpend(character.movement.dashResourceSpend)
        delete character.movement.dashResourceSpend
    }
    const moving = traveled > 0
    reportForcedMovement(character, resolved.forced || dashMs > 0, moving, now)
    const walking = isOrdinaryWalk(character, moving, dashMs, resolved.forced)
    markArrowWalking(character, walking)
    wearWalkingEquipment(character, traveled, walking)
    character.velocity = {
        x: character.position.x - before.x,
        y: character.position.y - before.y,
    }
    character.updateFacing(resolved.facing)
    reportMotion(context, moving, resolved.continuationUntil)
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
    const events =
        clipping === undefined
            ? []
            : recordChainsClipping(
                  character,
                  clipping.desired,
                  clipping.actual,
                  now
              )
    events.push(
        ...regenerateCharacter(
            character,
            deltaMs,
            moving,
            !moving || dashMs === 0,
            now,
            walking,
            context.onEnergyRegen
        )
    )
    context.onEvents?.(events)
    if (now >= character.movement.dashUntil) {
        character.movement.dashUntil = 0
    }
}

function reportForcedMovement(
    character: GameCharacter,
    forced: boolean,
    moving: boolean,
    now: number
): void {
    if (forced || character.movement.dashUntil > now) {
        if (moving) {
            markPositionDiscontinuity(character)
        } else {
            invalidateManualStop(character)
        }
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

function combatBlocksMovement(
    character: GameCharacter,
    now: number,
    feared: boolean
): boolean {
    return (
        quickShotBlocksMovement(character) ||
        (character.isActionLocked(now) &&
            !feared &&
            !canWalkDuringPrayer(character))
    )
}

function reportMotion(
    context: MovementContext,
    moving: boolean,
    continuationUntil: number | undefined
): void {
    context.onMotionResolved?.(
        moving && continuationUntil !== undefined ? { continuationUntil } : {}
    )
}
