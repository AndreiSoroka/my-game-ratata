import {
    ABILITY_DEFINITIONS,
    type AttackAbilityId,
    forwardAbilityAttack,
    forwardShot,
    type GameEventPayload,
    HUMAN_MELEE_RULES,
    isBladeAttackAbility,
    isItemBroken,
} from '@my-game-ratata/contracts'

import { knowsAbility } from './abilityState'
import { prepareComboTarget } from './bladeCombo'
import { attemptBladeTechnique } from './bladeTechniques'
import type { GameCharacter } from './character'
import {
    type AttackContext,
    availableToStartAttack,
    isLegalAttackTarget,
} from './combat'
import { startCombatAction } from './combatActions'
import {
    buildAbilityAttackZones,
    buildAttackZones,
    isInZones,
} from './combatGeometry'
import { consumeRunicShot } from './constellations'
import {
    effectiveAbility,
    effectiveAttackEnergyCost,
    effectiveAttackPhases,
} from './effectiveParameters'
import { legalGraveTarget } from './graveCombat'
import { recordPaidResources } from './resourcePractice'

export function attemptAttack(context: AttackContext): GameEventPayload[] {
    const kind = context.actor.config.basicAttackKind
    if (kind === 'arrow' || kind === 'spark') {
        return attemptAbilityAttack(
            context,
            kind === 'arrow' ? 'shot' : 'spark'
        )
    }
    const { actor, now } = context
    if (brokenWeapon(actor) || !ready(context) || !prepareTarget(context)) {
        return []
    }
    actor.attackZones = buildAttackZones(actor, context.tileSize)
    if (!targetWithinZones(context)) {
        return []
    }
    const before = { energy: actor.energy, mana: actor.mana }
    const spend = actor.spendAttackResources()
    const phases = effectiveAttackPhases(actor, !spend.fullyPowered)
    prepareComboTarget(actor, context.targetId)
    return [
        startCombatAction(
            actor,
            now,
            {
                resourceSpends: recordPaidResources(actor, before),
                targetId: context.targetId,
                target: context.target,
                canStun: spend.canStun,
                weaponAttack: true,
                delivery: 'melee_physical',
                damageMultiplier: spend.fullyPowered ? 1 : 1 / 3,
                underpowered: !spend.fullyPowered,
                targetEnergyDrain:
                    actor.archetype === 'human'
                        ? HUMAN_MELEE_RULES.targetEnergyDrain
                        : Math.ceil(effectiveAttackEnergyCost(actor) / 2),
            },
            phases,
            { kind: 'rectangles', zones: actor.attackZones }
        ),
    ]
}
export function attemptAbilityAttack(
    context: AttackContext,
    id: AttackAbilityId
): GameEventPayload[] {
    if (isBladeAttackAbility(id)) {
        return attemptBladeTechnique(context, id)
    }
    const { actor, now } = context
    const definition = effectiveAbility(actor, id, context.tileSize)
    if (!abilityStartReady(context, id)) {
        return []
    }
    actor.attackZones = buildAbilityAttackZones(actor, id, context.tileSize)
    if (!targetWithinZones(context)) {
        return []
    }
    const before = { energy: actor.energy, mana: actor.mana }
    actor.energy -= definition.energy
    actor.mana -= definition.mana
    actor.abilities.availableAt[id] = now + definition.cooldownMs
    const event = startCombatAction(
        actor,
        now,
        {
            resourceSpends: recordPaidResources(actor, before),
            targetId: context.targetId,
            target: context.target,
            abilityId: id,
            weaponAttack: id === 'skeleton_strike',
            canStun: id === 'skeleton_strike',
            damageMultiplier: id === 'shot' ? consumeRunicShot(actor, now) : 1,
            targetEnergyDrain: Math.ceil(definition.energy / 2),
            delivery:
                id === 'spark'
                    ? 'magic'
                    : id === 'shot'
                      ? 'ranged_physical'
                      : 'melee_physical',
        },
        definition,
        { kind: 'rectangles', zones: actor.attackZones }
    )
    if (projectileWithoutTarget(context, id)) {
        event.projectile = abilityProjectile(actor, id, context.tileSize)
    }
    return [event]
}

function abilityStartReady(
    context: AttackContext,
    id: AttackAbilityId
): boolean {
    return (
        !(id === 'skeleton_strike' && brokenWeapon(context.actor)) &&
        ready(context) &&
        abilityReady(context.actor, id, context.now) &&
        prepareTarget(context)
    )
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
    const definition = effectiveAbility(actor, id)
    return (
        knowsAbility(actor, id) &&
        now >= (actor.abilities.availableAt[id] ?? 0) &&
        actor.energy >= definition.energy &&
        actor.mana >= definition.mana
    )
}
function ready({ actor, now }: AttackContext): boolean {
    return (
        availableToStartAttack(actor, now) &&
        actor.soul.companion?.canFight !== false
    )
}
export function prepareTarget(context: AttackContext): boolean {
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
function projectileWithoutTarget(
    context: AttackContext,
    id: AttackAbilityId
): id is 'shot' | 'spark' {
    return (
        (id === 'shot' || id === 'spark') &&
        context.targetId === undefined &&
        context.target === undefined
    )
}
function abilityProjectile(
    actor: GameCharacter,
    id: 'shot' | 'spark',
    tileWidth: number
) {
    const path =
        id === 'shot'
            ? forwardShot(actor.position, actor.facing)
            : forwardAbilityAttack(actor.position, actor.facing, id)
    const multiplier =
        effectiveAbility(actor, id, tileWidth).range /
        ABILITY_DEFINITIONS[id].range
    return {
        ...path,
        endpoint: {
            x:
                actor.position.x +
                (path.endpoint.x - actor.position.x) * multiplier,
            y:
                actor.position.y +
                (path.endpoint.y - actor.position.y) * multiplier,
        },
    }
}
