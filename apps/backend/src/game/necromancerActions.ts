import {
    type AshRiteId,
    CHEST_INTERACTION_RANGE,
    chestInteractionDistance,
    containerBounds,
    interactionApproachPoints,
    type PrayerIntent,
    REVIVE_MANA_COST,
    type SkeletonOrder,
    type Vector2,
} from '@my-game-ratata/contracts'

import { ashTargetCastInProgress } from './abilityState'
import type { GameCharacter } from './character'
import { chestHasLineOfSight } from './chestInteraction'
import { isTargetInAttackRange } from './combat'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import { handleMovementCommand } from './movementActions'
import type {
    NecromancerLandmark,
    NecromancerOption,
    NecromancerScene,
    NecromancerTactic,
} from './necromancerTactics'
import { validPrayerIntent } from './prayerContext'
import type { GameRoom } from './room'

const orders = {
    guard: 'guard',
    protect: 'protect',
    wander: 'wander',
    hunt: 'hunt_slimes',
} as const

const prayers = {
    magic: 'harm',
    heal: 'restore',
    revive: 'revive',
} as const

const rites: Partial<
    Record<NecromancerTactic, Exclude<AshRiteId, 'ash_order'>>
> = {
    raise: 'ash_raise',
    tame: 'ash_tame',
    curse: 'ash_exhaustion',
    gift: 'ash_gift',
    sacrifice: 'ash_sacrifice',
}

export function canActAsNecromancer(
    actor: GameCharacter,
    now: number
): boolean {
    return (
        !actor.isActionLocked(now) &&
        actor.movement.dashUntil <= now &&
        actor.abilities.casting === null &&
        !ashTargetCastInProgress(actor)
    )
}

export function necromancerCanPray(
    actor: GameCharacter,
    room: GameRoom,
    intent: PrayerIntent,
    now: number
): boolean {
    return (
        actor.mana >= (intent.mode === 'revive' ? REVIVE_MANA_COST : 5) &&
        (actor.abilities.availableAt.pray_grave ?? 0) <= now &&
        validPrayerIntent(
            actor,
            intent,
            room.abilityContextFor(actor, now),
            'pray_grave'
        )
    )
}

export function performNecromancerTactic(
    actor: GameCharacter,
    room: GameRoom,
    { tactic, targetId }: NecromancerOption,
    now: number
): boolean {
    if (targetId === undefined) {
        return false
    }
    if (tactic === 'magic' || tactic === 'heal' || tactic === 'revive') {
        return castAshPrayer(
            actor,
            room,
            { mode: prayers[tactic], targetId },
            now
        )
    }
    const rite = rites[tactic]
    if (rite !== undefined) {
        const events = room.requestAbility(
            actor,
            {
                type: 'use_ability',
                abilityId: rite,
                targetId,
            },
            now
        )
        room.publishEvents(events)
        return events.some((event) => event.kind === 'cast')
    }
    if (
        tactic === 'guard' ||
        tactic === 'protect' ||
        tactic === 'wander' ||
        tactic === 'hunt'
    ) {
        const order: SkeletonOrder = orders[tactic]
        const events = room.requestAbility(
            actor,
            {
                type: 'use_ability',
                abilityId: 'ash_order',
                targetId,
                order,
            },
            now
        )
        room.publishEvents(events)
        return events.some(
            (event) => event.kind === 'cast' && event.abilityId === 'ash_order'
        )
    }
    return false
}

function castAshPrayer(
    actor: GameCharacter,
    room: GameRoom,
    intent: PrayerIntent,
    now: number
): boolean {
    if (!necromancerCanPray(actor, room, intent, now)) {
        return false
    }
    actor.clearPath()
    const events = room.requestAbility(
        actor,
        {
            type: 'use_ability',
            abilityId: 'pray_grave',
            intent,
        },
        now
    )
    room.publishEvents(events)
    return events.some(
        (event) => event.kind === 'cast' && event.phase === 'started'
    )
}

