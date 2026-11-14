import {
    ABILITY_DEFINITIONS,
    type AttackAbilityId,
    forwardAbilityAttack,
    forwardShot,
    type GameEventPayload,
    isItemBroken,
} from '@my-game-ratata/contracts'

import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import {
    type AttackContext,
    availableToStartAttack,
    isLegalAttackTarget,
} from './combat'
import {
    buildAbilityAttackZones,
    buildAttackZones,
    isInZones,
} from './combatGeometry'
import { legalGraveTarget } from './graveCombat'

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
        brokenWeapon(actor) ||
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
        target: context.target,
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
        (id === 'skeleton_strike' && brokenWeapon(actor)) ||
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
        target: context.target,
        abilityId: id,
        canStun: id === 'skeleton_strike',
        damageMultiplier: 1,
        targetEnergyDrain: Math.ceil(definition.energy / 2),
        windupMs: definition.windupMs,
    })
    return startAttack(context, Math.max(definition.windupMs, 200), id)
}

function brokenWeapon(actor: GameCharacter): boolean {
    return (
        actor.equipment.weapon !== undefined &&
        isItemBroken(actor.equipment.weapon)
    )
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
        availableToStartAttack(actor, now) &&
        actor.soul.companion?.canFight !== false &&
        now - actor.lastAttackAt >= cooldown
    )
}
function prepareTarget(context: AttackContext): boolean {
    if (context.target !== undefined) {
        const grave = context.graves?.get(context.target.id)
        if (
            context.targetId !== undefined ||
            !legalGraveTarget(context.actor, grave, context.navigation)
        ) {
            return false
        }
        context.actor.updateFacing({
            x: grave.position.x - context.actor.position.x,
            y: grave.position.y - context.actor.position.y,
        })
        return true
    }
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
    if (context.target !== undefined) {
        const grave = context.graves?.get(context.target.id)
        return (
            grave !== undefined && isInZones(grave, context.actor.attackZones)
        )
    }
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
            ...((abilityId === 'shot' || abilityId === 'spark') &&
            context.targetId === undefined &&
            context.target === undefined
                ? {
                      projectile:
                          abilityId === 'shot'
                              ? forwardShot(actor.position, actor.facing)
                              : forwardAbilityAttack(
                                    actor.position,
                                    actor.facing,
                                    abilityId
                                ),
                  }
                : {}),
            ...(context.target === undefined
                ? {}
                : { target: { ...context.target } }),
            ...(context.targetId === undefined
                ? {}
                : { targetId: context.targetId }),
            ...(abilityId === undefined ? {} : { abilityId }),
        },
    ]
}
