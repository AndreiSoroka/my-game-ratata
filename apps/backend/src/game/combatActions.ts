import {
    type AttackGeometry,
    type GameEventPayload,
} from '@my-game-ratata/contracts'

import { prepareComboTarget } from './bladeCombo'
import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import { nextCombatActionId } from './combatState'
import { withWorldSound } from './worldSound'

export interface AttackPhases {
    cycleMs: number
    windupMs: number
    movementMs: number
    animationMs?: number
}
export type StartedCombatAction = GameEventPayload & { actionId: string }

export function startCombatAction(
    actor: GameCharacter,
    now: number,
    attack: Omit<PendingAttackHit, 'hitAt'>,
    phases: AttackPhases,
    geometry: AttackGeometry,
    resolution: 'queued' | 'immediate' = 'queued'
): StartedCombatAction {
    prepareComboTarget(actor, attack.targetId)
    delete actor.combat.lunge
    delete actor.combat.slowMovementUntil
    delete actor.combat.movementFraction
    const id = nextCombatActionId(actor)
    const origin =
        attack.origin ?? (attack.abilityId === undefined ? 'basic' : 'ability')
    actor.combat.readyAt = now + phases.cycleMs
    actor.combat.action = {
        id,
        origin,
        ...(attack.abilityId === undefined
            ? {}
            : { abilityId: attack.abilityId }),
        startedAt: now,
        hitAt: now + phases.windupMs,
        readyAt: actor.combat.readyAt,
        movementAt: now + phases.movementMs,
        geometry: structuredClone(geometry),
    }
    if (resolution === 'queued') {
        actor.queueAttackHit(now, {
            ...attack,
            origin,
            actionId: id,
            geometry,
            windupMs: phases.windupMs,
        })
    }
    actor.lastAttackAt = now
    actor.lockAction(now, phases.movementMs)
    actor.setAnimation('attack', now, phases.animationMs ?? phases.cycleMs)
    actor.attackZoneUntil = now + phases.cycleMs
    const event: StartedCombatAction = {
        kind: 'attack',
        actorId: actor.id,
        actionId: id,
        attackOrigin: origin,
        attackGeometry: geometry,
        ...(attack.delivery === undefined ? {} : { delivery: attack.delivery }),
        ...(attack.abilityId === undefined
            ? {}
            : { abilityId: attack.abilityId }),
        ...(attack.targetId === undefined ? {} : { targetId: attack.targetId }),
        ...(attack.target === undefined
            ? {}
            : { target: { ...attack.target } }),
    }
    return attack.delivery === 'melee_physical'
        ? withWorldSound(event, 'attack', actor.locationId, actor.position, {
              sourceActorId: actor.id,
          })
        : event
}