export function advanceNecromancerHeartRite(
    actor: GameCharacter,
    room: GameRoom,
    targetId: string,
    now: number
): boolean {
    const chest = room
        .snapshot(now, actor.locationId, actor.id)
        .chests.find((item) => item.id === targetId)
    if (chest === undefined || actor.lichHeartBound) {
        return false
    }
    const navigation = room.navigationFor(actor)
    const bounds = chest.bounds ?? containerBounds(chest.position)
    if (
        chestInteractionDistance(actor.position, chest.position, bounds) >
            CHEST_INTERACTION_RANGE ||
        !chestHasLineOfSight(
            actor.position,
            chest.position,
            navigation,
            CHEST_INTERACTION_RANGE + 1,
            bounds
        )
    ) {
        const approach = interactionApproachPoints(
            actor.position,
            [bounds],
            6
        ).find(
            (point) =>
                navigation.findPathWorld(actor.position, point).length > 0
        )
        return (
            approach !== undefined &&
            moveNecromancer(actor, room, approach, false, now)
        )
    }
    room.publishEvents(
        room.requestAbility(
            actor,
            { type: 'use_ability', abilityId: 'ash_heart', targetId },
            now
        )
    )
    return false
}

export function fightAsNecromancer(
    actor: GameCharacter,
    room: GameRoom,
    target: GameCharacter,
    now: number
): void {
    actor.updateFacing({
        x: target.position.x - actor.position.x,
        y: target.position.y - actor.position.y,
    })
    if (
        isTargetInAttackRange(
            actor,
            target,
            room.navigationFor(actor).grid.tileWidth
        )
    ) {
        actor.clearPath()
        room.requestAttack(actor, now, target.id)
        return
    }
    moveNecromancer(actor, room, target.position, false, now)
}

export function performNecromancerCombatIntent(
    actor: GameCharacter,
    room: GameRoom,
    scene: NecromancerScene,
    threat: GameCharacter,
    plan: NecromancerOption,
    now: number
): boolean {
    if (plan.tactic === 'fight' && plan.targetId === threat.id) {
        fightAsNecromancer(actor, room, threat, now)
        return true
    }
    if (plan.tactic !== 'hunt_slime') {
        return false
    }
    const slime = scene.visible.find(
        (target) =>
            target.id === plan.targetId &&
            target.alive &&
            target.creatureType === 'ooze' &&
            target.faction === 'monsters' &&
            canTargetByFaction(actor, target, now)
    )
    if (slime === undefined) {
        return false
    }
    fightAsNecromancer(actor, room, slime, now)
    return true
}

export function moveNecromancer(
    actor: GameCharacter,
    room: GameRoom,
    point: Vector2,
    stealth: boolean,
    now: number
): boolean {
    const navigation = room.navigationFor(actor)
    const tileWidth = navigation.grid.tileWidth
    if (distance(actor.position, point) <= tileWidth * 0.65) {
        actor.clearPath()
        return false
    }
    const last = actor.remainingPath().at(-1)
    if (last !== undefined && distance(last, point) <= tileWidth * 0.75) {
        return true
    }
    const path = navigation.findPathWorld(actor.position, point)
    if (path.length === 0) {
        return false
    }
    const mode = stealth ? 'sneaking' : 'walking'
    if (actor.movement.mode !== mode) {
        room.publishEvents(
            handleMovementCommand(actor, { type: 'movement_mode', mode }, now)
        )
    }
    actor.setPath(path)
    return true
}

/** Record a clue only after the actor has walked within observation reach. */
export function approachStudyLandmark(
    actor: GameCharacter,
    room: GameRoom,
    landmark: NecromancerLandmark,
    now: number
): boolean {
    const navigation = room.navigationFor(actor)
    if (
        distance(actor.position, landmark.position) <=
            navigation.grid.tileWidth &&
        navigation.hasLineOfSight(actor.position, landmark.position)
    ) {
        actor.clearPath()
        return true
    }
    moveNecromancer(actor, room, landmark.position, false, now)
    return false
}
