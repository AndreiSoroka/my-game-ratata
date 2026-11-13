import {
    ABILITY_DEFINITIONS,
    type AttackAbilityId,
    type GameEventPayload,
} from '@my-game-ratata/contracts'

import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import {
    type AttackContext,
    availableToAttack,
    isLegalAttackTarget,
} from './combat'
import {
    buildAbilityAttackZones,
    buildAttackZones,
    isInZones,
} from './combatGeometry'

export function attemptAttack(context: AttackContext): GameEventPayload[] {
    const kind = context.actor.config.basicAttackKind
    if (kind === 'arrow' || kind === 'spark') {
        return attemptAbilityAttack(
            context,
            kind === 'arrow' ? 'shot' : 'spark'
        )
    }
    const { actor, now } = context
    if (
        !ready(context, actor.config.combat.attackCooldownMs) ||
        !prepareTarget(context)
    ) {
        return []
    }
    actor.attackZones = buildAttackZones(actor, context.tileSize)
    if (!targetWithinZones(context)) {
        return []
    }
    const spend = actor.spendAttackResources()
    const scale = spend.fullyPowered ? 1 : 2
    const lockMs = actor.config.combat.attackLockMs * scale
    actor.queueAttackHit(now, {
        targetId: context.targetId,
        canStun: spend.canStun,
        damageMultiplier: spend.fullyPowered ? 1 : 1 / 3,
        targetEnergyDrain: Math.ceil(
            actor.config.resources.attackEnergyCost / 2
        ),
        windupMs: actor.config.combat.attackWindupMs * scale,
    })
    return startAttack(context, lockMs)
}
export function attemptAbilityAttack(
    context: AttackContext,
    id: AttackAbilityId
): GameEventPayload[] {
    const { actor, now } = context
    const definition = ABILITY_DEFINITIONS[id]
    if (
        !ready(context, actor.config.combat.attackCooldownMs) ||
        !abilityReady(actor, id, now) ||
        !prepareTarget(context)
    ) {
        return []
    }
    actor.attackZones = buildAbilityAttackZones(actor, id)
    if (!targetWithinZones(context)) {
        return []
    }
    actor.energy -= definition.energy
    actor.mana -= definition.mana
    actor.abilities.availableAt[id] = now + definition.cooldownMs
    actor.queueAttackHit(now, {
        targetId: context.targetId,
        abilityId: id,
        canStun: id === 'skeleton_strike',
        damageMultiplier: 1,
        targetEnergyDrain: Math.ceil(definition.energy / 2),
        windupMs: definition.windupMs,
    })
    return startAttack(context, Math.max(definition.windupMs, 200), id)
}
function abilityReady(
    actor: GameCharacter,
    id: AttackAbilityId,
    now: number
): boolean {
    const definition = ABILITY_DEFINITIONS[id]
    return (
        knowsAbility(actor, id) &&
        now >= (actor.abilities.availableAt[id] ?? 0) &&
        actor.energy >= definition.energy &&
        actor.mana >= definition.mana
    )
}
function ready({ actor, now }: AttackContext, cooldown: number): boolean {
    return (
        availableToAttack(actor, now) &&
        actor.soul.companion?.canFight !== false &&
        !actor.isActionLocked(now) &&
        now - actor.lastAttackAt >= cooldown
    )
}
function prepareTarget(context: AttackContext): boolean {
    if (context.targetId === undefined) {
        return true
    }
    const target = context.targets.find(
        (candidate) => candidate.id === context.targetId
    )
    if (
        target === undefined ||
        !isLegalAttackTarget(context.actor, target, context)
    ) {
        return false
    }
    context.actor.updateFacing({
        x: target.position.x - context.actor.position.x,
        y: target.position.y - context.actor.position.y,
    })
    return true
}
function targetWithinZones(context: AttackContext): boolean {
    if (context.targetId === undefined) {
        return true
    }
    const target = context.targets.find(
        (candidate) => candidate.id === context.targetId
    )
    return target !== undefined && isInZones(target, context.actor.attackZones)
}
function startAttack(
    context: AttackContext,
    lockMs: number,
    abilityId?: AttackAbilityId
): GameEventPayload[] {
    const { actor, now } = context
    actor.lastAttackAt = now
    actor.lockAction(now, lockMs)
    actor.setAnimation('attack', now, lockMs)
    actor.attackZoneUntil = now + lockMs
    return [
        {
            actorId: actor.id,
            kind: 'attack',
            ...(context.targetId === undefined
                ? {}
                : { targetId: context.targetId }),
            ...(abilityId === undefined ? {} : { abilityId }),
        },
    ]
}
