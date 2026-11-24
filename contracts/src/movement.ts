import type { Vector2 } from './index'

export type MovementMode = 'sneaking' | 'walking'
export type GroundSurface = 'grass' | 'stone' | 'dirt' | 'wood'
export type MovementClientMessage =
    { type: 'movement_mode'; mode: MovementMode } | { type: 'dash' }

export interface MoveInputClientMessage {
    axis: Vector2
    /** Optional only when both direction axes are zero. */
    stopCorrection?: StopCorrectionRequest
    type: 'move_input'
}

export interface MoveToClientMessage {
    append?: boolean
    target: Vector2
    type: 'move_to'
}

export const STOP_CORRECTION_MAX_DISTANCE = 4
export const STOP_CORRECTION_MAX_AGE_MS = 300
export const STOP_CORRECTION_BLEND_MS = 100

export interface StopCorrectionRequest {
    id: number
    streamId: number
    seq: number
    /** The displayed point in map pixels when manual input was released. */
    position: Vector2
}

export interface StopCorrectionReceipt {
    id: number
    status: 'accepted' | 'clamped' | 'rejected'
}

export interface CharacterMovementSnapshot {
    /** End of a dash, lunge or timed manual stop, in server gameplay time. */
    continuationUntil?: number
    /** Changes when a forced movement interrupts ordinary position blending. */
    positionDiscontinuity?: number
    mode: MovementMode
    dashCooldownMsLeft: number
    roadPrayerDashDiscountMsLeft?: number
    dashing: boolean
}

export const MOVEMENT_RULES = {
    sneakSpeedMultiplier: 0.45,
    dashSpeedMultiplier: 1.6,
    dashDurationMs: 600,
    dashEnergy: 30,
    dashCooldownMs: 2_500,
    stepDistance: 16,
    stepIntervalMs: 180,
    walkingNoiseRadius: 64,
    sneakNoiseMultiplier: 0.18,
    dashNoiseMultiplier: 4,
    investigationMs: 4_000,
    occludedNoiseMultiplier: 0.5,
    playerFootstepHearingRadius: 240,
    heardFootstepMs: 850,
} as const

export const SURFACE_NOISE_MULTIPLIERS: Record<GroundSurface, number> = {
    grass: 1,
    dirt: 0.8,
    wood: 1.3,
    stone: 1.55,
}
