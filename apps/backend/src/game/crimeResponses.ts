import {
    type GameEventPayload,
    THEFT_RULES,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import { available, humanControlled } from './crimeRules'
import { distance, normalize } from './math'
import { advancePursuit } from './pursuit'
import { pursuits } from './pursuitState'
import { visibilityRadius } from './queries'
import type { GameRoom } from './room'

export interface CrimeResponse {
    thiefId: string
    locationId: string
    until: number
    mode: 'fight' | 'flee'
    lastKnown: Vector2
    lastPlanAt: number
}

export function fallbackCaughtTheftResponse(
    victim: GameCharacter,
    thief: GameCharacter,
    respond: (mode: CrimeResponse['mode']) => void,
    callGuards: () => GameEventPayload[]
): GameEventPayload[] {
    if (humanControlled(victim)) {
        return []
    }
    const fighter =
        victim.soul.companion?.leaderId !== thief.id &&
        (victim.soul.companion?.canFight ?? victim.faction === 'monsters')
    respond(fighter ? 'fight' : 'flee')
    return victim.soul.canSpeak && !fighter ? callGuards() : []
}

export function advanceCrimeResponse(
    actor: GameCharacter,
    thief: GameCharacter,
    response: CrimeResponse,
    room: GameRoom,
    now: number
): boolean {
    const navigation = room.navigationFor(actor)
    const visible = visibleThief(actor, thief, room, now)
    if (visible) {
        response.lastKnown = { ...thief.position }
    }
    if (response.mode === 'fight') {
        const decision = advancePursuit(
            actor,
            visible ? thief : undefined,
            room,
            now,
            THEFT_RULES.pursuitRadius
        )
        if (!decision.handled && actor.locationId === response.locationId) {
            actor.setPath(
                navigation.findPathWorld(actor.position, response.lastKnown)
            )
        }
        const target = attackableResponseTarget(actor, decision.target)
        if (target !== undefined) {
            actor.updateFacing({
                x: target.position.x - actor.position.x,
                y: target.position.y - actor.position.y,
            })
            if (
                !isTargetInAttackRange(actor, target, navigation.grid.tileWidth)
            ) {
                actor.setPath(
                    navigation.findPathWorld(actor.position, target.position)
                )
                return true
            }
            actor.clearPath()
            actor.setMoveInput({ x: 0, y: 0 })
            room.requestAttack(actor, now, target.id)
        }
        return !decision.handled || pursuits.has(actor)
    }
    if (actor.hasPath() && now - response.lastPlanAt < 500) {
        return true
    }
    const target = escapePoint(actor, response.lastKnown, room)
    actor.setPath(navigation.findPathWorld(actor.position, target))
    response.lastPlanAt = now
    return true
}

function visibleThief(
    actor: GameCharacter,
    thief: GameCharacter,
    room: GameRoom,
    now: number
): boolean {
    return (
        actor.locationId === thief.locationId &&
        distance(actor.position, thief.position) <=
            visibilityRadius(actor, thief, THEFT_RULES.pursuitRadius, now) &&
        room.navigationFor(actor).hasLineOfSight(actor.position, thief.position)
    )
}

export function escapePoint(
    actor: GameCharacter,
    threat: Vector2,
    room: GameRoom
): Vector2 {
    const navigation = room.navigationFor(actor)
    const offset = {
        x: actor.position.x - threat.x,
        y: actor.position.y - threat.y,
    }
    const away =
        offset.x === 0 && offset.y === 0 ? { x: 0, y: 1 } : normalize(offset)
    const directions = [
        away,
        { x: -away.y, y: away.x },
        { x: away.y, y: -away.x },
    ]
    for (const direction of directions) {
        const point = navigation.clampWorld({
            x: actor.position.x + direction.x * 96,
            y: actor.position.y + direction.y * 96,
        })
        if (
            navigation.findPathWorld(actor.position, point).length > 0 &&
            distance(point, threat) > distance(actor.position, threat)
        ) {
            return point
        }
    }
    return actor.position
}

export function advanceReturningResponses(
    returning: Set<string>,
    room: GameRoom,
    all: Map<string, GameCharacter>,
    now: number,
    controlled: Set<string>
): void {
    for (const id of returning) {
        if (controlled.has(id)) {
            continue
        }
        const actor = all.get(id)
        if (
            !available(actor) ||
            humanControlled(actor) ||
            !pursuits.has(actor)
        ) {
            returning.delete(id)
            continue
        }
        if (actor.soul.controlSource === 'model') {
            returning.delete(id)
            pursuits.delete(actor)
            continue
        }
        const target = attackableResponseTarget(
            actor,
            advancePursuit(actor, undefined, room, now).target
        )
        if (pursuits.has(actor)) {
            controlled.add(id)
        }
        if (target !== undefined) {
            actor.clearPath()
            actor.setMoveInput({ x: 0, y: 0 })
            room.requestAttack(actor, now, target.id)
        }
    }
}

function attackableResponseTarget(
    actor: GameCharacter,
    target: GameCharacter | undefined
): GameCharacter | undefined {
    return actor.soul.companion?.leaderId === target?.id ? undefined : target
}
