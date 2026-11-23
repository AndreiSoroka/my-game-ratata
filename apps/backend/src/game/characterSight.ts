import {
    type Vector2,
    WILDERNESS_AGGRO_POLICY,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { constellationModifiers } from './constellationModifiers'
import { distance, facingDirection } from './math'
import type { NavigationService } from './navigation'
import { canPerceivePrayerCaster } from './prayerAuras'

export function usesStealthSight(target: GameCharacter, now: number): boolean {
    return (
        target.alive &&
        target.movement.mode === 'sneaking' &&
        target.movement.dashUntil <= now &&
        target.lastAttackAt + 1_000 <= now
    )
}

/** Standing scene actors use the usual location view. Crouchers need physical sight. */
export function canObserveRoomCharacter(
    observer: GameCharacter | undefined,
    target: GameCharacter,
    navigation: NavigationService | undefined,
    now: number,
    origin?: Vector2
): boolean {
    if (observer === undefined) {
        return !usesStealthSight(target, now)
    }
    if (observer.id === target.id) {
        return true
    }
    if (!usesStealthSight(target, now)) {
        return canPerceivePrayerCaster(observer, target, now)
    }
    const point = origin ?? observer.position
    return (
        observer.alive &&
        observer.locationId === target.locationId &&
        distance(point, target.position) <=
            visibilityRadius(
                observer,
                target,
                WILDERNESS_AGGRO_POLICY.sightRadius,
                now,
                point
            ) &&
        (navigation?.hasLineOfSight(point, target.position) ?? true)
    )
}

export function visibilityRadius(
    observer: GameCharacter,
    target: GameCharacter,
    radius: number,
    now: number,
    origin: Vector2 = observer.position
): number {
    if (!canPerceivePrayerCaster(observer, target, now)) {
        return -1
    }
    if (!usesStealthSight(target, now)) {
        return radius
    }
    const vector = {
        x: target.position.x - origin.x,
        y: target.position.y - origin.y,
    }
    const facing = facingDirection(observer.facing)
    const length = Math.max(1, Math.hypot(vector.x, vector.y))
    const dot = (vector.x * facing.x + vector.y * facing.y) / length
    const factor = dot >= 0.4 ? 0.65 : dot <= -0.4 ? 0.35 : 0.5
    return Math.min(
        radius,
        Math.max(
            28,
            radius *
                factor *
                constellationModifiers(target).sneakSightMultiplier
        )
    )
}
