import {
    type AttackGeometry,
    type BladeAttackAbilityId,
    type GameEventPayload,
    resolveCombatWeapon,
} from '@my-game-ratata/contracts'

import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import {
    type AttackContext,
    availableToStartAttack,
    isLegalAttackTarget,
} from './combat'
import { startCombatAction } from './combatActions'
import { prepareTarget } from './combatAttackTarget'
import { buildAttackZones, isInZones } from './combatGeometry'
import { constellationModifiers } from './constellationModifiers'
import { effectiveAbility } from './effectiveParameters'
import { legalGraveTarget } from './graveCombat'
import { magicBlocksMovement } from './magicState'
import { distance, facingDirection } from './math'
import { recordPaidResources } from './resourcePractice'

type Parameters = ReturnType<typeof effectiveAbility>
export function attemptBladeTechnique(
    context: AttackContext,
    id: BladeAttackAbilityId
): GameEventPayload[] {
    const { actor, now } = context
    const parameters = effectiveAbility(actor, id, context.tileSize)
    if (
        !techniqueReady(context, id, parameters) ||
        !prepareTarget(context) ||
        !reachableTarget(context, id, parameters.range)
    ) {
        return []
    }
    const before = { energy: actor.energy, mana: actor.mana }
    actor.energy -= parameters.energy
    actor.abilities.availableAt[id] = now + parameters.cooldownMs
    actor.attackZones = buildAttackZones(actor, context.tileSize)
    const axis =
        id === 'circular_swing' && constellationModifiers(actor).bladeCircleAxis
    const event = startCombatAction(
        actor,
        now,
        {
            ...techniqueAttack(context, id, parameters),
            resourceSpends: recordPaidResources(actor, before),
        },
        {
            cycleMs: parameters.cycleMs,
            windupMs: parameters.windupMs,
            movementMs: axis ? parameters.windupMs : parameters.movementMs,
        },
        techniqueGeometry(actor, id, parameters)
    )
    configureTechniqueMovement(actor, id, parameters, now, axis)
    return [event]
}
function techniqueReady(
    { actor, now }: AttackContext,
    id: BladeAttackAbilityId,
    parameters: Parameters
): boolean {
    const weapon = resolveCombatWeapon(actor.archetype, actor.equipment.weapon)
    return (
        availableToStartAttack(actor, now) &&
        (id !== 'lunge' || !magicBlocksMovement(actor, now)) &&
        knowsAbility(actor, id) &&
        weapon.bladeCompatible &&
        !weapon.broken &&
        actor.soul.companion?.canFight !== false &&
        now >= (actor.abilities.availableAt[id] ?? 0) &&
        actor.energy >= parameters.energy
    )
}
function techniqueAttack(
    context: AttackContext,
    id: BladeAttackAbilityId,
    parameters: Parameters
): Omit<PendingAttackHit, 'hitAt'> {
    return {
        targetId: context.targetId,
        target: context.target,
        abilityId: id,
        weaponAttack: true,
        delivery: 'melee_physical',
        canStun: id === 'pommel_strike',
        damageMultiplier: parameters.damageMultiplier ?? 1,
        targetEnergyDrain: parameters.targetEnergyDrain ?? 8,
        ...(id === 'pommel_strike'
            ? { stunDurationMs: parameters.stunMs ?? 400 }
            : {}),
    }
}
function techniqueGeometry(
    actor: GameCharacter,
    id: BladeAttackAbilityId,
    parameters: Parameters
): AttackGeometry {
    const radius = parameters.radius ?? parameters.range
    if (id === 'wide_swing') {
        return {
            kind: 'sector',
            center: { ...actor.position },
            radius,
            direction: facingDirection(actor.facing),
            angleDegrees: parameters.angleDegrees ?? 120,
        }
    }
    if (id === 'circular_swing') {
        return { kind: 'circle', center: { ...actor.position }, radius }
    }
    return { kind: 'rectangles', zones: actor.attackZones }
}
function configureTechniqueMovement(
    actor: GameCharacter,
    id: BladeAttackAbilityId,
    parameters: Parameters,
    now: number,
    axis: boolean
): void {
    if (axis) {
        actor.combat.slowMovementUntil = now + parameters.movementMs
        actor.combat.movementFraction = 0.25
    }
    if (id === 'lunge') {
        actor.combat.lunge = {
            direction: facingDirection(actor.facing),
            startedAt: now,
            endsAt: now + 180,
            distance: parameters.lungeDistance ?? 0,
            moved: 0,
        }
    }
}
function reachableTarget(
    context: AttackContext,
    id: BladeAttackAbilityId,
    range: number
): boolean {
    const { actor } = context
    if (context.target !== undefined) {
        const grave = context.graves?.get(context.target.id)
        return (
            legalGraveTarget(actor, grave, context.navigation) &&
            distance(actor.position, grave.position) <= range
        )
    }
    if (context.targetId === undefined) {
        return true
    }
    const target = context.targets.find(
        (candidate) => candidate.id === context.targetId
    )
    if (target === undefined || !isLegalAttackTarget(actor, target, context)) {
        return false
    }
    return id === 'pommel_strike'
        ? isInZones(target, buildAttackZones(actor, context.tileSize))
        : distance(actor.position, target.position) <= range
}
