import {
    type GroundSurface,
    MOVEMENT_RULES,
    SURFACE_NOISE_MULTIPLIERS,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { constellationModifiers } from './constellationModifiers'
import type { NavigationService } from './navigation'

export interface MovementNoise {
    actorId: string
    locationId: string
    position: Vector2
    emittedAt: number
    radius: number
    surface: GroundSurface
}

export function movementNoise(
    character: GameCharacter,
    navigation: NavigationService,
    traveled: number,
    dashing: boolean,
    now: number
): MovementNoise | undefined {
    const state = character.movement
    if (state.stepLocationId !== character.locationId) {
        state.stepLocationId = character.locationId
        state.stepDistance = 0
    }
    if (!character.alive || character.tags.has('offline') || traveled <= 0) {
        return undefined
    }
    state.stepDistance += traveled
    if (
        state.stepDistance < MOVEMENT_RULES.stepDistance ||
        now - state.lastStepAt < MOVEMENT_RULES.stepIntervalMs
    ) {
        return undefined
    }
    state.stepDistance %= MOVEMENT_RULES.stepDistance
    state.lastStepAt = now
    const surface = navigation.surfaceAt(character.position)
    return {
        actorId: character.id,
        locationId: character.locationId,
        position: { ...character.position },
        emittedAt: now,
        radius:
            MOVEMENT_RULES.walkingNoiseRadius *
            SURFACE_NOISE_MULTIPLIERS[surface] *
            noiseMultiplier(character, dashing),
        surface,
    }
}

function noiseMultiplier(character: GameCharacter, dashing: boolean): number {
    if (dashing) {
        return MOVEMENT_RULES.dashNoiseMultiplier
    }
    return character.movement.mode === 'sneaking'
        ? MOVEMENT_RULES.sneakNoiseMultiplier *
              constellationModifiers(character).sneakNoiseMultiplier
        : 1
}
