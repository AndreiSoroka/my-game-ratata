import {
    type AttackAbilityId,
    type AttackGeometry,
    forwardAbilityAttack,
    forwardShot,
    type GameEventPayload,
    HUMAN_MELEE_RULES,
    isArrowAbility,
    isBladeAttackAbility,
    isItemBroken,
} from '@my-game-ratata/contracts'

import { knowsAbility } from './abilityState'
import { prepareComboTarget } from './bladeCombo'
import { attemptBladeTechnique } from './bladeTechniques'
import type { GameCharacter } from './character'
import type { ArrowAttack } from './characterState'
import { type AttackContext, availableToStartAttack } from './combat'
import { startCombatAction } from './combatActions'
import {
    canAimSniperAt,
    isPhasedArrow,
    sniperAttackGeometry,
    startArrowAttack,
} from './combatArchery'
import { prepareTarget, targetWithinZones } from './combatAttackTarget'
import {
    buildAbilityAttackZones,
    buildAttackZones,
    isInAttackGeometry,
} from './combatGeometry'
import { consumeRunicShot } from './constellations'
import {
    effectiveAbility,
    effectiveAttackEnergyCost,
    effectiveAttackPhases,
} from './effectiveParameters'
import { zeroVector } from './math'
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
    const { actor } = context
    const definition = effectiveAbility(actor, id, context.tileSize)
    const selected = context.targets.find(
        (target) => target.id === context.targetId
    )
    if (
        !canStartArrow(context, id, selected) ||
        !abilityStartReady(context, id)
    ) {
        return []
    }
    const geometry = prepareAbilityGeometry(
        context,
        id,
        definition.range,
        selected
    )
    if (geometry === undefined) {
        return []
    }
    const arrow = isArrowAbility(id)
        ? startArrowAttack(
              context,
              id,
              definition.range,
              id === 'shot' && definition.movementMs === 0,
              selected
          )
        : undefined
    return [payAbilityAttack(context, id, definition, geometry, arrow)]
}

function prepareAbilityGeometry(
    context: AttackContext,
    id: AttackAbilityId,
    range: number,
    selected: GameCharacter | undefined
): AttackGeometry | undefined {
    const { actor, tileSize } = context
    if (id === 'sniper_shot') {
        const geometry = sniperAttackGeometry(actor.position, range)
        actor.attackZones = []
        return selected !== undefined &&
            isInAttackGeometry(selected.position, geometry)
            ? geometry
            : undefined
    }
    const zones = buildAbilityAttackZones(actor, id, tileSize)
    actor.attackZones = zones
    return targetWithinZones(context)
        ? { kind: 'rectangles', zones }
        : undefined
}

function payAbilityAttack(
    context: AttackContext,
    id: AttackAbilityId,
    definition: ReturnType<typeof effectiveAbility>,
    geometry: AttackGeometry,
    arrow: ArrowAttack | undefined
): GameEventPayload {
    const { actor, now } = context
    const phased = isPhasedArrow(arrow)
    const before = { energy: actor.energy, mana: actor.mana }
    actor.energy -= definition.energy
    actor.mana -= definition.mana
    actor.abilities.availableAt[id] = now + definition.cooldownMs
    if (id === 'sniper_shot') {
        actor.clearPath()
        actor.setMoveInput(zeroVector())
        actor.velocity = zeroVector()
    }
    const event = startCombatAction(
        actor,
        now,
        {
            resourceSpends: recordPaidResources(actor, before),
            targetId: context.targetId,
            target: context.target,
            ...(arrow === undefined ? {} : { arrow }),
            abilityId: id,
            weaponAttack: id === 'skeleton_strike',
            canStun: id === 'skeleton_strike',
            damageMultiplier: id === 'shot' ? consumeRunicShot(actor, now) : 1,
            targetEnergyDrain: Math.ceil(definition.energy / 2),
            delivery:
                id === 'spark'
                    ? 'magic'
                    : isArrowAbility(id)
                      ? 'ranged_physical'
                      : 'melee_physical',
        },
        phased
            ? { ...definition, animationMs: definition.windupMs }
            : definition,
        geometry
    )
    if (phased) {
        event.phase = 'started'
        event.durationMs = definition.windupMs
    } else if (projectileWithoutTarget(context, id)) {
        event.projectile =
            id === 'shot'
                ? forwardShot(actor.position, actor.facing, definition.range)
                : forwardAbilityAttack(
                      actor.position,
                      actor.facing,
                      id,
                      definition.range
                  )
    }
    return event
}

function canStartArrow(
    context: AttackContext,
    id: AttackAbilityId,
    selected: GameCharacter | undefined
): boolean {
    const { actor, now } = context
    if (isArrowAbility(id) && actor.movement.dashUntil > now) {
        return false
    }
    if (id !== 'sniper_shot') {
        return true
    }
    return (
        context.target === undefined &&
        selected !== undefined &&
        canAimSniperAt(context, selected)
    )
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
