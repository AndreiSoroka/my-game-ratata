import {
    CHEST_INTERACTION_RANGE,
    chestInteractionDistance,
    containerBounds,
    interactionApproachPoints,
    type PrayerIntent,
    REVIVE_MANA_COST,
    type SkeletonOrder,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { chestHasLineOfSight } from './chestInteraction'
import { isTargetInAttackRange } from './combat'
import { distance } from './math'
import { handleMovementCommand } from './movementActions'
import type {
    NecromancerLandmark,
    NecromancerOption,
} from './necromancerTactics'
import { validPrayerIntent } from './prayerContext'
import type { GameRoom } from './room'
import { createSpeechEvent } from './speechReceipts'

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

const rites = {
    raise: 'ash_raise',
    gift: 'ash_gift',
    sacrifice: 'ash_sacrifice',
} as const

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
    if (tactic === 'raise' || tactic === 'gift' || tactic === 'sacrifice') {
        const events = room.requestAbility(
            actor,
            {
                type: 'use_ability',
                abilityId: rites[tactic],
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
        return events.some((event) => event.kind === 'chat')
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

export function necromancerOffersHelp(
    actor: GameCharacter,
    room: GameRoom,
    targetId: string | undefined,
    woundedVisitor: string | undefined,
    alreadyHelped: Set<string>
): boolean {
    if (
        targetId === undefined ||
        woundedVisitor !== targetId ||
        alreadyHelped.has(targetId)
    ) {
        return false
    }
    alreadyHelped.add(targetId)
    room.publishEvents([
        createSpeechEvent(
            actor,
            'По ранам вижу, тебе нелегко. Возле старой плиты можно перевести дух.',
            { targetId, audienceIds: [targetId] }
        ),
    ])
    return true
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
