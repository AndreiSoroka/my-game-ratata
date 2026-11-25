import {
    forwardShot,
    type GameEventPayload,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { ArrowAttack, PendingAttackHit } from './characterState'
import type { AttackContext } from './combat'
import { arrowPhaseEvent } from './combatArchery'
import { sparkPhaseEvent } from './combatInterruption'
import { withWorldSound } from './worldSound'

export function releaseAttackProjectiles(
    context: AttackContext,
    attack: PendingAttackHit,
    contact: { position: Vector2 } | undefined
): GameEventPayload[] {
    return attack.sparkPath === undefined
        ? arrowReleaseEvents(context, attack, contact)
        : [releaseSpark(context, attack, attack.sparkPath, contact?.position)]
}
function releaseSpark(
    { actor, navigation }: AttackContext,
    attack: PendingAttackHit,
    path: NonNullable<PendingAttackHit['sparkPath']>,
    contact: Vector2 | undefined
): GameEventPayload {
    const aim = contact ?? path.endpoint
    const endpoint = navigation?.visibleLineEndpoint(path.origin, aim) ?? aim
    return {
        ...sparkPhaseEvent(actor, attack, 'completed'),
        projectile: { ...path, endpoint: { ...endpoint } },
    }
}

function arrowReleaseEvents(
    context: AttackContext,
    attack: PendingAttackHit,
    target: { position: Vector2 } | undefined
): GameEventPayload[] {
    const { actor, navigation } = context
    const path = arrowReleasePath(actor, attack, target)
    if (path === undefined) {
        return []
    }
    const { origin, aim } = path
    const endpoint = navigation?.visibleLineEndpoint(origin, aim) ?? aim
    return [
        withWorldSound(
            {
                ...arrowPhaseEvent(actor, attack, 'completed'),
                projectile: { origin, endpoint: { ...endpoint } },
            },
            'attack',
            actor.locationId,
            origin,
            { sourceActorId: actor.id }
        ),
    ]
}

export function arrowReleasePath(
    actor: GameCharacter,
    { arrow }: PendingAttackHit,
    target: { position: Vector2 } | undefined
): { origin: Vector2; aim: Vector2 } | undefined {
    if (arrow === undefined) {
        return undefined
    }
    const origin = arrow.mobile ? { ...actor.position } : arrow.origin
    const aim =
        arrow.abilityId === 'shot'
            ? quickShotAim(arrow, origin, target?.position)
            : (target?.position ?? arrow.aim)
    return { origin, aim }
}

function quickShotAim(
    arrow: ArrowAttack,
    origin: Vector2,
    target: Vector2 | undefined
): Vector2 {
    const { endpoint } = forwardShot(origin, arrow.facing, arrow.range)
    if (target === undefined) {
        return endpoint
    }
    return {
        x: endpoint.x === origin.x ? origin.x : target.x,
        y: endpoint.y === origin.y ? origin.y : target.y,
    }
}
