import {
    type GameEventPayload,
    resolveCombatWeapon,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import {
    type AttackContext,
    availableToAttack,
    isLegalAttackTarget,
} from './combat'
import { resolveContactBatch } from './combatContacts'
import { buildAttackZones, isInZones } from './combatGeometry'
import { nextCombatActionId } from './combatState'
import { constellationModifiers } from './constellationModifiers'
import { effectiveAttackEnergyCost } from './effectiveParameters'
import { resolveFacing } from './math'
import { recordPaidResources } from './resourcePractice'

export function resolveCounterAttack(
    parent: AttackContext,
    actor: GameCharacter,
    target: GameCharacter
): GameEventPayload[] {
    const now = parent.now
    const cost = effectiveAttackEnergyCost(actor)
    const context = { ...parent, actor, targetId: target.id, target: undefined }
    const facing = resolveFacing(
        {
            x: target.position.x - actor.position.x,
            y: target.position.y - actor.position.y,
        },
        actor.facing
    )
    const zones = buildAttackZones(
        {
            id: actor.id,
            config: actor.config,
            position: actor.position,
            facing,
        },
        parent.tileSize
    )
    if (
        !counterActorReady(actor, now, cost) ||
        !isLegalAttackTarget(actor, target, context) ||
        !isInZones(target, zones)
    ) {
        return []
    }
    const before = { energy: actor.energy, mana: actor.mana }
    actor.energy -= cost
    actor.combat.lastCounterAttackAt = now
    const actionId = nextCombatActionId(actor)
    const attack: PendingAttackHit = {
        actionId,
        origin: 'counter',
        delivery: 'melee_physical',
        weaponAttack: true,
        weaponInstanceId: actor.equipment.weapon?.instanceId,
        targetId: target.id,
        hitAt: now,
        canStun: true,
        damageMultiplier: 1,
        targetEnergyDrain: 8,
        resourceSpends: recordPaidResources(actor, before),
    }
    return [
        {
            kind: 'attack',
            actorId: actor.id,
            targetId: target.id,
            actionId,
            attackOrigin: 'counter',
            delivery: 'melee_physical',
            attackGeometry: { kind: 'rectangles', zones },
        },
        ...resolveContactBatch(context, attack, [target], [], false),
    ]
}
function counterActorReady(
    actor: GameCharacter,
    now: number,
    cost: number
): boolean {
    return (
        constellationModifiers(actor).bladeCounterattack &&
        !actor.combat.defensiveStance &&
        actor.abilities.casting === null &&
        workingBlade(actor) &&
        availableToAttack(actor, now) &&
        actor.soul.companion?.canFight !== false &&
        actor.energy >= cost
    )
}
function workingBlade(actor: GameCharacter): boolean {
    const weapon = resolveCombatWeapon(actor.archetype, actor.equipment.weapon)
    return weapon.bladeCompatible && !weapon.broken
}
