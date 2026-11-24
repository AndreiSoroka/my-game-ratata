import type { Vector2 } from '@my-game-ratata/contracts'

import { advanceAshRegionalTravel } from './ashRegionalTravel'
import {
    ashAssaultTarget,
    ashSkeletonBond,
    ashSkeletonGuard,
    type AshSkeletonOrder,
    ashSkeletonOrder,
    ashSkeletonOwnerId,
    ashSummonWanders,
} from './ashSkeletonState'
import type { GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { requestNpcAttack } from './npcAbilities'
import { findVisibleTarget } from './queries'
import type { GameRoom } from './room'

const orderPlans = new WeakMap<GameCharacter, number>()
const commandRadius = 112

export function advanceAshSkeleton(
    actor: GameCharacter,
    room: GameRoom,
    now: number
): boolean {
    const bond = ashSkeletonBond(actor)
    const order = ashSkeletonOrder(actor)
    const ownerId = ashSkeletonOwnerId(actor)
    if (ownerId === undefined || ashSummonWanders(actor)) {
        return false
    }
    if (actor.isActionLocked(now)) {
        return true
    }
    const owner = room.getCharacter(ownerId)
    const navigation = room.navigationFor(actor)
    const guard = ashSkeletonGuard(actor)
    const destination =
        bond === undefined
            ? undefined
            : crossingDestination(actor, owner, order, guard)
    if (destination !== undefined) {
        advanceAshRegionalTravel(actor, destination, navigation, now)
        return true
    }
    const anchor = orderAnchor(order, actor, owner, guard)
    if (anchor === undefined) {
        actor.clearPath()
        return true
    }
    const enemies = orderTargets(
        room.charactersFor(actor),
        anchor,
        order?.kind === 'hunt_slimes'
    )
    const target = chooseTarget(actor, enemies, navigation, now)
    if (
        target !== undefined &&
        attackTarget(actor, target, room, now, navigation.grid.tileWidth)
    ) {
        return true
    }
    advanceToDestination(actor, anchor, target, navigation, now)
    return true
}

function crossingDestination(
    actor: GameCharacter,
    owner: GameCharacter | undefined,
    order: AshSkeletonOrder | undefined,
    guard: ReturnType<typeof ashSkeletonGuard>
): string | undefined {
    if (owner?.alive !== true || order?.kind === 'hunt_slimes') {
        return undefined
    }
    const location = guard?.locationId ?? owner.locationId
    return location === actor.locationId ? undefined : location
}

function chooseTarget(
    actor: GameCharacter,
    enemies: GameCharacter[],
    navigation: NavigationService,
    now: number
): GameCharacter | undefined {
    const assigned = ashAssaultTarget(actor)
    const ordered =
        assigned !== undefined && enemies.includes(assigned)
            ? findVisibleTarget(
                  [assigned],
                  navigation,
                  actor,
                  commandRadius,
                  now
              )
            : undefined
    return (
        ordered ??
        findVisibleTarget(enemies, navigation, actor, commandRadius, now)
    )
}

function advanceToDestination(
    actor: GameCharacter,
    anchor: Vector2,
    target: GameCharacter | undefined,
    navigation: NavigationService,
    now: number
): void {
    const destination = target?.position ?? anchor
    if (
        target === undefined &&
        distance(actor.position, destination) <= navigation.grid.tileWidth
    ) {
        actor.clearPath()
    } else if (now >= (orderPlans.get(actor) ?? 0)) {
        actor.setPath(navigation.findPathWorld(actor.position, destination))
        orderPlans.set(actor, now + 400)
    }
}

function attackTarget(
    actor: GameCharacter,
    target: GameCharacter,
    room: GameRoom,
    now: number,
    tileWidth: number
): boolean {
    actor.updateFacing({
        x: target.position.x - actor.position.x,
        y: target.position.y - actor.position.y,
    })
    if (!isTargetInAttackRange(actor, target, tileWidth)) {
        return false
    }
    actor.clearPath()
    requestNpcAttack(actor, target, room, now, true)
    return true
}

function orderAnchor(
    order: AshSkeletonOrder | undefined,
    actor: GameCharacter,
    owner: GameCharacter | undefined,
    guard: ReturnType<typeof ashSkeletonGuard>
): Vector2 | undefined {
    if (order?.kind === 'hunt_slimes') {
        return order.anchor
    }
    if (guard !== undefined) {
        return guard.locationId === actor.locationId
            ? guard.position
            : undefined
    }
    return owner?.alive === true && owner.locationId === actor.locationId
        ? owner.position
        : undefined
}

function orderTargets(
    targets: GameCharacter[],
    anchor: Vector2,
    hunt: boolean
): GameCharacter[] {
    return targets.filter(
        (target) =>
            distance(anchor, target.position) <= commandRadius &&
            (target.creatureType === 'ooze') === hunt
    )
}
