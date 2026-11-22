import {
    type CharacterMovementSnapshot,
    type GameEventPayload,
    MOVEMENT_RULES,
    type MovementClientMessage,
    type MovementMode,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { effectiveDashCost, effectiveDashDuration } from './effectiveParameters'
import { normalize } from './math'
import {
    recordResourceSpend,
    type ResourceSpendReceipt,
} from './resourcePractice'
import { canPerformSkillAction } from './skillProgression'

export interface CharacterMovementState {
    mode: MovementMode
    dashStartedAt: number
    dashUntil: number
    dashAvailableAt: number
    dashDirection: Vector2
    stepDistance: number
    lastStepAt: number
    stepLocationId: string
    dashResourceSpend?: ResourceSpendReceipt
}

export function createMovementState(): CharacterMovementState {
    return {
        mode: 'walking',
        dashStartedAt: 0,
        dashUntil: 0,
        dashAvailableAt: 0,
        dashDirection: { x: 0, y: 0 },
        stepDistance: 0,
        lastStepAt: -Infinity,
        stepLocationId: '',
    }
}

export function handleMovementCommand(
    character: GameCharacter,
    message: MovementClientMessage,
    now: number
): GameEventPayload[] {
    if (!movementActionAllowed(character, message, now)) {
        return []
    }
    if (message.type === 'movement_mode') {
        character.movement.mode = message.mode
        character.movement.dashUntil = 0
        return []
    }
    const state = character.movement
    state.dashDirection = dashDirection(character)
    state.dashStartedAt = now
    state.dashUntil = now + effectiveDashDuration(character)
    state.dashAvailableAt = now + MOVEMENT_RULES.dashCooldownMs
    state.mode = 'walking'
    const spent = character.drainEnergy(effectiveDashCost(character))
    const receipt = recordResourceSpend(character, 'energy', spent)
    if (receipt !== undefined) {
        state.dashResourceSpend = receipt
    } else {
        delete state.dashResourceSpend
    }
    character.clearPath()
    return [{ kind: 'dash', actorId: character.id }]
}

export function snapshotMovement(
    character: GameCharacter,
    now: number
): CharacterMovementSnapshot {
    return {
        mode: character.movement.mode,
        dashing: character.alive && character.movement.dashUntil > now,
        dashCooldownMsLeft: Math.max(
            0,
            character.movement.dashAvailableAt - now
        ),
    }
}

function dashDirection(character: GameCharacter): Vector2 {
    const input = character.getMoveInput()
    if (input.x !== 0 || input.y !== 0) {
        return input
    }
    const point = character.nextPathPoint()
    if (point !== undefined) {
        return normalize({
            x: point.x - character.position.x,
            y: point.y - character.position.y,
        })
    }
    return {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
    }[character.facing]
}

export function movementActionAllowed(
    character: GameCharacter,
    message: MovementClientMessage,
    now: number
): boolean {
    if (message.type === 'movement_mode') {
        return character.alive && !character.tags.has('offline')
    }
    return (
        canPerformSkillAction(character, now) &&
        now >= character.movement.dashAvailableAt &&
        character.energy >= effectiveDashCost(character)
    )
}

export function cancelMovementMode(character: GameCharacter): void {
    character.movement.mode = 'walking'
    character.movement.dashUntil = 0
    character.movement.stepDistance = 0
}
