import type { Vector2 } from '@my-game-ratata/contracts'

import {
    type AshSkeletonOrder,
    ashSkeletonOrder,
    ashSummoner,
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
    const order = ashSkeletonOrder(actor)
    const ownerId = order?.ownerId ?? ashSummoner(actor)
    if (ownerId === undefined || ashSummonWanders(actor)) {
        return false
    }
    if (actor.isActionLocked(now)) {
        return true
    }
    const anchor = orderAnchor(order, actor, room.getCharacter(ownerId))
    if (anchor === undefined) {
        actor.clearPath()
        return true
    }
    const navigation = room.navigationFor(actor)
    const enemies = orderTargets(
        room.charactersFor(actor),
        anchor,
        order?.kind === 'hunt_slimes'
    )
    const target = findVisibleTarget(
        enemies,
        navigation,
        actor,
        commandRadius,
        now
    )
    if (
        target !== undefined &&
        attackTarget(actor, target, room, now, navigation.grid.tileWidth)
    ) {
        return true
    }
    advanceToDestination(actor, anchor, target, navigation, now)
    return true
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
    requestNpcAttack(actor, target, room, now)
    return true
}

function orderAnchor(
    order: AshSkeletonOrder | undefined,
    actor: GameCharacter,
    owner?: GameCharacter
): Vector2 | undefined {
    if (order?.kind === 'guard' || order?.kind === 'hunt_slimes') {
        return order.anchor
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
