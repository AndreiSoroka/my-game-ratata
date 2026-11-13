import { THEFT_RULES, type Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import { distance, normalize } from './math'
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

export function advanceCrimeResponse(
    actor: GameCharacter,
    thief: GameCharacter,
    response: CrimeResponse,
    room: GameRoom,
    now: number
): void {
    const navigation = room.navigationFor(actor)
    const visible =
        distance(actor.position, thief.position) <=
            visibilityRadius(actor, thief, THEFT_RULES.pursuitRadius, now) &&
        navigation.hasLineOfSight(actor.position, thief.position)
    if (visible) {
        response.lastKnown = { ...thief.position }
    }
    if (response.mode === 'fight') {
        actor.updateFacing({
            x: response.lastKnown.x - actor.position.x,
            y: response.lastKnown.y - actor.position.y,
        })
        if (
            visible &&
            isTargetInAttackRange(actor, thief, navigation.grid.tileWidth)
        ) {
            actor.clearPath()
            room.requestAttack(actor, now)
            return
        }
    }
    if (actor.hasPath() && now - response.lastPlanAt < 500) {
        return
    }
    const target =
        response.mode === 'fight'
            ? response.lastKnown
            : escapePoint(actor, response.lastKnown, room)
    actor.setPath(navigation.findPathWorld(actor.position, target))
    response.lastPlanAt = now
}

function escapePoint(
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
