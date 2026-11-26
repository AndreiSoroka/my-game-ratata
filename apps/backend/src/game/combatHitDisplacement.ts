import type { GameEventPayload, Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { clearCharacterRoute } from './characterRoute'
import type { PendingAttackHit } from './characterState'
import { portalReach } from './cityPortals'
import type { AttackContext } from './combat'
import { arrowPhaseEvent } from './combatArchery'
import { attackDelivery } from './combatDefense'
import { invalidateWeaponAction } from './combatState'
import { creditFatZombieKill } from './fatZombieConstellation'
import { fatZombieBonuses } from './fatZombieModifiers'
import { limitMovementByChains, magicRootedUntil } from './magicState'
import {
    circleEntryFraction,
    distance,
    facingDirection,
    moveToward,
    normalize,
    zeroVector,
} from './math'
import type { NavigationService } from './navigation'
import { markPositionDiscontinuity } from './positionDiscontinuity'

interface ProtectedZone {
    position: Vector2
    triggerRadius: number
}

const zoneClearance = 1e-5

/** Runs only for positive damage to health after the ordinary defenses. */
export function resolveFatZombieMeleeHit(
    context: AttackContext,
    attack: PendingAttackHit,
    target: GameCharacter
): GameEventPayload[] {
    const { actor, navigation, now } = context
    if (
        actor.archetype !== 'fat_zombie' ||
        attack.origin !== 'basic' ||
        attack.abilityId !== undefined ||
        attackDelivery(attack) !== 'melee_physical' ||
        actor.locationId !== target.locationId
    ) {
        return []
    }
    if (!target.alive) {
        creditFatZombieKill(actor, target)
        return []
    }
    if (navigation === undefined || magicRootedUntil(target, now) > now) {
        return []
    }
    const direction = pushDirection(actor, target)
    const length =
        fatZombieBonuses(actor).pushTiles *
        Math.min(navigation.grid.tileWidth, navigation.grid.tileHeight)
    const destination = resolvePush(
        target,
        { x: direction.x * length, y: direction.y * length },
        navigation,
        activeTravelZones(context, navigation),
        now
    )
    if (distance(target.position, destination) <= zoneClearance) {
        return []
    }
    target.position = destination
    target.velocity = zeroVector()
    clearCharacterRoute(target)
    target.clearPath()
    target.movement.dashUntil = 0
    markPositionDiscontinuity(target)
    return interruptDisplacedAttack(target, now)
}

function activeTravelZones(
    { actor, now, portals }: AttackContext,
    navigation: NavigationService
): readonly ProtectedZone[] {
    const triggerRadius = portalReach(navigation)
    return [
        ...(navigation.grid.dungeonPassages ?? []),
        ...(portals?.snapshot(actor.locationId, now) ?? []).map(
            ({ position }) => ({ position, triggerRadius })
        ),
    ]
}

function pushDirection(actor: GameCharacter, target: GameCharacter): Vector2 {
    const away = {
        x: target.position.x - actor.position.x,
        y: target.position.y - actor.position.y,
    }
    return away.x === 0 && away.y === 0
        ? facingDirection(actor.facing)
        : normalize(away)
}

function resolvePush(
    target: GameCharacter,
    delta: Vector2,
    navigation: NavigationService,
    protectedZones: readonly ProtectedZone[],
    now: number
): Vector2 {
    let destination = target.position
    let stopped = false
    navigation.moveWithCollision(destination, delta, (from, to) => {
        if (stopped) {
            return
        }
        const outside = stopBeforeZone(from, to, protectedZones)
        destination = limitMovementByChains(target, outside, now, from)
        stopped =
            destination !== to ||
            magicRootedUntil(target, now, destination) > now
    })
    return destination
}

function stopBeforeZone(
    from: Vector2,
    to: Vector2,
    zones: readonly ProtectedZone[]
): Vector2 {
    let entry = Infinity
    for (const { position, triggerRadius } of zones) {
        if (distance(from, position) <= triggerRadius) {
            const inward =
                (to.x - from.x) * (position.x - from.x) +
                (to.y - from.y) * (position.y - from.y)
            if (inward > 0) {
                return from
            }
        } else {
            entry = Math.min(
                entry,
                circleEntryFraction(from, to, position, triggerRadius) ??
                    Infinity
            )
        }
    }
    return entry === Infinity
        ? to
        : moveToward(
              from,
              to,
              Math.max(0, distance(from, to) * entry - zoneClearance)
          )
}

function interruptDisplacedAttack(
    target: GameCharacter,
    now: number
): GameEventPayload[] {
    const pending = target.pendingAttack
    if (pending === undefined) {
        return []
    }
    invalidateWeaponAction(target, now)
    return pending.arrow === undefined
        ? []
        : [arrowPhaseEvent(target, pending, 'interrupted')]
}
